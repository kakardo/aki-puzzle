const COLORS = [
  '#ff6b6b', '#ffa94d', '#ffe066', '#69db7c',
  '#38d9a9', '#4dabf7', '#748ffc', '#da77f2',
  '#f783ac', '#a9e34b', '#66d9e8', '#ff8787',
]

export function generateDebugImage(cols: number, rows: number): string {
  const cellW = 120
  const cellH = 120
  const canvas = document.createElement('canvas')
  canvas.width = cols * cellW
  canvas.height = rows * cellH
  const ctx = canvas.getContext('2d')!

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const x = c * cellW
      const y = r * cellH

      ctx.fillStyle = COLORS[idx % COLORS.length]
      ctx.fillRect(x, y, cellW, cellH)

      const fontSize = Math.round(Math.min(cellW, cellH) * 0.38)
      ctx.font = `bold ${fontSize}px monospace`
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), x + cellW / 2, y + cellH / 2)
    }
  }

  return canvas.toDataURL()
}
