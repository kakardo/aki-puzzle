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
  const aspect = image.width / image.height
  // puzzle occupies 55% of each screen dimension — equal margins on all sides
  const fraction = 0.50
  let pw = (stageWidth * fraction) / cols
  let ph = pw / aspect
  if (ph * rows > stageHeight * fraction) {
    ph = (stageHeight * fraction) / rows
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

  const gap = 8
  const slotW = pw + padding * 2 + gap
  const slotH = ph + padding * 2 + gap

  // grid dimensions covering the full screen
  const gridCols = Math.floor(stageWidth / slotW)
  const gridRows = Math.floor(stageHeight / slotH)

  // offset to centre the grid on screen
  const gridOffsetX = Math.round((stageWidth - gridCols * slotW) / 2)
  const gridOffsetY = Math.round((stageHeight - gridRows * slotH) / 2)

  // puzzle occupies the central cells — find which grid cells it covers
  const originX = Math.round((stageWidth - cols * pw) / 2)
  const originY = Math.round((stageHeight - rows * ph) / 2)
  const puzzleRight = originX + cols * pw
  const puzzleBottom = originY + rows * ph

  const slots: { x: number; y: number; dist: number }[] = []

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const x = gridOffsetX + c * slotW
      const y = gridOffsetY + r * slotH
      // skip if this slot overlaps (or touches) the puzzle area
      const overlaps = x < puzzleRight && x + slotW > originX &&
                       y < puzzleBottom && y + slotH > originY
      if (overlaps) continue

      // distance from slot centre to nearest point on puzzle rectangle
      const sx = x + slotW / 2
      const sy = y + slotH / 2
      const dx = Math.max(0, Math.max(originX - sx, sx - puzzleRight))
      const dy = Math.max(0, Math.max(originY - sy, sy - puzzleBottom))
      slots.push({ x, y, dist: Math.sqrt(dx * dx + dy * dy) })
    }
  }

  // sort closest to puzzle first, shuffle within equal-distance tiers
  slots.sort((a, b) => a.dist - b.dist)

  let slotIndex = 0

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

      // place in a margin slot, fall back to random if slots exhausted
      let x: number, y: number
      if (slotIndex < slots.length) {
        x = slots[slotIndex].x
        y = slots[slotIndex].y
        slotIndex++
      } else {
        x = Math.random() * (stageWidth - pw - padding * 2)
        y = Math.random() * (stageHeight - ph - padding * 2)
      }

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
