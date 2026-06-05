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

// Convert a list of anchor points into smooth cubic bezier segments that pass
// through every anchor (Catmull-Rom). m0 and mEnd set the tangent at the first
// and last anchor; interior tangents are the average of each anchor's
// neighbours, scaled by tension.
function smoothBeziers(
  pts: [number, number][],
  m0: [number, number],
  mEnd: [number, number],
  tension: number
) {
  const n = pts.length
  const m: [number, number][] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) m.push(m0)
    else if (i === n - 1) m.push(mEnd)
    else m.push([
      (pts[i + 1][0] - pts[i - 1][0]) * 0.5 * tension,
      (pts[i + 1][1] - pts[i - 1][1]) * 0.5 * tension,
    ])
  }
  const segs: number[][] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1]
    segs.push([
      p0[0] + m[i][0] / 3,     p0[1] + m[i][1] / 3,
      p1[0] - m[i + 1][0] / 3, p1[1] - m[i + 1][1] / 3,
      p1[0], p1[1],
    ])
  }
  return segs
}

// Draw one edge from corner A to corner B. If d !== 0 a classic jigsaw tab is
// added: broad shoulders, a short low waist, and a round bulb that overhangs
// the waist (the undercut that makes pieces feel like they lock together). The
// profile is symmetric about the edge midpoint and d only flips the outward
// direction, so a blank (d = -1) is the exact mirror of a tab (d = +1) and
// every hole matches the knob that fits it.
function edgeWithKnob(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  nx: number, ny: number, // unit outward normal (tab protrusion direction)
  d: number,
  u: number               // knob unit = tabSize times the effective scale
) {
  if (!d) { ctx.lineTo(bx, by); return }

  const L = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / L, uy = (by - ay) / L
  const map = (s: number, o: number): [number, number] => [
    ax + (L / 2 + s) * ux + d * o * nx,
    ay + (L / 2 + s) * uy + d * o * ny,
  ]

  // Tab profile in local units of u: s = along the edge, o = outward.
  const A: [number, number][] = ([
    [-0.34, 0.00], // base-left (shoulder)
    [-0.22, 0.20], // neck waist (pinch)
    [-0.40, 0.52], // bulb lower-left, widest point, overhangs the waist
    [ 0.00, 0.78], // bulb top (rounded)
    [ 0.40, 0.52], // bulb lower-right
    [ 0.22, 0.20], // neck waist
    [ 0.34, 0.00], // base-right
  ] as [number, number][]).map(([s, o]): [number, number] => [s * u, o * u])

  // tangents at the flat-edge ends run along the edge so the knob blends in
  const segs = smoothBeziers(A, [0.30 * u, 0], [0.30 * u, 0], 1.0)

  const p = map(A[0][0], A[0][1]); ctx.lineTo(p[0], p[1])
  for (const sg of segs) {
    const c1 = map(sg[0], sg[1]), c2 = map(sg[2], sg[3]), e = map(sg[4], sg[5])
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1])
  }
  ctx.lineTo(bx, by)
}

// Knob size is entered as a number where 100 is the standard size. The tab
// reaches 0.78u outward, so at 128 the knob tip reaches the piece border, the
// point where it would meet the neighbouring piece. That is the hard ceiling;
// going higher would clip the knob. The floor just keeps it visible.
export const KNOB_MIN = 40
export const KNOB_MAX = 128
export const KNOB_DEFAULT = 113
function knobScale(knobSize: number) {
  const pct = Number.isFinite(knobSize) ? knobSize : 100
  return Math.min(KNOB_MAX, Math.max(KNOB_MIN, pct)) / 100
}

// Standard: proper jigsaw knob, a narrow neck leading to a round bulb (drop)
function drawPathStandard(
  ctx: CanvasRenderingContext2D,
  tabs: [number, number, number, number],
  w: number,
  h: number,
  t: number,
  knobSize: number
) {
  const [top, right, bottom, left] = tabs

  const u = t * knobScale(knobSize)

  ctx.beginPath()
  ctx.moveTo(0, 0)

  // Top edge: left to right, tab protrudes upward
  edgeWithKnob(ctx, 0, 0, w, 0, 0, -1, top, u)
  // Right edge: top to bottom, tab protrudes rightward
  edgeWithKnob(ctx, w, 0, w, h, 1, 0, right, u)
  // Bottom edge: right to left, tab protrudes downward
  edgeWithKnob(ctx, w, h, 0, h, 0, 1, bottom, u)
  // Left edge: bottom to top, tab protrudes leftward
  edgeWithKnob(ctx, 0, h, 0, 0, -1, 0, left, u)

  ctx.closePath()
}

// Artsy: copy of Standard — modify this one to create a distinct look
function drawPathArtsy(
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

function drawPiecePath(
  ctx: CanvasRenderingContext2D,
  tabs: [number, number, number, number],
  w: number,
  h: number,
  t: number,
  style: string,
  knobSize: number
) {
  if (style === 'artsy') return drawPathArtsy(ctx, tabs, w, h, t)
  return drawPathStandard(ctx, tabs, w, h, t, knobSize)
}

export function calcPieceSize(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  stageWidth: number,
  stageHeight: number,
  knobSize = 100
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
  // larger knobs need a bigger canvas border so the tab stays in bounds
  const padding = Math.max(6, Math.round(Math.min(pw, ph) * 0.28 * Math.max(1, knobScale(knobSize))))
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
  piece: Omit<PieceData, 'canvas' | 'displayW' | 'displayH'>,
  image: HTMLImageElement,
  cols: number,
  rows: number,
  pw: number,
  ph: number,
  padding: number,
  resolution: number,
  pieceStyle = 'standard',
  knobSize = 100
): { canvas: HTMLCanvasElement; displayW: number; displayH: number } {
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
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize, pieceStyle, knobSize)
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
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize, pieceStyle, knobSize)
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  return { canvas, displayW: logicalW, displayH: logicalH }
}

// Keep type alias for the return of renderPiece
export type RenderedPiece = { canvas: HTMLCanvasElement; displayW: number; displayH: number }
