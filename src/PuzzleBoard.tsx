import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import type KonvaType from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { generatePieceLayout, renderPiece, calcPieceSize, renderPieceOutline, type PieceData } from './pieces'
import type { ProgressMode, EdgeStyle } from './SettingsModal'
import DebugOverlay from './debug/DebugOverlay'
import { useDebugSolve } from './debug/useDebugSolve'
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
  edgeStyle: EdgeStyle
  showBorder: boolean
  progressMode: ProgressMode
  progressPercent: boolean
  theme: 'light' | 'dark'
  accentColor: string
  onReset: () => void
  onOpenSettings: () => void
  onToggleTheme: () => void
  onPieceMoved: () => void
}

// Snap radius scales with piece size but never drops below a fixed number of
// screen pixels, so snapping feels the same at every zoom level and piece count
const SNAP_THRESHOLD_FRAC = 0.16
const SNAP_MIN_SCREEN_PX = 12
// Hard cap measured in knobs (padding equals one knob extent): half a knob
// normally, shrinking to a quarter knob at maximum zoom (16x)
const SNAP_MAX_KNOB_FRAC = 0.5
const SNAP_MAX_KNOB_FRAC_MAX_ZOOM = 0.25
const SNAP_ALIGN_EPSILON = 2

function formatProgress(locked: number, total: number, mode: ProgressMode, showPct: boolean): string {
  if (mode === 'off' || total === 0) return ''
  const pct = Math.round((locked / total) * 100)
  if (mode === 'percent') return `${pct}%`
  const pctStr = showPct ? ` (${pct}%)` : ''
  if (mode === 'count') return `${locked}${pctStr}`
  return `${locked}/${total}${pctStr}`
}

export default function PuzzleBoard({ imageSrc, cols: COLS, rows: ROWS, zoomStep, resolution, panStep, knobSize, pieceStyle, pieceSpacing, edgeStyle, showBorder, progressMode, progressPercent, theme, accentColor, onReset, onOpenSettings, onToggleTheme, onPieceMoved }: Props) {
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
  const borderCanvasRef = useRef<HTMLCanvasElement>(null)
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
      const { canvas, displayW, displayH } = renderPiece(layout, img, COLS, ROWS, pw, ph, padding, resolution, pieceStyle, knobSize, edgeStyle, showBorder)
      return { ...p, canvas, displayW, displayH }
    }))
  }, [knobSize, pieceStyle, edgeStyle, showBorder])

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
          const { canvas, displayW, displayH } = renderPiece(layout, img, COLS, ROWS, pw, ph, padding, resolution, pieceStyle, knobSize, edgeStyle, showBorder)
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
        const newZoom = Math.min(zoomRef.current * zoomStep, 16)
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

  useDebugSolve(setPieces, pieceSizeRef, layoutOriginRef, nodeRefs, setSolved, setFireworksDark)

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

  // Move group members imperatively. No React state, no lag
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
    redrawBordersRef.current()
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

      const { pw, ph, padding } = pieceSizeRef.current
      // base radius scales with piece size, floor keeps it usable zoomed out,
      // hard cap in knob units so a piece never snaps from further than half a
      // knob away, tightening to a quarter knob at maximum zoom
      const base = Math.min(pw, ph)
      const zoomNow = zoomRef.current || 1
      const zt = Math.min(Math.max(Math.log(zoomNow) / Math.log(16), 0), 1)
      const knobCap = padding * (SNAP_MAX_KNOB_FRAC - (SNAP_MAX_KNOB_FRAC - SNAP_MAX_KNOB_FRAC_MAX_ZOOM) * zt)
      const snapThreshold = Math.min(
        Math.max(base * SNAP_THRESHOLD_FRAC, SNAP_MIN_SCREEN_PX / zoomNow),
        knobCap
      )
      let newGroups = { ...currentGroups }
      let snapped = false

      // snap to direct neighbour: every piece in the dragged group gets a say,
      // not just the piece under the cursor, and the closest match wins
      let best: { shiftX: number; shiftY: number; otherId: string; dist: number } | null = null
      for (const gid of groupIds) {
        const gp = next.find(p => p.id === gid)!
        for (const other of next) {
          if (groupIds.includes(other.id)) continue
          const colDiff = Math.abs(other.col - gp.col)
          const rowDiff = Math.abs(other.row - gp.row)
          if (!((colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1))) continue

          const offX = (other.x - gp.x) - (other.col - gp.col) * pw
          const offY = (other.y - gp.y) - (other.row - gp.row) * ph
          if (Math.abs(offX) >= snapThreshold || Math.abs(offY) >= snapThreshold) continue

          const dist = Math.hypot(offX, offY)
          if (!best || dist < best.dist) best = { shiftX: offX, shiftY: offY, otherId: other.id, dist }
        }
      }

      if (best) {
        const { shiftX, shiftY, otherId } = best
        next = next.map(p =>
          groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
        )
        const newGroupId = newGroups[otherId] ?? otherId
        groupIds.forEach(pid => { newGroups[pid] = newGroupId })
        newGroups[otherId] = newGroupId
        getGroupIds(otherId, currentGroups, prevPieces).forEach(pid => { newGroups[pid] = newGroupId })
        snapped = true

        // a drop can land flush against more than one group (e.g. into a
        // pocket between two assembled sections). Merge everything that now
        // lines up exactly, repeating until nothing new joins
        const inMerged = (pid: string) => (newGroups[pid] ?? pid) === newGroupId
        let changed = true
        while (changed) {
          changed = false
          for (const gp of next) {
            if (!inMerged(gp.id)) continue
            for (const other of next) {
              if (inMerged(other.id)) continue
              const colDiff = Math.abs(other.col - gp.col)
              const rowDiff = Math.abs(other.row - gp.row)
              if (!((colDiff === 1 && rowDiff === 0) || (colDiff === 0 && rowDiff === 1))) continue
              const offX = (other.x - gp.x) - (other.col - gp.col) * pw
              const offY = (other.y - gp.y) - (other.row - gp.row) * ph
              if (Math.abs(offX) < SNAP_ALIGN_EPSILON && Math.abs(offY) < SNAP_ALIGN_EPSILON) {
                getGroupIds(other.id, newGroups, next).forEach(pid => { newGroups[pid] = newGroupId })
                newGroups[other.id] = newGroupId
                changed = true
              }
            }
          }
        }
      }

      // snap to grid: every piece in the group is checked, closest match wins
      if (!snapped) {
        let bestGrid: { shiftX: number; shiftY: number; dist: number } | null = null
        for (const gid of groupIds) {
          const gp = next.find(p => p.id === gid)!
          const { cx, cy } = correctPos(gp.col, gp.row)
          const offX = cx - gp.x
          const offY = cy - gp.y
          if (Math.abs(offX) >= snapThreshold || Math.abs(offY) >= snapThreshold) continue
          const dist = Math.hypot(offX, offY)
          if (!bestGrid || dist < bestGrid.dist) bestGrid = { shiftX: offX, shiftY: offY, dist }
        }
        if (bestGrid) {
          const { shiftX, shiftY } = bestGrid
          next = next.map(p =>
            groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
          )
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

  // Reactive border draw. useLayoutEffect so it runs before the browser paints,
  // keeping borders in lockstep with the Konva stage on every zoom/pan/state change
  useLayoutEffect(() => {
    const canvas = borderCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!showBorder || pieces.length === 0) return
    const { pw, ph, padding } = pieceSize
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 1 / zoom
    // Mirror the stage stacking: locked pieces sit in a lower layer, unlocked
    // pieces render in array order (the dragged group is moved to the end).
    // Before stroking a piece, punch out any lines already drawn beneath its
    // body so outlines of covered pieces never bleed through the one on top.
    const ordered = [...pieces.filter(p => p.locked), ...pieces.filter(p => !p.locked)]
    for (const p of ordered) {
      const node = nodeRefs.current[p.id]
      const nx = node ? node.x() : p.x
      const ny = node ? node.y() : p.y
      ctx.save()
      ctx.translate(nx + padding, ny + padding)
      renderPieceOutline(ctx, p, pw, ph, padding, pieceStyle, knobSize, edgeStyle)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }, [pieces, zoom, pan, showBorder, pieceSize, pieceStyle, knobSize, edgeStyle, size])

  // Imperative border draw for drag/pan moves. Uses refs so stale closures stay current
  const redrawBordersRef = useRef<() => void>(() => {})
  redrawBordersRef.current = () => {
    const canvas = borderCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!showBorder) return
    const { pw, ph, padding } = pieceSizeRef.current
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(zoomRef.current, zoomRef.current)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 1 / zoomRef.current
    // Same stacking-aware draw as the reactive effect above: erase lines under
    // each piece body, then stroke its own outline, in z-order.
    const all = piecesRef.current
    const ordered = [...all.filter(p => p.locked), ...all.filter(p => !p.locked)]
    for (const p of ordered) {
      const node = nodeRefs.current[p.id]
      const nx = node ? node.x() : p.x
      const ny = node ? node.y() : p.y
      ctx.save()
      ctx.translate(nx + padding, ny + padding)
      renderPieceOutline(ctx, p, pw, ph, padding, pieceStyle, knobSize, edgeStyle)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }

  const actualCanvasRes = (() => {
    const img = sourceImageRef.current
    const { pw, ph } = pieceSizeRef.current
    if (!img || pw === 0 || ph === 0) return 0
    const dpr = window.devicePixelRatio || 1
    const naturalRes = Math.min(img.width / (COLS * pw), img.height / (ROWS * ph))
    return resolution === 99 ? Math.max(1, naturalRes) : Math.max(1, resolution * dpr)
  })()

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
    const newZoom = Math.min(Math.max(zoomRef.current * factor, 0.25), 16)
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
    // Move the stage imperatively, same as piece dragging. Going through
    // setPan here re-renders the whole stage one frame behind the border
    // canvas, which makes the lines shake and drift outside the pieces.
    panRef.current = newPan
    const stage = stageRef.current
    if (stage) {
      stage.position(newPan)
      stage.batchDraw()
    }
    redrawBordersRef.current()
  }

  function handleStageMouseUp() {
    if (isPanning.current) {
      // Commit the final pan to state once, so React and the refs agree.
      setPan(panRef.current)
    }
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

      {import.meta.env.DEV && !showPreview && (
        <DebugOverlay
          zoom={zoom}
          resolution={resolution}
          actualCanvasRes={actualCanvasRes}
          pieceCount={pieces.length}
          lockedCount={lockedCount}
        />
      )}

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
              clipFunc={(ctx: any) => {
                ctx.translate(pieceSize.padding, pieceSize.padding)
                renderPieceOutline(ctx as unknown as CanvasRenderingContext2D, p, pieceSize.pw, pieceSize.ph, pieceSize.padding, pieceStyle, knobSize, edgeStyle)
              }}
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
              clipFunc={(ctx: any) => {
                ctx.translate(pieceSize.padding, pieceSize.padding)
                renderPieceOutline(ctx as unknown as CanvasRenderingContext2D, p, pieceSize.pw, pieceSize.ph, pieceSize.padding, pieceStyle, knobSize, edgeStyle)
              }}
              // Hit area follows the piece path instead of the padded square,
              // so knobs are grabbable and holes let you grab what is beneath.
              hitFunc={(ctx: any, shape: any) => {
                ctx.translate(pieceSize.padding, pieceSize.padding)
                renderPieceOutline(ctx as unknown as CanvasRenderingContext2D, p, pieceSize.pw, pieceSize.ph, pieceSize.padding, pieceStyle, knobSize, edgeStyle)
                ctx.closePath()
                ctx.fillStrokeShape(shape)
              }}
              onDragStart={e => handleDragStart(p.id, e.target.x(), e.target.y())}
              onDragMove={e => handleDragMove(p.id, e.target.x(), e.target.y())}
              onDragEnd={e => handleDragEnd(p.id, e.target.x(), e.target.y())}
            />
          ))}
        </Layer>
      </Stage>

      <canvas
        ref={borderCanvasRef}
        width={size.width * (window.devicePixelRatio || 1)}
        height={size.height * (window.devicePixelRatio || 1)}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  )
}
