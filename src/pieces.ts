export interface PieceData {
  id: string
  col: number
  row: number
  x: number
  y: number
  correctX: number
  correctY: number
  tabs: [number, number, number, number] // top, right, bottom, left: 1=tab, -1=blank
  imageDataUrl: string
  locked: boolean
}

const PIECE_SIZE = 120

function drawPiecePath(
  ctx: CanvasRenderingContext2D,
  tabs: [number, number, number, number],
  w: number,
  h: number,
  t: number
) {
  const [top, right, bottom, left] = tabs

  ctx.beginPath()
  ctx.moveTo(0, 0)

  // top edge
  ctx.lineTo(w / 2 - t, 0)
  ctx.bezierCurveTo(
    w / 2 - t, -top * t,
    w / 2 + t, -top * t,
    w / 2 + t, 0
  )
  ctx.lineTo(w, 0)

  // right edge
  ctx.lineTo(w, h / 2 - t)
  ctx.bezierCurveTo(
    w + right * t, h / 2 - t,
    w + right * t, h / 2 + t,
    w, h / 2 + t
  )
  ctx.lineTo(w, h)

  // bottom edge
  ctx.lineTo(w / 2 + t, h)
  ctx.bezierCurveTo(
    w / 2 + t, h + bottom * t,
    w / 2 - t, h + bottom * t,
    w / 2 - t, h
  )
  ctx.lineTo(0, h)

  // left edge
  ctx.lineTo(0, h / 2 + t)
  ctx.bezierCurveTo(
    -left * t, h / 2 + t,
    -left * t, h / 2 - t,
    0, h / 2 - t
  )
  ctx.lineTo(0, 0)
  ctx.closePath()
}

export function calcPieceSize(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  stageWidth: number,
  stageHeight: number
): { pw: number; ph: number; padding: number } {
  const maxW = stageWidth * 0.85
  const maxH = stageHeight * 0.85
  const aspect = image.width / image.height
  // fit puzzle within maxW x maxH while keeping image aspect ratio
  let pw = maxW / cols
  let ph = pw / aspect
  if (ph * rows > maxH) {
    ph = maxH / rows
    pw = ph * aspect
  }
  const pwf = Math.floor(pw)
  const phf = Math.floor(ph)
  const padding = Math.max(6, Math.round(Math.min(pwf, phf) * 0.18))
  return { pw: pwf, ph: phf, padding }
}

export function generatePieces(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  stageWidth: number,
  stageHeight: number
): PieceData[] {
  const { pw, ph, padding } = calcPieceSize(image, cols, rows, stageWidth, stageHeight)
  const tabSize = padding

  // seeded tab layout so adjacent pieces match
  const tabGrid: number[][][] = []
  for (let r = 0; r <= rows; r++) {
    tabGrid[r] = []
    for (let c = 0; c <= cols; c++) {
      tabGrid[r][c] = [
        Math.random() < 0.5 ? 1 : -1,
        Math.random() < 0.5 ? 1 : -1,
      ]
    }
  }

  const pieces: PieceData[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top = row === 0 ? 0 : tabGrid[row][col][0]
      const right = col === cols - 1 ? 0 : tabGrid[row][col + 1][1]
      const bottom = row === rows - 1 ? 0 : -tabGrid[row + 1][col][0]
      const left = col === 0 ? 0 : -tabGrid[row][col][1]
      const tabs: [number, number, number, number] = [top, right, bottom, left]

      const canvas = document.createElement('canvas')
      canvas.width = pw + padding * 2
      canvas.height = ph + padding * 2
      const ctx = canvas.getContext('2d')!

      ctx.save()
      ctx.translate(padding, padding)
      drawPiecePath(ctx, tabs, pw, ph, tabSize)
      ctx.clip()

      const sx = (col * image.width) / cols
      const sy = (row * image.height) / rows
      const sw = image.width / cols
      const sh = image.height / rows

      ctx.drawImage(
        image,
        sx - (padding * image.width) / (cols * pw),
        sy - (padding * image.height) / (rows * ph),
        sw + (2 * padding * image.width) / (cols * pw),
        sh + (2 * padding * image.height) / (rows * ph),
        -padding,
        -padding,
        pw + padding * 2,
        ph + padding * 2
      )
      ctx.restore()

      // stroke the piece outline
      ctx.save()
      ctx.translate(padding, padding)
      drawPiecePath(ctx, tabs, pw, ph, tabSize)
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      const correctX = (stageWidth - cols * pw) / 2 + col * pw - padding
      const correctY = (stageHeight - rows * ph) / 2 + row * ph - padding

      // scatter pieces randomly around the stage
      const x = Math.random() * (stageWidth - pw - padding * 2)
      const y = Math.random() * (stageHeight - ph - padding * 2)

      pieces.push({
        id: `${col}-${row}`,
        col,
        row,
        x,
        y,
        correctX,
        correctY,
        tabs,
        imageDataUrl: canvas.toDataURL(),
        locked: false,
      })
    }
  }

  return pieces
}
