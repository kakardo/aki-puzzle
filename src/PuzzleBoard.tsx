import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import type KonvaType from 'konva'
import { generatePieces, type PieceData } from './pieces'

interface Props {
  imageSrc: string
  onReset: () => void
}

const COLS = 4
const ROWS = 4

export default function PuzzleBoard({ imageSrc, onReset }: Props) {
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [pieceImages, setPieceImages] = useState<Record<string, HTMLImageElement>>({})
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<KonvaType.Stage>(null)

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = () => {
      const generated = generatePieces(img, COLS, ROWS, size.width, size.height)
      setPieces(generated)

      const images: Record<string, HTMLImageElement> = {}
      let loaded = 0
      generated.forEach(p => {
        const i = new window.Image()
        i.src = p.imageDataUrl
        i.onload = () => {
          images[p.id] = i
          loaded++
          if (loaded === generated.length) {
            setPieceImages({ ...images })
          }
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

  function handleDragEnd(id: string, x: number, y: number) {
    setPieces(prev =>
      prev.map(p => p.id === id ? { ...p, x, y } : p)
    )
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

  return (
    <div style={{ position: 'relative', background: '#e8e8e2', width: '100vw', height: '100vh' }}>
      <button className="reset-btn" onClick={onReset}>New puzzle</button>
      <Stage ref={stageRef} width={size.width} height={size.height}>
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
