import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva'
import type KonvaType from 'konva'
import { generatePieces, type PieceData } from './pieces'

interface Props {
  imageSrc: string
  onReset: () => void
}

const COLS = 4
const ROWS = 4
const PIECE_SIZE = 120
const PADDING = 20
const SNAP_THRESHOLD = 30

export default function PuzzleBoard({ imageSrc, onReset }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [pieceImages, setPieceImages] = useState<Record<string, HTMLImageElement>>({})
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [solved, setSolved] = useState(false)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<KonvaType.Stage>(null)
  const nodeRefs = useRef<Record<string, KonvaType.Image>>({})
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const groupsRef = useRef(groups)
  const piecesRef = useRef(pieces)

  useEffect(() => { groupsRef.current = groups }, [groups])
  useEffect(() => { piecesRef.current = pieces }, [pieces])

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = () => {
      const generated = generatePieces(img, COLS, ROWS, size.width, size.height)
      setPieces(generated)
      setGroups({})
      setSolved(false)
      const images: Record<string, HTMLImageElement> = {}
      let loaded = 0
      generated.forEach(p => {
        const i = new window.Image()
        i.src = p.imageDataUrl
        i.onload = () => {
          images[p.id] = i
          loaded++
          if (loaded === generated.length) setPieceImages({ ...images })
        }
      })
    }
  }, [imageSrc])

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function getGroupIds(id: string, currentGroups: Record<string, string>, currentPieces: PieceData[]) {
    const groupId = currentGroups[id]
    if (!groupId) return [id]
    return currentPieces.filter(p => currentGroups[p.id] === groupId).map(p => p.id)
  }

  function correctPos(col: number, row: number) {
    const originX = (size.width - COLS * PIECE_SIZE) / 2
    const originY = (size.height - ROWS * PIECE_SIZE) / 2
    return {
      cx: originX + col * PIECE_SIZE - PADDING,
      cy: originY + row * PIECE_SIZE - PADDING,
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

        const expectedDx = (other.col - dragged.col) * PIECE_SIZE
        const expectedDy = (other.row - dragged.row) * PIECE_SIZE
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

  const originX = (size.width - COLS * PIECE_SIZE) / 2
  const originY = (size.height - ROWS * PIECE_SIZE) / 2

  return (
    <div style={{ position: 'relative', background: '#e8e8e2', width: '100vw', height: '100vh' }}>
      <button className="reset-btn" onClick={onReset}>New puzzle</button>
      {solved && <div className="solved-banner">Puzzle complete!</div>}

      <Stage ref={stageRef} width={size.width} height={size.height}>
        <Layer>
          <Rect
            x={originX}
            y={originY}
            width={COLS * PIECE_SIZE}
            height={ROWS * PIECE_SIZE}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1}
            fill="rgba(0,0,0,0.02)"
          />
        </Layer>
        <Layer>
          {pieces.map(p => {
            const img = pieceImages[p.id]
            if (!img) return null
            return (
              <KonvaImage
                key={p.id}
                ref={node => { if (node) nodeRefs.current[p.id] = node }}
                image={img}
                x={p.x}
                y={p.y}
                draggable={!p.locked}
                onDragStart={e => handleDragStart(p.id, e.target.x(), e.target.y())}
                onDragMove={e => handleDragMove(p.id, e.target.x(), e.target.y())}
                onDragEnd={e => handleDragEnd(p.id, e.target.x(), e.target.y())}
              />
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}
