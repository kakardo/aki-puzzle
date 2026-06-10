export interface PieceData {
  id: string
  col: number
  row: number
  x: number
  y: number
  correctX: number
  correctY: number
  tabs: [number, number, number, number]  // top, right, bottom, left: 1=tab, -1=blank
  waves: [number, number, number, number] // top, right, bottom, left: -1..1 wave seed
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

// S-curve from (ax,ay) to (bx,by) bowing perpendicularly by amp. Adjacent
// pieces use the same formula with negated nx/ny and negated amp (because the
// wave seed is negated in tabGrid), so the curves are geometrically identical.
// Verified: reversing start/end with negated n and negated amp gives the same
// bezier traversed in the opposite direction.
function wavyLineTo(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  nx: number, ny: number,
  amp: number
) {
  const cp1x = ax + (bx - ax) * 0.4 + nx * amp
  const cp1y = ay + (by - ay) * 0.4 + ny * amp
  const cp2x = ax + (bx - ax) * 0.6 - nx * amp
  const cp2y = ay + (by - ay) * 0.6 - ny * amp
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, bx, by)
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
  u: number,              // knob unit = tabSize times the effective scale
  waveSeed = 0,
  useWaves = false
) {
  const amp = useWaves ? u * 0.08 * waveSeed : 0
  if (!d) {
    if (amp) wavyLineTo(ctx, ax, ay, bx, by, nx, ny, amp)
    else ctx.lineTo(bx, by)
    return
  }

  const L = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / L, uy = (by - ay) / L
  const map = (s: number, o: number): [number, number] => [
    ax + (L / 2 + s) * ux + d * o * nx,
    ay + (L / 2 + s) * uy + d * o * ny,
  ]

  // Tab profile in local units of u: s = along the edge, o = outward.
  // Wide base blending into a gentle neck, then a compact round disc head
  // that is wider than it is tall, matching the classic blue-piece jigsaw shape.
  // Thick stem tapering gently into a round head. Neck is roughly 75% of head width.
  // Points at cardinal and 45° positions keep the Catmull-Rom circular.
  const A: [number, number][] = ([
    [-0.24, 0.00], // base-left
    [-0.20, 0.20], // neck left (thick stem)
    [-0.22, 0.32], // circle entry-left
    [-0.30, 0.50], // circle equator-left  (9 o'clock)
    [-0.20, 0.68], // circle upper-left    (upper-left 45°)
    [ 0.00, 0.76], // circle top           (12 o'clock)
    [ 0.20, 0.68], // circle upper-right
    [ 0.30, 0.50], // circle equator-right (3 o'clock)
    [ 0.22, 0.32], // circle entry-right
    [ 0.20, 0.20], // neck right
    [ 0.24, 0.00], // base-right
  ] as [number, number][]).map(([s, o]): [number, number] => [s * u, o * u])

  // tangents at the flat-edge ends run along the edge so the knob blends in
  const segs = smoothBeziers(A, [0.26 * u, 0], [0.26 * u, 0], 1.0)

  const p = map(A[0][0], A[0][1])
  if (amp) wavyLineTo(ctx, ax, ay, p[0], p[1], nx, ny, amp)
  else ctx.lineTo(p[0], p[1])
  for (const sg of segs) {
    const c1 = map(sg[0], sg[1]), c2 = map(sg[2], sg[3]), e = map(sg[4], sg[5])
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1])
  }
  const pEnd = map(A[A.length - 1][0], A[A.length - 1][1])
  if (amp) wavyLineTo(ctx, pEnd[0], pEnd[1], bx, by, nx, ny, amp)
  else ctx.lineTo(bx, by)
}

// Knob size controls how large the tabs are. The tab reaches 0.78u outward,
// so at 128 the knob tip reaches the piece border, the point where it would
// meet the neighbouring piece. That is the hard ceiling; going higher would
// clip the knob. The floor just keeps it visible.
export const KNOB_MIN = 40
export const KNOB_MAX = 128
export const KNOB_DEFAULT = 116
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
  knobSize: number,
  waves: [number, number, number, number] = [0, 0, 0, 0],
  useWaves = false
) {
  const [top, right, bottom, left] = tabs
  const [wTop, wRight, wBottom, wLeft] = waves

  const u = t * knobScale(knobSize)

  ctx.beginPath()
  ctx.moveTo(0, 0)

  edgeWithKnob(ctx, 0, 0, w, 0, 0, -1, top, u, wTop, useWaves)
  edgeWithKnob(ctx, w, 0, w, h, 1, 0, right, u, wRight, useWaves)
  edgeWithKnob(ctx, w, h, 0, h, 0, 1, bottom, u, wBottom, useWaves)
  edgeWithKnob(ctx, 0, h, 0, 0, -1, 0, left, u, wLeft, useWaves)

  ctx.closePath()
}

// Artsy: copy of Standard. Modify this one to create a distinct look
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
  knobSize: number,
  waves: [number, number, number, number] = [0, 0, 0, 0],
  useWaves = false
) {
  if (style === 'artsy') return drawPathArtsy(ctx, tabs, w, h, t)
  return drawPathStandard(ctx, tabs, w, h, t, knobSize, waves, useWaves)
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
  const padding = Math.max(2, Math.round(Math.min(pw, ph) * 0.28 * Math.max(1, knobScale(knobSize))))
  return { pw, ph, padding }
}

// Phase 1: fast. Compute positions, slots, and tab shapes. No canvas work.
export function generatePieceLayout(
  image: HTMLImageElement,
  cols: number,
  rows: number,
  stageWidth: number,
  stageHeight: number,
  knobSize = 100,
  gap = 8
): { pieces: Omit<PieceData, 'imageDataUrl' | 'displayW' | 'displayH'>[], pw: number; ph: number; padding: number } {
  const { pw, ph, padding } = calcPieceSize(image, cols, rows, stageWidth, stageHeight, knobSize)
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

  // Build each strip's slots separately so opposite strips can be kept in step.
  // Strips are ordered top, bottom, left, right, which makes (0,1) a mirror pair
  // above/below the puzzle and (2,3) a mirror pair to its left/right. Each slot
  // keeps its strip and grid cell so the outer edge can be tidied later.
  type Slot = { x: number; y: number; dist: number; strip: number; r: number; c: number }
  const stripSlots: Slot[][] = strips.map(() => [])
  strips.forEach((strip, si) => {
    const stripW = strip.x1 - strip.x0
    const stripH = strip.y1 - strip.y0
    if (stripW < slotW || stripH < slotH) return
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
        stripSlots[si].push({ x, y, dist: Math.sqrt(dx * dx + dy * dy), strip: si, r, c })
      }
    }
  })

  // Order each strip nearest first; since distance grows toward the corners,
  // this also fills every row from its centre outward.
  for (const s of stripSlots) s.sort((a, b) => a.dist - b.dist)

  // Pair each slot with its 180 degree rotation about the puzzle centre, so the
  // whole scatter is point symmetric. A unit holds both partners and they are
  // always placed together, so whatever spills over on the top-left is matched
  // bottom-right, and a spill on one side is matched on the far side flipped top
  // to bottom. Rotation keeps the distance to the puzzle equal for both, so the
  // oval is preserved.
  type Unit = { dist: number; slots: Slot[] }
  const allSlotsFlat = stripSlots.flat()
  // Strips are ordered top, bottom, left, right. A 180 degree rotation swaps top
  // with bottom and left with right (strip ^ 1), reversing both the row and the
  // column within the partner strip. Pairing by grid cell this way is exact, so
  // there is no risk of a rounding mismatch between strips.
  const stripDims = stripSlots.map(list => {
    let maxR = -1, maxC = -1
    for (const s of list) { if (s.r > maxR) maxR = s.r; if (s.c > maxC) maxC = s.c }
    return { nRows: maxR + 1, nCols: maxC + 1 }
  })
  const stripCell = stripSlots.map(list => {
    const m = new Map<string, Slot>()
    for (const s of list) m.set(`${s.r}:${s.c}`, s)
    return m
  })
  const paired = new Set<Slot>()
  const units: Unit[] = []
  for (const s of allSlotsFlat) {
    if (paired.has(s)) continue
    paired.add(s)
    const slots: Slot[] = [s]
    const ps = s.strip ^ 1
    const dim = stripDims[ps]
    const partner = stripCell[ps].get(`${dim.nRows - 1 - s.r}:${dim.nCols - 1 - s.c}`)
    if (partner && !paired.has(partner)) {
      paired.add(partner)
      slots.push(partner)
    }
    units.push({ dist: s.dist, slots })
  }
  // Nearest unit first keeps the overall oval.
  units.sort((a, b) => a.dist - b.dist)

  // Take the nearest units to hold pieces, but never overshoot into a half
  // filled pair, so the chosen set stays fully symmetric.
  const used = new Set<Unit>()
  const usedSlots = new Set<Slot>()
  let filled = 0
  for (const u of units) {
    if (filled >= needed) break
    if (filled + u.slots.length > needed) continue
    used.add(u)
    for (const s of u.slots) usedSlots.add(s)
    filled += u.slots.length
  }

  // Count filled neighbours for any slot, across all strips, so the edge can be
  // judged the same way everywhere.
  const byCell = new Map<string, Slot>()
  for (const s of allSlotsFlat) byCell.set(`${s.strip}:${s.r}:${s.c}`, s)
  const filledNeighbours = (s: Slot) => {
    let n = 0
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = byCell.get(`${s.strip}:${s.r + dr}:${s.c + dc}`)
      if (v && usedSlots.has(v)) n++
    }
    return n
  }

  // The outward direction of each strip: the way that points away from the
  // puzzle, so the front of a filled line can be found.
  const outward: Record<number, [number, number]> = { 0: [-1, 0], 1: [1, 0], 2: [0, -1], 3: [0, 1] }
  const cellFilled = (strip: number, r: number, c: number) => {
    const v = byCell.get(`${strip}:${r}:${c}`)
    return !!(v && usedSlots.has(v))
  }
  // Length of the filled run through a cell, measured along the strip, so top
  // and bottom strips count across a row and side strips count down a column.
  const lineRun = (strip: number, r: number, c: number) => {
    if (!cellFilled(strip, r, c)) return 0
    const horizontal = strip === 0 || strip === 1
    let len = 1
    if (horizontal) {
      let k = c - 1; while (cellFilled(strip, r, k)) { len++; k-- }
      k = c + 1; while (cellFilled(strip, r, k)) { len++; k++ }
    } else {
      let k = r - 1; while (cellFilled(strip, k, c)) { len++; k-- }
      k = r + 1; while (cellFilled(strip, k, c)) { len++; k++ }
    }
    return len
  }
  // A filled unit is a stray if its anchor has fewer than two filled neighbours
  // (a lone tip), or it sits on the outer front of a run that is far shorter
  // than the line just inside it (a nub on top of a full row). The relative test
  // catches sharp nubs while leaving a gradual oval taper alone.
  const isStray = (u: Unit) => {
    const s = u.slots[0]
    if (filledNeighbours(s) < 2) return true
    const [dr, dc] = outward[s.strip]
    if (!cellFilled(s.strip, s.r + dr, s.c + dc)) {
      const run = lineRun(s.strip, s.r, s.c)
      const innerRun = lineRun(s.strip, s.r - dr, s.c - dc)
      if (run * 3 < innerRun) return true
    }
    return false
  }

  // Tidy the outer edge so no piece is left stranded past it. Each stray moves to
  // the nearest empty notch, an open unit whose anchor already has two filled
  // neighbours. Whole units move together, so the mirror symmetry holds, and
  // every move trades a far slot for a nearer one, so the passes always settle.
  for (let pass = 0; pass < 6; pass++) {
    const strays = [...used]
      .filter(u => u.slots.length === 2 && isStray(u))
      .sort((a, b) => b.dist - a.dist)
    const notches = units
      .filter(u => u.slots.length === 2 && !used.has(u) && filledNeighbours(u.slots[0]) >= 2)
      .sort((a, b) => a.dist - b.dist)
    let changed = false
    let ni = 0
    for (const stray of strays) {
      while (ni < notches.length && used.has(notches[ni])) ni++
      if (ni < notches.length && notches[ni].dist < stray.dist) {
        const into = notches[ni]
        used.delete(stray)
        for (const s of stray.slots) usedSlots.delete(s)
        used.add(into)
        for (const s of into.slots) usedSlots.add(s)
        ni++
        changed = true
      }
    }
    if (!changed) break
  }

  // An odd piece count leaves one slot over. Place it on the best connected open
  // slot, the one touching the most filled neighbours and nearest in a tie, so
  // it tucks into a row rather than standing alone out past the edge.
  while (filled < needed) {
    let best: Slot | null = null
    let bestScore = -1
    for (const s of allSlotsFlat) {
      if (usedSlots.has(s)) continue
      const score = filledNeighbours(s)
      if (score > bestScore || (score === bestScore && best !== null && s.dist < best.dist)) {
        best = s
        bestScore = score
      }
    }
    if (!best) break
    usedSlots.add(best)
    filled++
  }

  // Filled slots first (nearest first), then the rest, so the pieces land on the
  // tidied set.
  const slots: { x: number; y: number }[] = []
  const orderedSlots = [...allSlotsFlat].sort((a, b) => a.dist - b.dist)
  for (const s of orderedSlots) if (usedSlots.has(s)) slots.push({ x: s.x, y: s.y })
  for (const s of orderedSlots) if (!usedSlots.has(s)) slots.push({ x: s.x, y: s.y })

  const tabGrid: number[][][] = []
  for (let r = 0; r <= rows; r++) {
    tabGrid[r] = []
    for (let c = 0; c <= cols; c++) {
      tabGrid[r][c] = [
        Math.random() < 0.5 ? 1 : -1, // vertical tab direction
        Math.random() < 0.5 ? 1 : -1, // horizontal tab direction
        Math.random() * 2 - 1,         // vertical edge wave seed
        Math.random() * 2 - 1,         // horizontal edge wave seed
      ]
    }
  }

  const pieces: Omit<PieceData, 'imageDataUrl' | 'displayW' | 'displayH'>[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top    = row === 0         ? 0 : tabGrid[row][col][0]
      const right  = col === cols - 1  ? 0 : tabGrid[row][col + 1][1]
      const bottom = row === rows - 1  ? 0 : -tabGrid[row + 1][col][0]
      const left   = col === 0         ? 0 : -tabGrid[row][col][1]
      const tabs: [number, number, number, number] = [top, right, bottom, left]

      const wTop    = row === 0         ? 0 : tabGrid[row][col][2]
      const wRight  = col === cols - 1  ? 0 : tabGrid[row][col + 1][3]
      const wBottom = row === rows - 1  ? 0 : -tabGrid[row + 1][col][2]
      const wLeft   = col === 0         ? 0 : -tabGrid[row][col][3]
      const waves: [number, number, number, number] = [wTop, wRight, wBottom, wLeft]

      const correctX = (stageWidth - cols * pw) / 2 + col * pw - padding
      const correctY = (stageHeight - rows * ph) / 2 + row * ph - padding

      pieces.push({ id: `${col}-${row}`, col, row, x: 0, y: 0, correctX, correctY, tabs, waves, locked: false })
    }
  }

  // Assign pieces to slots in a shuffled order so grid neighbours do not end up
  // in neighbouring slots. The slot pattern itself is unchanged: the same slots
  // get filled, only which piece lands in each one is randomised.
  const order = pieces.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  for (let k = 0; k < order.length; k++) {
    const piece = pieces[order[k]]
    if (k < slots.length) {
      piece.x = slots[k].x; piece.y = slots[k].y
    } else {
      piece.x = Math.random() * (stageWidth - pw - padding * 2)
      piece.y = Math.random() * (stageHeight - ph - padding * 2)
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
  knobSize = 100,
  edgeStyle: 'straight' | 'waves' = 'straight',
  showBorder = true,
): { canvas: HTMLCanvasElement; displayW: number; displayH: number } {
  const tabSize = padding
  const naturalRes = Math.min(image.width / (cols * pw), image.height / (rows * ph))
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  // Auto (99): match image density (DPR-independent, image pixels are fixed).
  // Fixed values: multiply by DPR so "4x" means crisp at 4x zoom on any screen,
  // including retina displays where Konva scales all drawing by DPR internally.
  const RES = resolution === 99 ? Math.max(1, naturalRes) : Math.max(1, resolution * dpr)
  const logicalW = pw + padding * 2
  const logicalH = ph + padding * 2

  const canvas = document.createElement('canvas')
  canvas.width = logicalW * RES
  canvas.height = logicalH * RES
  const ctx = canvas.getContext('2d')!
  ctx.scale(RES, RES)

  ctx.save()
  ctx.translate(padding, padding)
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize, pieceStyle, knobSize, piece.waves, edgeStyle === 'waves')
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

  // Border is drawn externally on a live overlay canvas so it stays
  // 1 physical pixel at every zoom level. Nothing to do here.

  return { canvas, displayW: logicalW, displayH: logicalH }
}

// Keep type alias for the return of renderPiece
export type RenderedPiece = { canvas: HTMLCanvasElement; displayW: number; displayH: number }

// Draw only the outline path for a piece into an external canvas context.
// Used by the live border overlay in PuzzleBoard so borders are always
// rendered at 1 physical pixel regardless of zoom level.
export function renderPieceOutline(
  ctx: CanvasRenderingContext2D,
  piece: Pick<PieceData, 'tabs' | 'waves'>,
  pw: number,
  ph: number,
  tabSize: number,
  pieceStyle: string,
  knobSize: number,
  edgeStyle: 'straight' | 'waves'
) {
  drawPiecePath(ctx, piece.tabs, pw, ph, tabSize, pieceStyle, knobSize, piece.waves, edgeStyle === 'waves')
}
