import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import type KonvaType from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { generatePieceLayout, renderPiece, calcPieceSize, type PieceData } from './pieces'

interface Props {
  imageSrc: string
  cols: number
  rows: number
  zoomStep: number
  resolution: number
  panStep: number
  theme: 'light' | 'dark'
  accentColor: string
  onReset: () => void
  onOpenSettings: () => void
  onToggleTheme: () => void
}

const SNAP_THRESHOLD = 30

export default function PuzzleBoard({ imageSrc, cols: COLS, rows: ROWS, zoomStep, resolution, panStep, theme, accentColor, onReset, onOpenSettings, onToggleTheme }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [solved, setSolved] = useState(false)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [pieceSize, setPieceSize] = useState({ pw: 120, ph: 120, padding: 20 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loadingSteps, setLoadingSteps] = useState<{ label: string; done: boolean; detail?: string }[]>([])
  const stageRef = useRef<KonvaType.Stage>(null)
  const nodeRefs = useRef<Record<string, KonvaType.Image>>({})
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const isPanning = useRef(false)
  const panAnchor = useRef({ x: 0, y: 0 })
  const initialFit = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null)
  const groupsRef = useRef(groups)
  const piecesRef = useRef(pieces)

  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { piecesRef.current = pieces }, [pieces])

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = async () => {
      setGroups({})
      setSolved(false)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      initialFit.current = null
      setPieces([])

      const total = COLS * ROWS

      setLoadingSteps([
        { label: 'Calculating layout', done: false },
        { label: `Cutting pieces (0 / ${total})`, done: false },
      ])

      await new Promise(r => requestAnimationFrame(r))

      // Step 1: fast layout
      const ps = calcPieceSize(img, COLS, ROWS, size.width, size.height)
      setPieceSize(ps)
      const { pieces: layouts, pw, ph, padding } = generatePieceLayout(img, COLS, ROWS, size.width, size.height)

      setLoadingSteps([
        { label: 'Calculating layout', done: true },
        { label: `Cutting pieces (0 / ${total})`, done: false },
      ])
      await new Promise(r => requestAnimationFrame(r))

      // Step 2: render canvases in chunks
      const CHUNK = 20
      const rendered: PieceData[] = []
      let lastUpdate = Date.now()

      for (let i = 0; i < layouts.length; i += CHUNK) {
        for (const layout of layouts.slice(i, i + CHUNK)) {
          const { canvas, displayW, displayH } = renderPiece(layout, img, COLS, ROWS, pw, ph, padding, resolution)
          rendered.push({ ...layout, canvas, displayW, displayH })
        }
        const done = Math.min(i + CHUNK, total)
        const now = Date.now()
        if (now - lastUpdate >= 250 || done === total) {
          setLoadingSteps([
            { label: 'Calculating layout', done: true },
            { label: `Cutting pieces (${done} / ${total})`, done: done === total },
          ])
          lastUpdate = now
          await new Promise(r => setTimeout(r, 0))
        }
      }

      setPieces(rendered)
      setLoadingSteps([])
      fitAll(rendered, ps)
    }
  }, [imageSrc])

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const key = e.key.toLowerCase()
      if (key === 'e') {
        const newZoom = Math.min(zoomRef.current * zoomStep, 8)
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const mouseX = (cx - panRef.current.x) / zoomRef.current
        const mouseY = (cy - panRef.current.y) / zoomRef.current
        setZoom(newZoom)
        setPan({ x: cx - mouseX * newZoom, y: cy - mouseY * newZoom })
      } else if (key === 'q') {
        const newZoom = Math.max(zoomRef.current / zoomStep, 0.25)
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const mouseX = (cx - panRef.current.x) / zoomRef.current
        const mouseY = (cy - panRef.current.y) / zoomRef.current
        setZoom(newZoom)
        setPan({ x: cx - mouseX * newZoom, y: cy - mouseY * newZoom })
      } else if (key === 'r') {
        resetToInitialFit()
      } else if (['w', 'a', 's', 'd'].includes(key)) {
        const delta = {
          w: { x: 0, y: panStep },
          s: { x: 0, y: -panStep },
          a: { x: panStep, y: 0 },
          d: { x: -panStep, y: 0 },
        }[key]!
        const newPan = { x: panRef.current.x + delta.x, y: panRef.current.y + delta.y }
        setPan(newPan)
        panRef.current = newPan
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function getGroupIds(id: string, currentGroups: Record<string, string>, currentPieces: PieceData[]) {
    const groupId = currentGroups[id]
    if (!groupId) return [id]
    return currentPieces.filter(p => currentGroups[p.id] === groupId).map(p => p.id)
  }

  function correctPos(col: number, row: number) {
    const { pw, ph } = pieceSize
    const originX = (size.width - COLS * pw) / 2
    const originY = (size.height - ROWS * ph) / 2
    return {
      cx: originX + col * pw - pieceSize.padding,
      cy: originY + row * ph - pieceSize.padding,
    }
  }

  function handleDragStart(id: string, x: number, y: number) {
    lastPos.current = { x, y }
    // bring group to front in state (z-order)
    setPieces(prev => {
      const groupIds = getGroupIds(id, groupsRef.current, prev)
      const others = prev.filter(p => !groupIds.includes(p.id))
      const inGroup = prev.filter(p => groupIds.includes(p.id))
      return [...others, ...inGroup]
    })
  }

  // Move group members imperatively — no React state, no lag
  function handleDragMove(id: string, x: number, y: number) {
    if (!lastPos.current) return
    const dx = x - lastPos.current.x
    const dy = y - lastPos.current.y
    lastPos.current = { x, y }

    const groupIds = getGroupIds(id, groupsRef.current, piecesRef.current)
    groupIds.forEach(gid => {
      if (gid === id) return
      const node = nodeRefs.current[gid]
      if (node) {
        node.x(node.x() + dx)
        node.y(node.y() + dy)
      }
    })
  }

  function handleDragEnd(id: string, finalX: number, finalY: number) {
    lastPos.current = null
    const currentGroups = groupsRef.current

    // read actual node positions (imperatively updated during drag)
    setPieces(prevPieces => {
      const groupIds = getGroupIds(id, currentGroups, prevPieces)

      // sync all node positions into state
      let next = prevPieces.map(p => {
        const node = nodeRefs.current[p.id]
        if (node && groupIds.includes(p.id)) {
          return { ...p, x: node.x(), y: node.y() }
        }
        return p
      })

      const dragged = next.find(p => p.id === id)!
      let newGroups = { ...currentGroups }
      let snapped = false

      // snap to direct neighbour
      for (const other of next) {
        if (groupIds.includes(other.id)) continue
        const colDiff = Math.abs(other.col - dragged.col)
        const rowDiff = Math.abs(other.row - dragged.row)
        if (!((colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1))) continue

        const expectedDx = (other.col - dragged.col) * pieceSize.pw
        const expectedDy = (other.row - dragged.row) * pieceSize.ph
        const offX = Math.abs((other.x - dragged.x) - expectedDx)
        const offY = Math.abs((other.y - dragged.y) - expectedDy)

        if (offX < SNAP_THRESHOLD && offY < SNAP_THRESHOLD) {
          const shiftX = (other.x - expectedDx) - dragged.x
          const shiftY = (other.y - expectedDy) - dragged.y
          next = next.map(p =>
            groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
          )
          const newGroupId = newGroups[other.id] ?? other.id
          groupIds.forEach(pid => { newGroups[pid] = newGroupId })
          newGroups[other.id] = newGroupId
          getGroupIds(other.id, currentGroups, prevPieces).forEach(pid => { newGroups[pid] = newGroupId })
          snapped = true
          break
        }
      }

      // snap to grid — check any piece in the group
      if (!snapped) {
        for (const gid of groupIds) {
          const gp = next.find(p => p.id === gid)!
          const { cx, cy } = correctPos(gp.col, gp.row)
          if (Math.abs(gp.x - cx) < SNAP_THRESHOLD * 2 && Math.abs(gp.y - cy) < SNAP_THRESHOLD * 2) {
            const shiftX = cx - gp.x
            const shiftY = cy - gp.y
            next = next.map(p =>
              groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
            )
            break
          }
        }
      }

      // lock pieces in correct position
      next = next.map(p => {
        const { cx, cy } = correctPos(p.col, p.row)
        return Math.abs(p.x - cx) < 2 && Math.abs(p.y - cy) < 2 ? { ...p, locked: true } : p
      })

      // sync final positions back to nodes
      next.forEach(p => {
        const node = nodeRefs.current[p.id]
        if (node) { node.x(p.x); node.y(p.y) }
      })

      setGroups(newGroups)
      if (next.every(p => p.locked)) setSolved(true)
      return next
    })
  }

  const originX = (size.width - COLS * pieceSize.pw) / 2
  const originY = (size.height - ROWS * pieceSize.ph) / 2

  function fitAll(allPieces: PieceData[], ps = pieceSize) {
    if (allPieces.length === 0) return
    const fw = COLS * ps.pw
    const fh = ROWS * ps.ph
    const ox = (size.width - fw) / 2
    const oy = (size.height - fh) / 2

    let minX = ox, minY = oy, maxX = ox + fw, maxY = oy + fh
    for (const p of allPieces) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + p.displayW)
      maxY = Math.max(maxY, p.y + p.displayH)
    }

    const pad = 40
    const fitZoom = Math.min(
      (size.width - pad * 2) / (maxX - minX),
      (size.height - pad * 2) / (maxY - minY),
      1
    )
    const fitPan = {
      x: (size.width - (maxX - minX) * fitZoom) / 2 - minX * fitZoom,
      y: (size.height - (maxY - minY) * fitZoom) / 2 - minY * fitZoom,
    }
    setZoom(fitZoom)
    setPan(fitPan)
    zoomRef.current = fitZoom
    panRef.current = fitPan
    if (!initialFit.current) initialFit.current = { zoom: fitZoom, pan: fitPan }
  }

  function resetToInitialFit() {
    const f = initialFit.current
    if (!f) return
    setZoom(f.zoom)
    setPan(f.pan)
    zoomRef.current = f.zoom
    panRef.current = f.pan
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const factor = e.evt.deltaY < 0 ? zoomStep : 1 / zoomStep
    const newZoom = Math.min(Math.max(zoomRef.current * factor, 0.25), 8)
    const mouseX = (pointer.x - panRef.current.x) / zoomRef.current
    const mouseY = (pointer.y - panRef.current.y) / zoomRef.current
    const newPan = { x: pointer.x - mouseX * newZoom, y: pointer.y - mouseY * newZoom }
    setZoom(newZoom)
    setPan(newPan)
    zoomRef.current = newZoom
    panRef.current = newPan
  }

  function handleStageMouseDown(e: KonvaEventObject<MouseEvent>) {
    const isPiece = Object.values(nodeRefs.current).includes(e.target as KonvaType.Image)
    if (isPiece) return
    isPanning.current = true
    panAnchor.current = {
      x: e.evt.clientX - panRef.current.x,
      y: e.evt.clientY - panRef.current.y,
    }
  }

  function handleStageMouseMove(e: KonvaEventObject<MouseEvent>) {
    if (!isPanning.current) return
    const newPan = {
      x: e.evt.clientX - panAnchor.current.x,
      y: e.evt.clientY - panAnchor.current.y,
    }
    setPan(newPan)
    panRef.current = newPan
  }

  function handleStageMouseUp() {
    isPanning.current = false
  }

  return (
    <div style={{ position: 'relative', background: theme === 'dark' ? '#18181b' : '#e8e8e2', width: '100vw', height: '100vh' }}>
      {loadingSteps.length > 0 && (
        <div className="loading-overlay">
          <div className="loading-box">
            {loadingSteps.map((step, i) => (
              <div key={i} className={`loading-step${step.done ? ' loading-step--done' : ''}`}>
                <span className="loading-step-icon">{step.done ? '✓' : '○'}</span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="toolbar">
        <button className="top-settings-btn" onClick={onReset}>New puzzle</button>
        <button className="top-settings-btn" onClick={resetToInitialFit}>Reset zoom</button>
      </div>

      <div className="puzzle-top-right">
        <div className="theme-toggle-wrap" onClick={onToggleTheme} role="button" aria-label="Toggle theme">
          <span className="theme-label">{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          <div className={`toggle-track${theme === 'dark' ? ' toggle-track--on' : ''}`}>
            <span className="toggle-icon toggle-icon--sun">☀️</span>
            <span className="toggle-icon toggle-icon--moon">🌙</span>
            <div className="toggle-thumb" />
          </div>
        </div>
        <button className="top-settings-btn" onClick={onOpenSettings}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>

      <div className="toolbar-bottom">
        <div className="hotkey-menu">
          <span><kbd>Q</kbd> Zoom out</span>
          <span><kbd>E</kbd> Zoom in</span>
          <span><kbd>R</kbd> Reset zoom</span>
          <span><kbd>Scroll</kbd> Zoom to cursor</span>
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Pan</span>
          <span><kbd>Drag</kbd> Pan</span>
        </div>
      </div>
      {solved && <div className="solved-banner">Puzzle complete!</div>}

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={zoom}
        scaleY={zoom}
        x={pan.x}
        y={pan.y}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'default' }}
      >
        <Layer>
          <Rect
            x={originX}
            y={originY}
            width={COLS * pieceSize.pw}
            height={ROWS * pieceSize.ph}
            stroke={theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)'}
            strokeWidth={1}
            fill={theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}
          />
        </Layer>
        <Layer>
          {pieces.filter(p => p.locked).map(p => (
            <KonvaImage
              key={p.id}
              ref={node => { if (node) nodeRefs.current[p.id] = node }}
              image={p.canvas}
              x={p.x}
              y={p.y}
              width={p.displayW}
              height={p.displayH}
              draggable={false}
            />
          ))}
        </Layer>
        <Layer>
          {pieces.filter(p => !p.locked).map(p => (
            <KonvaImage
              key={p.id}
              ref={node => { if (node) nodeRefs.current[p.id] = node }}
              image={p.canvas}
              x={p.x}
              y={p.y}
              width={p.displayW}
              height={p.displayH}
              draggable
              onDragStart={e => handleDragStart(p.id, e.target.x(), e.target.y())}
              onDragMove={e => handleDragMove(p.id, e.target.x(), e.target.y())}
              onDragEnd={e => handleDragEnd(p.id, e.target.x(), e.target.y())}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
