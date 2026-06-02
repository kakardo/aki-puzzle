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
const SNAP_THRESHOLD = 60

export default function PuzzleBoard({ imageSrc, onReset }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [pieceImages, setPieceImages] = useState<Record<string, HTMLImageElement>>({})
  const [solved, setSolved] = useState(false)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<KonvaType.Stage>(null)

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = () => {
      const generated = generatePieces(img, COLS, ROWS, size.width, size.height)
      setPieces(generated)
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

  function getCorrectPos(col: number, row: number) {
    const originX = (size.width - COLS * PIECE_SIZE) / 2
    const originY = (size.height - ROWS * PIECE_SIZE) / 2
    return {
      correctX: originX + col * PIECE_SIZE - PADDING,
      correctY: originY + row * PIECE_SIZE - PADDING,
    }
  }

  function handleDragEnd(id: string, x: number, y: number) {
    setPieces(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p
        const { correctX, correctY } = getCorrectPos(p.col, p.row)
        const dx = Math.abs(x - correctX)
        const dy = Math.abs(y - correctY)
        if (dx < SNAP_THRESHOLD && dy < SNAP_THRESHOLD) {
          return { ...p, x: correctX, y: correctY, locked: true }
        }
        return { ...p, x, y }
      })
      if (next.every(p => p.locked)) setSolved(true)
      return next
    })
  }

  function bringToFront(id: string) {
    setPieces(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      const [piece] = next.splice(idx, 1)
      next.push(piece)
      return next
    })
  }

  const originX = (size.width - COLS * PIECE_SIZE) / 2
  const originY = (size.height - ROWS * PIECE_SIZE) / 2

  return (
    <div style={{ position: 'relative', background: '#e8e8e2', width: '100vw', height: '100vh' }}>
      <button className="reset-btn" onClick={onReset}>New puzzle</button>

      {solved && (
        <div className="solved-banner">Puzzle complete!</div>
      )}

      <Stage ref={stageRef} width={size.width} height={size.height}>
        <Layer>
          {/* faint grid showing where pieces belong */}
          {Array.from({ length: ROWS }, (_, row) =>
            Array.from({ length: COLS }, (_, col) => (
              <Rect
                key={`grid-${col}-${row}`}
                x={originX + col * PIECE_SIZE}
                y={originY + row * PIECE_SIZE}
                width={PIECE_SIZE}
                height={PIECE_SIZE}
                stroke="rgba(0,0,0,0.12)"
                strokeWidth={1}
                fill="rgba(0,0,0,0.03)"
              />
            ))
          )}
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
                draggable={!p.locked}
                onDragStart={() => bringToFront(p.id)}
                onDragEnd={e => handleDragEnd(p.id, e.target.x(), e.target.y())}
              />
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}
