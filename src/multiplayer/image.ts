// The session image travels to every joiner inside the snapshot, so size
// matters. Re-encode to JPEG with the long edge capped: a phone photo PNG
// data url can be 10 MB+, this lands around 300 to 800 KB. The host plays
// with the re-encoded image too, so every client cuts pieces from pixel
// identical source data.
const MAX_EDGE = 2048
const QUALITY = 0.85

export function prepareNetImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not prepare image'))
        return
      }
      // JPEG has no alpha; flatten onto white so transparent PNGs do not
      // come out black
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}
