import { useRef } from 'react'
import { useAnimationLoop } from './loop'

interface Props {
  /** Epicentre in screen coordinates */
  x: number
  y: number
  quality: 'low' | 'mid' | 'high'
  /** Returns a snapshot of the board */
  capture: () => HTMLCanvasElement | null
  onDone: () => void
}

const SPEED = 0.4       // wavefront speed, px per ms
const WAVELENGTH = 70   // px between crests
const LEAD = 110        // band ahead of the wavefront
const LEAD_SIGMA = 45   // sharpness of the leading edge
const TAIL_DECAY = 230  // how slowly the wake dies off behind the front
const AMPLITUDE = 24    // max radial displacement in px
const FADE = 0.00022    // amplitude decay per ms

// ringStep: annulus thickness near the front. tailStep: coarser annuli deep
// in the wake, where it is smooth. tail: wake length. skip: rings displacing
// less than this many px are not drawn
const PRESETS = {
  low:  { ringStep: 14, tailStep: 28, tail: 240, skip: 0.8 },
  mid:  { ringStep: 10, tailStep: 20, tail: 300, skip: 0.6 },
  high: { ringStep: 8,  tailStep: 16, tail: 360, skip: 0.5 },
}

/**
 * A wave that radiates outward from the last piece placed, briefly distorting
 * the image. Works on a frozen snapshot of the board: each frame, thin annuli
 * around the wavefront are redrawn scaled slightly toward or away from the
 * epicentre, which reads as a water ripple passing over the picture.
 */
export default function Ripple({ x, y, quality, capture, onDone }: Props) {
  const { ringStep, tailStep, tail, skip } = PRESETS[quality]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    snapshot: null as HTMLCanvasElement | null,
    start: null as number | null,
    done: false,
  })

  useAnimationLoop(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = stateRef.current
    if (s.done) return false

    if (s.start === null) {
      // First frame runs after the final snap has rendered, so the snapshot
      // shows the completed picture. Capturing a large stage can take a
      // while, so the clock starts after it, or the wave skips its opening
      s.snapshot = capture()
      s.start = performance.now()
    }
    if (!s.snapshot) {
      s.done = true
      onDone()
      return false
    }
    const now = performance.now()

    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    const elapsed = now - s.start
    const wavefront = elapsed * SPEED
    const amp = AMPLITUDE * Math.exp(-elapsed * FADE)
    const maxDist = Math.hypot(Math.max(x, w - x), Math.max(y, h - y))

    if (wavefront - tail > maxDist || amp < 0.4) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      s.done = true
      onDone()
      return false
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Sharp leading edge ahead of the front, long ringing wake behind it so
    // the ripples stay visible far out across the board
    const inner = Math.max(ringStep, wavefront - tail)
    const outer = Math.min(wavefront + LEAD, maxDist + LEAD)
    let r = inner
    while (r < outer) {
      const offset = r - wavefront
      const step = offset < -80 ? tailStep : ringStep
      const phase = (offset / WAVELENGTH) * Math.PI * 2
      const falloff = offset > 0
        ? Math.exp(-(offset * offset) / (2 * LEAD_SIGMA * LEAD_SIGMA))
        : Math.exp(offset / TAIL_DECAY)
      const d = amp * Math.sin(phase) * falloff
      if (Math.abs(d) < skip) { r += step; continue }
      const scale = (r + d) / r
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r + step, 0, Math.PI * 2)
      ctx.arc(x, y, r, 0, Math.PI * 2, true)
      ctx.clip()
      ctx.translate(x, y)
      ctx.scale(scale, scale)
      ctx.translate(-x, -y)
      ctx.drawImage(s.snapshot, 0, 0, w, h)
      ctx.restore()
      r += step
    }

    // Crest highlight to sell the wave
    const glow = (amp / AMPLITUDE) * 0.12
    if (wavefront > 1 && glow > 0.01) {
      ctx.beginPath()
      ctx.arc(x, y, wavefront, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${glow})`
      ctx.lineWidth = WAVELENGTH / 4
      ctx.stroke()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth * (window.devicePixelRatio || 1)}
      height={window.innerHeight * (window.devicePixelRatio || 1)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 18,
      }}
    />
  )
}
