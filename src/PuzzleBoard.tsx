import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import type KonvaType from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { generatePieceLayout, renderPiece, calcPieceSize, renderPieceOutline, type PieceData } from './pieces'
import type { ProgressMode, EdgeStyle, RippleQuality } from './SettingsModal'
import DebugOverlay from './debug/DebugOverlay'
import { useDebugSolve } from './debug/useDebugSolve'
import { useDebugActions } from './debug/useDebugActions'
import type { DebugActions } from './debug/useDebugActions'
import Fireworks from './animations/Fireworks'
import Ripple from './animations/Ripple'
import type { BoardMultiplayer, RemoteHandlers } from './multiplayer/types'
import type { Groups, NetPiece } from './multiplayer/protocol'
import type { StatsHooks } from './stats/types'

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
  rippleQuality: RippleQuality
  progressMode: ProgressMode
  progressPercent: boolean
  theme: 'light' | 'dark'
  accentColor: string
  pingNameOnRing?: boolean
  pingNameOnArrow?: boolean
  onReset: () => void
  onOpenSettings: () => void
  onOpenStats?: () => void
  onToggleTheme: () => void
  onPieceMoved: () => void
  debugActionsRef?: React.MutableRefObject<DebugActions | null>
  multiplayer?: BoardMultiplayer
  statsHooks?: StatsHooks
  coPlayerNames?: string[]
  // Generation seed, so every client cuts identical pieces.
  seed?: number
  // Menu action to host the current game (available while playing solo).
  onHostGame?: () => void
  // Lets the app read the current board state to host it exactly as it is.
  hostSnapshotRef?: React.MutableRefObject<(() => { pieces: NetPiece[]; groups: Groups; genWidth: number; genHeight: number }) | null>
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

// How long a ping stays on screen before it clears itself.
const PING_LIFETIME_MS = 2500

function formatProgress(locked: number, total: number, mode: ProgressMode, showPct: boolean): string {
  if (mode === 'off' || total === 0) return ''
  const pct = Math.round((locked / total) * 100)
  if (mode === 'percent') return `${pct}%`
  const pctStr = showPct ? ` (${pct}%)` : ''
  if (mode === 'count') return `${locked}${pctStr}`
  return `${locked}/${total}${pctStr}`
}

export default function PuzzleBoard({ imageSrc, cols: COLS, rows: ROWS, zoomStep, resolution, panStep, knobSize, pieceStyle, pieceSpacing, edgeStyle, showBorder, rippleQuality, progressMode, progressPercent, theme, accentColor, pingNameOnRing = true, pingNameOnArrow = false, onReset, onOpenSettings, onOpenStats, onToggleTheme, onPieceMoved, debugActionsRef, multiplayer, statsHooks, coPlayerNames, seed, onHostGame, hostSnapshotRef }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [solved, setSolved] = useState(false)
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null)
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

  // Multiplayer. All of this stays in refs: remote drags arrive up to 30
  // times a second per player and must never cause a render
  const mpRef = useRef(multiplayer)
  useEffect(() => { mpRef.current = multiplayer })
  // pieceId -> holder, drives highlights and drag blocking
  const remoteHeld = useRef<Record<string, { playerId: string; color: string }>>({})
  // live positions of remotely dragged pieces; survives re-renders that
  // would otherwise re-apply stale x/y props to those nodes
  const remoteLive = useRef<Record<string, { x: number; y: number }>>({})
  // local drags whose grab the server denied; their dragend commits nothing
  const deniedDrags = useRef<Set<string>>(new Set())

  // Pings: transient "look here" markers keyed to a world coordinate, so every
  // viewer renders them through their own pan and zoom. Low frequency, so
  // plain state is fine. Each one clears itself after PING_LIFETIME_MS.
  const [pings, setPings] = useState<{ id: number; x: number; y: number; color: string; name: string; own: boolean }[]>([])
  const pingIdRef = useRef(0)
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const pingLayerRef = useRef<HTMLDivElement>(null)
  // Your own ping is always at your own cursor, so it only ever draws the ring,
  // never an edge arrow. Arrows are only for other players whose view does not
  // include the pinged spot.
  const addPing = useCallback((color: string, name: string, x: number, y: number, own = false) => {
    const id = ++pingIdRef.current
    setPings(prev => [...prev, { id, x, y, color, name, own }])
    setTimeout(() => setPings(prev => prev.filter(p => p.id !== id)), PING_LIFETIME_MS)
  }, [])

  // Stats bookkeeping for the puzzle attempt currently on screen. Reset
  // whenever a fresh puzzle is generated (see the [imageSrc] effect below).
  const statsSessionIdRef = useRef<string | null>(null)
  const chainMergeMaxRef = useRef(0)
  const statsCompletedRef = useRef(false)

  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])
  // Latest accent colour for the solo ping, read from the once bound key handler
  const accentColorRef = useRef(accentColor)
  useEffect(() => { accentColorRef.current = accentColor })

  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { piecesRef.current = pieces }, [pieces])

  // Expose the live board so the app can host this exact game on demand.
  useEffect(() => {
    if (!hostSnapshotRef) return
    hostSnapshotRef.current = () => ({
      pieces: piecesRef.current.map(p => ({ id: p.id, x: p.x, y: p.y, locked: p.locked })),
      groups: groupsRef.current,
      genWidth: genSizeRef.current.width,
      genHeight: genSizeRef.current.height,
    })
    return () => { if (hostSnapshotRef) hostSnapshotRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reposition unlocked pieces when piece spacing changes mid-puzzle
  useEffect(() => {
    const img = sourceImageRef.current
    if (!img || pieces.length === 0) return
    const { pieces: newLayouts } = generatePieceLayout(img, COLS, ROWS, genSizeRef.current.width, genSizeRef.current.height, knobSize, pieceSpacing, mpRef.current?.seed ?? seed)
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

      // Step 1: fast layout. In multiplayer every client lays out with the
      // host's generation viewport, so piece sizes and world coordinates
      // match across machines; each client still fits its own window below
      const mp = mpRef.current
      const genW = mp?.genWidth ?? size.width
      const genH = mp?.genHeight ?? size.height
      sourceImageRef.current = img
      const ps = calcPieceSize(img, COLS, ROWS, genW, genH, knobSize)
      setPieceSize(ps)
      pieceSizeRef.current = ps
      genSizeRef.current = { width: genW, height: genH }
      setLayoutOrigin({
        x: (genW - COLS * ps.pw) / 2,
        y: (genH - ROWS * ps.ph) / 2,
      })
      const { pieces: layouts, pw, ph, padding } = generatePieceLayout(img, COLS, ROWS, genW, genH, knobSize, pieceSpacing, mp?.seed ?? seed)
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

      // In multiplayer, the session snapshot overrides the fresh scatter:
      // positions, locked flags, groups, and any drags in flight
      let finalPieces = rendered
      remoteLive.current = {}
      if (mp?.initialPieces) {
        const byId = new Map(mp.initialPieces.map(p => [p.id, p]))
        finalPieces = rendered.map(p => {
          const ip = byId.get(p.id)
          return ip ? { ...p, x: ip.x, y: ip.y, locked: ip.locked } : p
        })
        setGroups(mp.initialGroups)
        remoteHeld.current = { ...mp.initialHeld }
      } else {
        remoteHeld.current = {}
      }

      setPieces(finalPieces)
      setLoadingSteps([])
      fitAll(finalPieces, ps)

      // A fresh stats session per puzzle attempt, solo or multiplayer alike
      chainMergeMaxRef.current = 0
      statsCompletedRef.current = false
      statsSessionIdRef.current = statsHooks?.startSession(total, COLS, ROWS, mp ? 'multiplayer' : 'solo') ?? null

      // A fresh host board reports its layout so the session can be created
      if (mp && mp.role === 'host' && !mp.initialPieces) {
        mp.onGenerated?.(
          finalPieces.map(p => ({ id: p.id, x: p.x, y: p.y, locked: p.locked })),
          genW,
          genH
        )
      }
    }
  }, [imageSrc])

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keep the latest cursor position so a Shift ping lands where the pointer is.
  useEffect(() => {
    function track(e: MouseEvent) { cursorRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', track)
    return () => window.removeEventListener('mousemove', track)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Tab') { e.preventDefault(); if (!e.repeat) setShowPreview(v => !v); return }
      if (e.key === 'Shift') {
        // Ping the spot under the cursor, one per tap. Fall back to the screen
        // centre if the pointer has not moved yet this session.
        if (e.repeat) return
        const cur = cursorRef.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        const wx = (cur.x - panRef.current.x) / zoomRef.current
        const wy = (cur.y - panRef.current.y) / zoomRef.current
        const mp = mpRef.current
        if (mp) {
          // Multiplayer: your own ping shows as a ring (own = true), and the
          // others are told so it can point them to the spot.
          addPing(mp.selfColor, mp.selfName, wx, wy, true)
          mp.api.sendPing(wx, wy)
        } else {
          // Solo: a quick marker for yourself, no name, ring only.
          addPing(accentColorRef.current, '', wx, wy, true)
        }
        return
      }
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

  // If the ripple is switched off in settings while one is playing, finish the
  // solve sequence immediately so the fireworks still arrive
  useEffect(() => {
    if (ripple && rippleQuality === 'off') {
      setRipple(null)
      setSolved(true)
      setFireworksDark(true)
    }
  }, [rippleQuality, ripple])

  // In multiplayer the debug keys must never mutate state directly (that
  // would desync everyone); route them through no-ops instead of disabling
  // the hooks outright, since the hooks themselves stay React-rules-safe
  useDebugSolve(multiplayer ? () => {} : setPieces, pieceSizeRef, layoutOriginRef, nodeRefs, triggerSolve)
  useDebugActions(multiplayer ? () => {} : setPieces, multiplayer ? () => {} : setGroups, pieceSizeRef, layoutOriginRef, nodeRefs, triggerSolve, debugActionsRef)

  // Single entry point for finishing the puzzle, used by both a real drag and
  // the debug solve. Ripple first if enabled, then the fireworks take over
  function triggerSolve(placed: PieceData) {
    if (rippleQuality !== 'off') {
      const { pw, ph, padding } = pieceSizeRef.current
      const wx = placed.x + padding + pw / 2
      const wy = placed.y + padding + ph / 2
      setRipple({
        x: wx * zoomRef.current + panRef.current.x,
        y: wy * zoomRef.current + panRef.current.y,
      })
    } else {
      setSolved(true)
      setFireworksDark(true)
    }
  }

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

  // Latest triggerSolve for callbacks that outlive a render (remote drops),
  // so they never close over a stale ripple setting
  const triggerSolveRef = useRef<(placed: PieceData) => void>(() => {})
  triggerSolveRef.current = triggerSolve

  // Clears remote-hold bookkeeping for a set of piece ids and restores their
  // nodes to the last committed (React state) position. Used when a remote
  // drag ends without an authoritative drop: a release or a disconnect
  function restoreRemoteGroup(ids: string[]) {
    ids.forEach(gid => {
      delete remoteHeld.current[gid]
      delete remoteLive.current[gid]
      const p = piecesRef.current.find(pp => pp.id === gid)
      const node = nodeRefs.current[gid]
      if (p && node) {
        node.x(p.x)
        node.y(p.y)
        node.draggable(!p.locked)
      }
    })
    if (ids.length > 0) redrawBordersRef.current()
  }

  // Everything PuzzleBoard needs in order to react to the other players.
  // Built once: every value it closes over is a ref or a stable setter, so
  // it never goes stale and never needs to be rebuilt on render
  const remoteHandlersRef = useRef<RemoteHandlers>({
    onRemoteGrab(playerId, color, groupPieceIds) {
      groupPieceIds.forEach(gid => {
        remoteHeld.current[gid] = { playerId, color }
        nodeRefs.current[gid]?.draggable(false)
      })
      redrawBordersRef.current()
    },
    onRemoteDrag(pieceId, x, y) {
      const anchorNode = nodeRefs.current[pieceId]
      const curX = anchorNode ? anchorNode.x() : (remoteLive.current[pieceId]?.x ?? x)
      const curY = anchorNode ? anchorNode.y() : (remoteLive.current[pieceId]?.y ?? y)
      const dx = x - curX
      const dy = y - curY
      const groupIds = getGroupIds(pieceId, groupsRef.current, piecesRef.current)
      groupIds.forEach(gid => {
        const node = nodeRefs.current[gid]
        const base = node ? { x: node.x(), y: node.y() } : (remoteLive.current[gid] ?? { x, y })
        const nx = base.x + dx
        const ny = base.y + dy
        if (node) { node.x(nx); node.y(ny) }
        remoteLive.current[gid] = { x: nx, y: ny }
      })
      redrawBordersRef.current()
      stageRef.current?.batchDraw()
    },
    onRemoteDrop(patches, groups) {
      const patchById = new Map(patches.map(p => [p.id, p]))
      setPieces(prev => {
        const next = prev.map(p => {
          const patch = patchById.get(p.id)
          return patch ? { ...p, x: patch.x, y: patch.y, locked: patch.locked } : p
        })
        if (next.every(p => p.locked)) {
          const lastId = patches[patches.length - 1]?.id
          triggerSolveRef.current(next.find(p => p.id === lastId) ?? next[next.length - 1])
        }
        return next
      })
      setGroups(groups)
      patches.forEach(({ id, x, y, locked }) => {
        delete remoteHeld.current[id]
        delete remoteLive.current[id]
        const node = nodeRefs.current[id]
        if (node) {
          node.x(x)
          node.y(y)
          if (!locked) node.draggable(true)
        }
      })
      redrawBordersRef.current()
    },
    onRemoteRelease(pieceId) {
      const holder = remoteHeld.current[pieceId]
      const ids = holder
        ? Object.keys(remoteHeld.current).filter(k => remoteHeld.current[k].playerId === holder.playerId)
        : [pieceId]
      restoreRemoteGroup(ids)
    },
    onPlayerLeft(playerId) {
      const ids = Object.keys(remoteHeld.current).filter(k => remoteHeld.current[k].playerId === playerId)
      restoreRemoteGroup(ids)
    },
    onGrabDenied(pieceId) {
      const node = nodeRefs.current[pieceId]
      if (node && node.isDragging()) {
        deniedDrags.current.add(pieceId)
        node.stopDrag()
      }
    },
    onRemotePing(color, name, x, y) {
      addPing(color, name, x, y)
    },
  })

  // Registers the delegating handlers once per mount, and lets the hook
  // snapshot the live board so the host can restore a session after a
  // server restart. PuzzleBoard is remounted (via sessionEpoch) on every
  // new session, so a mount-once effect is the correct lifetime here
  useEffect(() => {
    if (!multiplayer) return
    multiplayer.setRemoteHandlers(remoteHandlersRef.current)
    multiplayer.setBoardStateProvider(() => ({
      pieces: piecesRef.current.map(p => ({ id: p.id, x: p.x, y: p.y, locked: p.locked })),
      groups: groupsRef.current,
    }))
    return () => {
      multiplayer.setRemoteHandlers(null)
      multiplayer.setBoardStateProvider(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remote drags move nodes imperatively; any render in between (a player
  // joining, a drop elsewhere patching state) reapplies the stale x/y state
  // props to those same nodes, snapping them back. Reassert the live remote
  // positions after every commit. remoteLive is empty outside a remote drag,
  // so this is a no-op in solo play
  useLayoutEffect(() => {
    const live = remoteLive.current
    let touched = false
    for (const id in live) {
      const node = nodeRefs.current[id]
      if (node) {
        node.x(live[id].x)
        node.y(live[id].y)
        touched = true
      }
    }
    for (const id in remoteHeld.current) {
      nodeRefs.current[id]?.draggable(false)
    }
    if (touched) stageRef.current?.batchDraw()
  })

  function handleDragStart(id: string, x: number, y: number) {
    // Pieces held by another player are not draggable; this catches the
    // race where the pointer goes down before the grab broadcast lands
    if (remoteHeld.current[id]) {
      nodeRefs.current[id]?.stopDrag()
      return
    }
    // Optimistic grab: drag immediately, cancel if the server says no
    mpRef.current?.api.sendGrab(id)
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
    mpRef.current?.api.sendDrag(id, x, y)
  }

  function handleDragEnd(id: string, _finalX: number, _finalY: number) {
    lastPos.current = null

    // A drag that lost its grab commits nothing: put the group back where
    // the last committed state has it and let the winner's moves arrive
    // over the network instead
    if (deniedDrags.current.has(id) || remoteHeld.current[id]) {
      deniedDrags.current.delete(id)
      for (const gid of getGroupIds(id, groupsRef.current, piecesRef.current)) {
        const p = piecesRef.current.find(pp => pp.id === gid)
        const node = nodeRefs.current[gid]
        if (p && node) { node.x(p.x); node.y(p.y) }
      }
      redrawBordersRef.current()
      if (statsSessionIdRef.current) statsHooks?.onPickupNotPlaced(statsSessionIdRef.current)
      return
    }

    const currentGroups = groupsRef.current
    const prevPieces = piecesRef.current
    const groupIds = getGroupIds(id, currentGroups, prevPieces)

    // read actual node positions (imperatively updated during drag) and
    // resolve the drop outside the state updater, so the result can also be
    // sent to the other players exactly once
    {

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
          // never snap to a piece another player is dragging: its position
          // here is mid-flight and up to a throttle interval stale
          if (remoteHeld.current[other.id]) continue
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
              if (remoteHeld.current[other.id]) continue
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

      // Track the biggest chain merge seen this puzzle: total size of the
      // cluster resulting from this drop, after any neighbour snap and
      // cascade above. Counts the placed pieces themselves as well as
      // whatever they connected to, not just the growth.
      const finalGroupSize = getGroupIds(id, newGroups, next).length
      if (finalGroupSize > chainMergeMaxRef.current) chainMergeMaxRef.current = finalGroupSize

      // lock pieces in correct position
      const beforeLock = next
      next = next.map(p => {
        const { cx, cy } = correctPos(p.col, p.row)
        return Math.abs(p.x - cx) < 2 && Math.abs(p.y - cy) < 2 ? { ...p, locked: true } : p
      })
      const newlyLocked = next.filter((p, i) => p.locked && !beforeLock[i].locked).length

      // sync final positions back to nodes
      next.forEach(p => {
        const node = nodeRefs.current[p.id]
        if (node) { node.x(p.x); node.y(p.y) }
      })

      setGroups(newGroups)
      setPieces(next)

      if (statsSessionIdRef.current) {
        if (newlyLocked > 0) statsHooks?.onPiecesPlaced(statsSessionIdRef.current, newlyLocked)
        else statsHooks?.onPickupNotPlaced(statsSessionIdRef.current)
      }

      if (next.every(p => p.locked)) {
        triggerSolve(next.find(p => p.id === id)!)
        if (statsSessionIdRef.current && !statsCompletedRef.current) {
          statsCompletedRef.current = true
          statsHooks?.completeSession(statsSessionIdRef.current, chainMergeMaxRef.current, coPlayerNames ?? [])
        }
      }

      if (mpRef.current) {
        const moved = next
          .filter(p => groupIds.includes(p.id))
          .map(p => ({ id: p.id, x: p.x, y: p.y, locked: p.locked }))
        mpRef.current.api.sendDrop(id, moved, newGroups)
      }
    }
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
    if (pieces.length === 0) return
    const { pw, ph, padding } = pieceSize
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)
    // Mirror the stage stacking: locked pieces sit in a lower layer, unlocked
    // pieces render in array order (the dragged group is moved to the end).
    // Before stroking a piece, punch out any lines already drawn beneath its
    // body so outlines of covered pieces never bleed through the one on top.
    // Remote-held pieces get their highlight drawn even when showBorder is
    // off; every other piece is skipped entirely in that case.
    const ordered = [...pieces.filter(p => p.locked), ...pieces.filter(p => !p.locked)]
    for (const p of ordered) {
      const held = remoteHeld.current[p.id]
      if (!showBorder && !held) continue
      const node = nodeRefs.current[p.id]
      const nx = node ? node.x() : p.x
      const ny = node ? node.y() : p.y
      ctx.save()
      ctx.translate(nx + padding, ny + padding)
      renderPieceOutline(ctx, p, pw, ph, padding, pieceStyle, knobSize, edgeStyle)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      if (held) {
        ctx.strokeStyle = held.color
        ctx.lineWidth = 2.5 / zoom
        ctx.shadowColor = held.color
        ctx.shadowBlur = 12
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 1 / zoom
        ctx.shadowBlur = 0
      }
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
    const { pw, ph, padding } = pieceSizeRef.current
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(zoomRef.current, zoomRef.current)
    // Same stacking-aware draw as the reactive effect above: erase lines under
    // each piece body, then stroke its own outline, in z-order. Remote-held
    // pieces draw their highlight even when showBorder is off.
    const all = piecesRef.current
    const ordered = [...all.filter(p => p.locked), ...all.filter(p => !p.locked)]
    for (const p of ordered) {
      const held = remoteHeld.current[p.id]
      if (!showBorder && !held) continue
      const node = nodeRefs.current[p.id]
      const nx = node ? node.x() : p.x
      const ny = node ? node.y() : p.y
      ctx.save()
      ctx.translate(nx + padding, ny + padding)
      renderPieceOutline(ctx, p, pw, ph, padding, pieceStyle, knobSize, edgeStyle)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      if (held) {
        ctx.strokeStyle = held.color
        ctx.lineWidth = 2.5 / zoomRef.current
        ctx.shadowColor = held.color
        ctx.shadowBlur = 12
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 1 / zoomRef.current
        ctx.shadowBlur = 0
      }
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

  // Snapshot of the board (stage plus border overlay) for the ripple to distort.
  // Resolution follows the ripple quality setting: the snapshot is only seen in
  // motion, and every ring redraw samples it, so resolution costs frames
  function captureBoard(): HTMLCanvasElement | null {
    const stage = stageRef.current
    if (!stage) return null
    const maxRatio = rippleQuality === 'low' ? 0.5 : rippleQuality === 'mid' ? 0.75 : 1
    const dpr = Math.min(window.devicePixelRatio || 1, maxRatio)
    const snap = document.createElement('canvas')
    snap.width = size.width * dpr
    snap.height = size.height * dpr
    const ctx = snap.getContext('2d')
    if (!ctx) return null
    // Fill with the page background so the band fully covers what is beneath
    ctx.fillStyle = theme === 'dark' ? '#18181b' : '#e8e8e2'
    ctx.fillRect(0, 0, snap.width, snap.height)
    ctx.drawImage(stage.toCanvas({ pixelRatio: dpr }), 0, 0, snap.width, snap.height)
    const border = borderCanvasRef.current
    if (border) ctx.drawImage(border, 0, 0, snap.width, snap.height)
    return snap
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
    // Pan commits to state only on mouseup, so shift the ping overlay along
    // imperatively until then, matching the stage.
    if (pingLayerRef.current) {
      pingLayerRef.current.style.transform = `translate(${newPan.x - pan.x}px, ${newPan.y - pan.y}px)`
    }
  }

  function handleLeave() {
    if (statsSessionIdRef.current && !statsCompletedRef.current) {
      statsHooks?.abandonSession(statsSessionIdRef.current)
    }
    onReset()
  }

  function handleStageMouseUp() {
    if (isPanning.current) {
      // Commit the final pan to state once, so React and the refs agree.
      setPan(panRef.current)
      // The committed pan re-renders the overlay at the right spot, so drop
      // the temporary imperative shift.
      if (pingLayerRef.current) pingLayerRef.current.style.transform = ''
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
              {onOpenStats && (
                <button className="dropdown-item" onClick={() => { onOpenStats(); setMenuOpen(false) }}>
                  Stats
                </button>
              )}
              {!multiplayer && onHostGame && (
                <button className="dropdown-item" onClick={() => { onHostGame(); setMenuOpen(false) }}>
                  Host this game
                </button>
              )}
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
                <span><kbd>Shift</kbd> Ping a spot</span>
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
              <button className="confirm-btn confirm-btn--danger" onClick={handleLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
      {ripple && rippleQuality !== 'off' && (
        <Ripple
          x={ripple.x}
          y={ripple.y}
          quality={rippleQuality}
          capture={captureBoard}
          onDone={() => {
            setRipple(null)
            setSolved(true)
            setFireworksDark(true)
          }}
        />
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

      <div className="ping-layer" ref={pingLayerRef}>
        {pings.map(ping => {
          const sx = ping.x * zoom + pan.x
          const sy = ping.y * zoom + pan.y
          const W = size.width
          const H = size.height
          // Your own ping sits at your own cursor: always a ring, drawn wherever
          // it is in the viewport, never an edge arrow.
          if (ping.own) {
            if (sx < 0 || sx > W || sy < 0 || sy > H) return null
            return (
              <div key={ping.id} className="ping" style={{ left: sx, top: sy }}>
                <span className="ping-ring" style={{ borderColor: ping.color, boxShadow: `0 0 12px ${ping.color}` }} />
                {ping.name && pingNameOnRing && <span className="ping-name" style={{ background: ping.color }}>{ping.name}</span>}
              </div>
            )
          }
          const margin = 56
          const onScreen = sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin
          if (onScreen) {
            return (
              <div key={ping.id} className="ping" style={{ left: sx, top: sy }}>
                <span className="ping-ring" style={{ borderColor: ping.color, boxShadow: `0 0 12px ${ping.color}` }} />
                {ping.name && pingNameOnRing && <span className="ping-name" style={{ background: ping.color }}>{ping.name}</span>}
              </div>
            )
          }
          // Off screen for this viewer: pin an arrow to the viewport edge and
          // point it from screen centre toward the world spot.
          const cx = W / 2
          const cy = H / 2
          const dx = sx - cx
          const dy = sy - cy
          const scale = Math.min(
            Math.max(W / 2 - margin, 1) / Math.max(Math.abs(dx), 1e-6),
            Math.max(H / 2 - margin, 1) / Math.max(Math.abs(dy), 1e-6),
          )
          const ex = cx + dx * scale
          const ey = cy + dy * scale
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI
          return (
            <div key={ping.id} className="ping" style={{ left: ex, top: ey }}>
              <svg
                className="ping-arrow"
                width="48"
                height="20"
                viewBox="0 0 48 20"
                style={{ transform: `rotate(${angle}deg)`, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
              >
                <line x1="3" y1="10" x2="30" y2="10" stroke={ping.color} strokeWidth="9" strokeLinecap="round" />
                <polygon points="27,0 27,20 47,10" fill={ping.color} />
              </svg>
              {ping.name && pingNameOnArrow && <span className="ping-name" style={{ background: ping.color }}>{ping.name}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
