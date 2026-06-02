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
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)

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

  function handleDragStart(id: string, x: number, y: number) {
    dragOrigin.current = { x, y }
    // bring group to front
    setPieces(prev => {
      const groupIds = getGroupIds(id, groups, prev)
      const others = prev.filter(p => !groupIds.includes(p.id))
      const inGroup = prev.filter(p => groupIds.includes(p.id))
      return [...others, ...inGroup]
    })
  }

  function handleDragEnd(id: string, finalX: number, finalY: number) {
    if (!dragOrigin.current) return
    const dx = finalX - dragOrigin.current.x
    const dy = finalY - dragOrigin.current.y
    dragOrigin.current = null

    setPieces(prevPieces => {
      const currentGroups = groups
      const groupIds = getGroupIds(id, currentGroups, prevPieces)

      // move entire group by the same delta (dragged piece already moved via Konva)
      let next = prevPieces.map(p => {
        if (p.id === id) return { ...p, x: finalX, y: finalY }
        if (groupIds.includes(p.id)) return { ...p, x: p.x + dx, y: p.y + dy }
        return p
      })

      const dragged = next.find(p => p.id === id)!
      let newGroups = { ...currentGroups }
      let snapped = false

      // try to snap to any adjacent piece
      for (const other of next) {
        if (groupIds.includes(other.id)) continue
        const expectedDx = (other.col - dragged.col) * PIECE_SIZE
        const expectedDy = (other.row - dragged.row) * PIECE_SIZE
        const offX = Math.abs((other.x - dragged.x) - expectedDx)
        const offY = Math.abs((other.y - dragged.y) - expectedDy)

        if (offX < SNAP_THRESHOLD && offY < SNAP_THRESHOLD) {
          const snapX = other.x - expectedDx
          const snapY = other.y - expectedDy
          const shiftX = snapX - dragged.x
          const shiftY = snapY - dragged.y

          next = next.map(p =>
            groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
          )

          const newGroupId = newGroups[other.id] ?? other.id
          groupIds.forEach(pid => { newGroups[pid] = newGroupId })
          newGroups[other.id] = newGroupId
          const otherGroupIds = getGroupIds(other.id, groups, prevPieces)
          otherGroupIds.forEach(pid => { newGroups[pid] = newGroupId })
          snapped = true
          break
        }
      }

      // if not snapped to a piece, check snap to grid
      if (!snapped) {
        const originX = (size.width - COLS * PIECE_SIZE) / 2
        const originY = (size.height - ROWS * PIECE_SIZE) / 2
        const draggedUpdated = next.find(p => p.id === id)!
        const correctX = originX + draggedUpdated.col * PIECE_SIZE - PADDING
        const correctY = originY + draggedUpdated.row * PIECE_SIZE - PADDING
        const offX = Math.abs(draggedUpdated.x - correctX)
        const offY = Math.abs(draggedUpdated.y - correctY)

        if (offX < SNAP_THRESHOLD * 2 && offY < SNAP_THRESHOLD * 2) {
          const shiftX = correctX - draggedUpdated.x
          const shiftY = correctY - draggedUpdated.y
          next = next.map(p =>
            groupIds.includes(p.id) ? { ...p, x: p.x + shiftX, y: p.y + shiftY } : p
          )
        }
      }

      setGroups(newGroups)

      // check completion
      const originX = (size.width - COLS * PIECE_SIZE) / 2
      const originY = (size.height - ROWS * PIECE_SIZE) / 2
      const allCorrect = next.every(p => {
        const cx = originX + p.col * PIECE_SIZE - PADDING
        const cy = originY + p.row * PIECE_SIZE - PADDING
        return Math.abs(p.x - cx) < 2 && Math.abs(p.y - cy) < 2
      })
      if (allCorrect) setSolved(true)

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
                image={img}
                x={p.x}
                y={p.y}
                draggable
                onDragStart={e => handleDragStart(p.id, e.target.x(), e.target.y())}
                onDragEnd={e => handleDragEnd(p.id, e.target.x(), e.target.y())}
              />
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}
