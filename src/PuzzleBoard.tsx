import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import type KonvaType from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { generatePieceLayout, renderPiece, calcPieceSize, type PieceData } from './pieces'
import type { ProgressMode } from './SettingsModal'
import Fireworks from './animations/Fireworks'

interface Props {
  imageSrc: string
  cols: number
  rows: number
  zoomStep: number
  resolution: number
  panStep: number
  knobSize: number
  pieceStyle: string
  pieceSpacing: number
  progressMode: ProgressMode
  progressPercent: boolean
  theme: 'light' | 'dark'
  accentColor: string
  onReset: () => void
  onOpenSettings: () => void
  onToggleTheme: () => void
  onPieceMoved: () => void
}

const SNAP_THRESHOLD = 30

function formatProgress(locked: number, total: number, mode: ProgressMode, showPct: boolean): string {
  if (mode === 'off' || total === 0) return ''
  const pct = Math.round((locked / total) * 100)
  if (mode === 'percent') return `${pct}%`
  const pctStr = showPct ? ` (${pct}%)` : ''
  if (mode === 'count') return `${locked}${pctStr}`
  return `${locked}/${total}${pctStr}`
}

export default function PuzzleBoard({ imageSrc, cols: COLS, rows: ROWS, zoomStep, resolution, panStep, knobSize, pieceStyle, pieceSpacing, progressMode, progressPercent, theme, accentColor, onReset, onOpenSettings, onToggleTheme, onPieceMoved }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [solved, setSolved] = useState(false)
  const [fireworksDark, setFireworksDark] = useState(false)
  const [fireworksReturning, setFireworksReturning] = useState(false)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [pieceSize, setPieceSize] = useState({ pw: 120, ph: 120, padding: 20 })
  // Where the assembled puzzle sits, fixed in world space when the layout is
  // generated. Anchoring it here means resizing the window only moves the
  // viewport, so the frame and the pieces never drift apart.
  const [layoutOrigin, setLayoutOrigin] = useState({ x: 0, y: 0 })
  const layoutOriginRef = useRef(layoutOrigin)
  useEffect(() => { layoutOriginRef.current = layoutOrigin }, [layoutOrigin])
  // The window size at the moment the layout was generated. Piece sizing stays
  // tied to this, so later window resizes do not reshape the existing puzzle.
  const genSizeRef = useRef({ width: window.innerWidth, height: window.innerHeight })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loadingSteps, setLoadingSteps] = useState<{ label: string; done: boolean; detail?: string }[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const stageRef = useRef<KonvaType.Stage>(null)
  const nodeRefs = useRef<Record<string, KonvaType.Image>>({})
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const isPanning = useRef(false)
  const panAnchor = useRef({ x: 0, y: 0 })
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const layoutRef = useRef<Omit<PieceData, 'canvas' | 'displayW' | 'displayH'>[]>([])
  const pieceSizeRef = useRef({ pw: 120, ph: 120, padding: 20 })
  const groupsRef = useRef(groups)
  const piecesRef = useRef(pieces)

  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { piecesRef.current = pieces }, [pieces])

  // Reposition unlocked pieces when piece spacing changes mid-puzzle
  useEffect(() => {
    const img = sourceImageRef.current
    if (!img || pieces.length === 0) return
    const { pieces: newLayouts } = generatePieceLayout(img, COLS, ROWS, genSizeRef.current.width, genSizeRef.current.height, knobSize, pieceSpacing)
    setPieces(prev => prev.map(p => {
      if (p.locked) return p
      const layout = newLayouts.find(l => l.id === p.id)
      if (!layout) return p
      return { ...p, x: layout.x, y: layout.y }
    }))
  }, [pieceSpacing])

  // Re-render piece canvases when knobSize or pieceStyle changes mid-puzzle
  useEffect(() => {
    const img = sourceImageRef.current
    const layouts = layoutRef.current
    if (!img || layouts.length === 0) return
    // Recalculate padding since it depends on knobSize. Use the generation-time
    // size so the existing layout keeps its proportions.
    const ps = calcPieceSize(img, COLS, ROWS, genSizeRef.current.width, genSizeRef.current.height, knobSize)
    pieceSizeRef.current = ps
    setPieceSize(ps)
    const { pw, ph, padding } = ps
    setPieces(prev => prev.map(p => {
      const layout = layouts.find(l => l.id === p.id)
      if (!layout) return p
      const { canvas, displayW, displayH } = renderPiece(layout, img, COLS, ROWS, pw, ph, padding, resolution, pieceStyle, knobSize)
      return { ...p, canvas, displayW, displayH }
    }))
  }, [knobSize, pieceStyle])

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = async () => {
      setGroups({})
      setSolved(false)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setPieces([])

      const total = COLS * ROWS

      setLoadingSteps([
        { label: 'Calculating layout', done: false },
        { label: `Cutting pieces (0 / ${total})`, done: false },
      ])

      await new Promise(r => requestAnimationFrame(r))

      // Step 1: fast layout
      sourceImageRef.current = img
      const ps = calcPieceSize(img, COLS, ROWS, size.width, size.height, knobSize)
      setPieceSize(ps)
      pieceSizeRef.current = ps
      genSizeRef.current = { width: size.width, height: size.height }
      setLayoutOrigin({
        x: (size.width - COLS * ps.pw) / 2,
        y: (size.height - ROWS * ps.ph) / 2,
      })
      const { pieces: layouts, pw, ph, padding } = generatePieceLayout(img, COLS, ROWS, size.width, size.height, knobSize, pieceSpacing)
      layoutRef.current = layouts

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
          const { canvas, displayW, displayH } = renderPiece(layout, img, COLS, ROWS, pw, ph, padding, resolution, pieceStyle, knobSize)
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
      if (e.key === 'Tab') { e.preventDefault(); if (!e.repeat) setShowPreview(v => !v); return }
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
    return {
      cx: layoutOrigin.x + col * pw - pieceSize.padding,
      cy: layoutOrigin.y + row * ph - pieceSize.padding,
    }
  }

  function handleDragStart(id: string, x: number, y: number) {
    lastPos.current = { x, y }
    onPieceMoved()
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
      if (next.every(p => p.locked)) { setSolved(true); setFireworksDark(true) }
      return next
    })
  }

  const originX = layoutOrigin.x
  const originY = layoutOrigin.y

  const lockedCount = pieces.filter(p => p.locked).length
  const totalCount = pieces.length
  const progressText = formatProgress(lockedCount, totalCount, progressMode, progressPercent)

  function fitAll(allPieces: PieceData[], ps = pieceSizeRef.current) {
    if (allPieces.length === 0) return
    // Read the live viewport and origin so this works even from the keyboard
    // handler, which is bound once and would otherwise see stale values.
    const vw = window.innerWidth
    const vh = window.innerHeight
    const fw = COLS * ps.pw
    const fh = ROWS * ps.ph
    const ox = layoutOriginRef.current.x
    const oy = layoutOriginRef.current.y

    let minX = ox, minY = oy, maxX = ox + fw, maxY = oy + fh
    for (const p of allPieces) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + p.displayW)
      maxY = Math.max(maxY, p.y + p.displayH)
    }

    const pad = 40
    const fitZoom = Math.min(
      (vw - pad * 2) / (maxX - minX),
      (vh - pad * 2) / (maxY - minY),
      1
    )
    const fitPan = {
      x: (vw - (maxX - minX) * fitZoom) / 2 - minX * fitZoom,
      y: (vh - (maxY - minY) * fitZoom) / 2 - minY * fitZoom,
    }
    setZoom(fitZoom)
    setPan(fitPan)
    zoomRef.current = fitZoom
    panRef.current = fitPan
  }

  function resetToInitialFit() {
    // Recompute the fit against the current window so the board lands centred
    // whatever the window size is now, not the size it had when generated.
    fitAll(piecesRef.current)
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
    <div
      className="puzzle-canvas"
      style={{
        background: fireworksDark ? '#000' : (theme === 'dark' ? '#18181b' : '#e8e8e2'),
        transition: (fireworksDark || fireworksReturning) ? 'background 3000ms ease-in-out' : 'background 0.3s',
      }}
    >
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
      {/* Upper left: menu button + dropdown */}
      <div className={['puzzle-menu-wrap', fireworksDark ? 'fireworks-mode' : '', fireworksReturning ? 'fireworks-returning' : ''].filter(Boolean).join(' ')}>
        <button className="puzzle-menu-btn" onClick={() => setMenuOpen(o => !o)}>
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
        {progressText && !menuOpen && (
          <div className="progress-counter">{progressText}</div>
        )}

        {menuOpen && (
          <>
            <div className="puzzle-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="puzzle-dropdown">
              {progressText && (
                <>
                  <div className="dropdown-progress">{progressText}</div>
                  <div className="dropdown-divider" />
                </>
              )}
              <button className="dropdown-item dropdown-item--keyed" onClick={() => { resetToInitialFit(); setMenuOpen(false) }}>
                <span>Reset zoom</span><kbd>R</kbd>
              </button>
              <button className="dropdown-item dropdown-item--keyed" onClick={() => { setShowPreview(v => !v); setMenuOpen(false) }}>
                <span>{showPreview ? 'Hide preview' : 'Show preview'}</span><kbd>Tab</kbd>
              </button>
              <button className="dropdown-item" onClick={() => { onOpenSettings(); setMenuOpen(false) }}>
                Settings
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item dropdown-item--danger" onClick={() => { setConfirmLeave(true); setMenuOpen(false) }}>
                Back to front page
              </button>
              <div className="dropdown-divider" />
              <div className="dropdown-hotkeys">
                <span><kbd>Q</kbd> Zoom out</span>
                <span><kbd>E</kbd> Zoom in</span>
                <span><kbd>R</kbd> Reset zoom</span>
                <span><kbd>Scroll</kbd> Zoom to cursor</span>
                <span><kbd>WASD</kbd> Pan</span>
                <span><kbd>Drag</kbd> Pan</span>
                <span><kbd>Tab</kbd> Preview image</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upper right: theme toggle only */}
      <div className="puzzle-top-right">
        <div className="theme-toggle-wrap" onClick={onToggleTheme} role="button" aria-label="Toggle theme">
          <span className="theme-label">{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          <div className={`toggle-track${theme === 'dark' ? ' toggle-track--on' : ''}`}>
            <span className="toggle-icon toggle-icon--sun">☀️</span>
            <span className="toggle-icon toggle-icon--moon">🌙</span>
            <div className="toggle-thumb" />
          </div>
        </div>
      </div>

      {/* Confirm leave dialog */}
      {confirmLeave && (
        <div className="confirm-backdrop" onClick={() => setConfirmLeave(false)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <p className="confirm-text">Leave this puzzle? Your progress will be lost.</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn--cancel" onClick={() => setConfirmLeave(false)}>Keep playing</button>
              <button className="confirm-btn confirm-btn--danger" onClick={onReset}>Leave</button>
            </div>
          </div>
        </div>
      )}
      {solved && (
        <Fireworks
          onFadeOutStart={() => {
            setFireworksDark(false)
            setFireworksReturning(true)
            setTimeout(() => {
              setSolved(false)
              setFireworksReturning(false)
            }, 3000)
          }}
        />
      )}

      <div
        className="preview-overlay"
        style={{ opacity: showPreview ? 1 : 0, pointerEvents: showPreview ? 'auto' : 'none' }}
        onClick={() => setShowPreview(false)}
      >
        <img
          className="preview-image"
          src={imageSrc}
          alt="Preview"
          onClick={e => e.stopPropagation()}
        />
      </div>

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
          />
        </Layer>
        <Layer>
          {pieces.filter(p => p.locked).map(p => (
            <KonvaImage
              key={p.id}
              ref={node => { if (!node) delete nodeRefs.current[p.id] }}
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
