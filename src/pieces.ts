export interface PieceData {
  id: string
  col: number
  row: number
  x: number
  y: number
  correctX: number
  correctY: number
  tabs: [number, number, number, number] // top, right, bottom, left: 1=tab, -1=blank
  canvas: HTMLCanvasElement
  displayW: number
  displayH: number
  locked: boolean
}

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
  ctx.lineTo(w / 2 - t, 0)
  ctx.bezierCurveTo(w / 2 - t, -top * t, w / 2 + t, -top * t, w / 2 + t, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h / 2 - t)
  ctx.bezierCurveTo(w + right * t, h / 2 - t, w + right * t, h / 2 + t, w, h / 2 + t)
  ctx.lineTo(w, h)
  ctx.lineTo(w / 2 + t, h)
  ctx.bezierCurveTo(w / 2 + t, h + bottom * t, w / 2 - t, h + bottom * t, w / 2 - t, h)
  ctx.lineTo(0, h)
  ctx.lineTo(0, h / 2 + t)
  ctx.bezierCurveTo(-left * t, h / 2 + t, -left * t, h / 2 - t, 0, h / 2 - t)
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
  const fraction = 0.40

  let frameW = stageWidth * fraction
  let frameH = frameW / aspect
  if (frameH > stageHeight * fraction) {
    frameH = stageHeight * fraction
    frameW = frameH * aspect
  }

  const pw = Math.max(1, Math.floor(frameW / cols))
  const ph = Math.max(1, Math.floor(frameH / rows))
  const padding = Math.max(4, Math.round(Math.min(pw, ph) * 0.22))
  return { pw, ph, padding }
}

// Phase 1: fast — compute positions, slots, and tab shapes. No canvas work.
export function generatePieceLayout(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  stageWidth: number,
  stageHeight: number
): { pieces: Omit<PieceData, 'imageDataUrl' | 'displayW' | 'displayH'>[], pw: number; ph: number; padding: number } {
  const { pw, ph, padding } = calcPieceSize(image, cols, rows, stageWidth, stageHeight)

  const gap = 8
  const slotW = pw + padding * 2 + gap
  const slotH = ph + padding * 2 + gap

  const originX = Math.round((stageWidth - cols * pw) / 2)
  const originY = Math.round((stageHeight - rows * ph) / 2)
  const puzzleRight = originX + cols * pw
  const puzzleBottom = originY + rows * ph
  const margin = 32

  const needed = cols * rows
  const layoutScale = Math.max(1, Math.sqrt(needed / 60))
  const extraX = (stageWidth  * (layoutScale - 1)) / 2
  const extraY = (stageHeight * (layoutScale - 1)) / 2

  const strips = [
    { x0: -extraX,              y0: -extraY,                   x1: stageWidth + extraX, y1: originY - margin },
    { x0: -extraX,              y0: puzzleBottom + margin,      x1: stageWidth + extraX, y1: stageHeight + extraY },
    { x0: -extraX,              y0: originY - margin,           x1: originX - margin,    y1: puzzleBottom + margin },
    { x0: puzzleRight + margin, y0: originY - margin,           x1: stageWidth + extraX, y1: puzzleBottom + margin },
  ]

  const slots: { x: number; y: number; dist: number }[] = []
  for (const strip of strips) {
    const stripW = strip.x1 - strip.x0
    const stripH = strip.y1 - strip.y0
    if (stripW < slotW || stripH < slotH) continue
    const nCols = Math.floor(stripW / slotW)
    const nRows = Math.floor(stripH / slotH)
    const offX = strip.x0 + (stripW - nCols * slotW) / 2
    const offY = strip.y0 + (stripH - nRows * slotH) / 2
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const x = offX + c * slotW
        const y = offY + r * slotH
        const sx = x + slotW / 2
        const sy = y + slotH / 2
        const dx = Math.max(0, Math.max(originX - sx, sx - puzzleRight))
        const dy = Math.max(0, Math.max(originY - sy, sy - puzzleBottom))
        slots.push({ x, y, dist: Math.sqrt(dx * dx + dy * dy) })
      }
    }
  }
  slots.sort((a, b) => a.dist - b.dist)

  const tabGrid: number[][][] = []
  for (let r = 0; r <= rows; r++) {
    tabGrid[r] = []
    for (let c = 0; c <= cols; c++) {
      tabGrid[r][c] = [Math.random() < 0.5 ? 1 : -1, Math.random() < 0.5 ? 1 : -1]
    }
  }

  let slotIndex = 0
  const pieces: Omit<PieceData, 'imageDataUrl' | 'displayW' | 'displayH'>[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top    = row === 0         ? 0 : tabGrid[row][col][0]
      const right  = col === cols - 1  ? 0 : tabGrid[row][col + 1][1]
      const bottom = row === rows - 1  ? 0 : -tabGrid[row + 1][col][0]
      const left   = col === 0         ? 0 : -tabGrid[row][col][1]
      const tabs: [number, number, number, number] = [top, right, bottom, left]

      const correctX = (stageWidth - cols * pw) / 2 + col * pw - padding
      const correctY = (stageHeight - rows * ph) / 2 + row * ph - padding

      let x: number, y: number
      if (slotIndex < slots.length) {
        x = slots[slotIndex].x; y = slots[slotIndex].y; slotIndex++
      } else {
        x = Math.random() * (stageWidth - pw - padding * 2)
        y = Math.random() * (stageHeight - ph - padding * 2)
      }

      pieces.push({ id: `${col}-${row}`, col, row, x, y, correctX, correctY, tabs, locked: false })
    }
  }

  return { pieces, pw, ph, padding }
}

// Phase 2: render a single piece canvas. Call in a chunked loop.
export function renderPiece(
  piece: Omit<PieceData, 'imageDataUrl' | 'displayW' | 'displayH'>,
  image: HTMLImageElement,
  cols: number,
  rows: number,
  pw: number,
  ph: number,
  padding: number,
  resolution: number
): { imageDataUrl: string; displayW: number; displayH: number } {
  const tabSize = padding
  const naturalRes = Math.min(image.width / (cols * pw), image.height / (rows * ph))
  const RES = Math.max(1, Math.min(resolution, naturalRes))
  const logicalW = pw + padding * 2
  const logicalH = ph + padding * 2

  const canvas = document.createElement('canvas')
  canvas.width = logicalW * RES
  canvas.height = logicalH * RES
  const ctx = canvas.getContext('2d')!
  ctx.scale(RES, RES)

  ctx.save()
  ctx.translate(padding, padding)
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize)
  ctx.clip()

  const sx = (piece.col * image.width)  / cols
  const sy = (piece.row * image.height) / rows
  const sw = image.width  / cols
  const sh = image.height / rows

  ctx.drawImage(
    image,
    sx - (padding * image.width)  / (cols * pw),
    sy - (padding * image.height) / (rows * ph),
    sw + (2 * padding * image.width)  / (cols * pw),
    sh + (2 * padding * image.height) / (rows * ph),
    -padding, -padding,
    pw + padding * 2, ph + padding * 2
  )
  ctx.restore()

  ctx.save()
  ctx.translate(padding, padding)
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  return { canvas, displayW: logicalW, displayH: logicalH }
}

// Keep type alias for the return of renderPiece
export type RenderedPiece = { canvas: HTMLCanvasElement; displayW: number; displayH: number }
