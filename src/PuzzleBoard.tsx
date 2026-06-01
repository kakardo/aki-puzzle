import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import type KonvaType from 'konva'

interface Props {
  imageSrc: string
  onReset: () => void
}

export default function PuzzleBoard({ imageSrc, onReset }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const stageRef = useRef<KonvaType.Stage>(null)

  useEffect(() => {
    const img = new window.Image()
    img.src = imageSrc
    img.onload = () => setImage(img)
  }, [imageSrc])

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function getImageFit() {
    if (!image) return { x: 0, y: 0, width: 0, height: 0 }
    const scale = Math.min(size.width / image.width, size.height / image.height)
    const width = image.width * scale
    const height = image.height * scale
    return {
      x: (size.width - width) / 2,
      y: (size.height - height) / 2,
      width,
      height,
    }
  }

  const fit = getImageFit()

  return (
    <div style={{ position: 'relative' }}>
      <button className="reset-btn" onClick={onReset}>New puzzle</button>
      <Stage ref={stageRef} width={size.width} height={size.height}>
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              x={fit.x}
              y={fit.y}
              width={fit.width}
              height={fit.height}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}
