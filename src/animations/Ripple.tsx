import { useRef } from 'react'
import { useAnimationLoop } from './loop'

export interface RippleConfig {
  speed?: number
  wavelength?: number
  lead?: number
  leadSigma?: number
  tailDecay?: number
  amplitude?: number
  fade?: number
}

interface Props extends RippleConfig {
  /** Epicentre in screen coordinates */
  x: number
  y: number
  quality: 'low' | 'mid' | 'high'
  /** Returns a snapshot of the board */
  capture: () => HTMLCanvasElement | null
  onDone: () => void
}

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
export default function Ripple({
  x, y, quality, capture, onDone,
  speed = 0.4,
  wavelength = 70,
  lead = 110,
  leadSigma = 45,
  tailDecay = 230,
  amplitude = 24,
  fade = 0.00022,
}: Props) {
  const { ringStep, tailStep, tail, skip } = PRESETS[quality]
  const cfgRef = useRef({ speed, wavelength, lead, leadSigma, tailDecay, amplitude, fade })
  cfgRef.current = { speed, wavelength, lead, leadSigma, tailDecay, amplitude, fade }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    snapshot: null as HTMLCanvasElement | null,
    start: null as number | null,
    done: false,
  })

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

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
      onDoneRef.current()
      return false
    }
    const now = performance.now()
    const cfg = cfgRef.current

    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = window.devicePixelRatio || 1
    const elapsed = now - s.start
    const wavefront = elapsed * cfg.speed
    const amp = cfg.amplitude * Math.exp(-elapsed * cfg.fade)
    const maxDist = Math.hypot(Math.max(x, w - x), Math.max(y, h - y))

    if (wavefront - tail > maxDist || amp < 0.4) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      s.done = true
      onDoneRef.current()
      return false
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Sharp leading edge ahead of the front, long ringing wake behind it so
    // the ripples stay visible far out across the board
    const inner = Math.max(ringStep, wavefront - tail)
    const outer = Math.min(wavefront + cfg.lead, maxDist + cfg.lead)
    let r = inner
    while (r < outer) {
      const offset = r - wavefront
      const step = offset < -80 ? tailStep : ringStep
      const phase = (offset / cfg.wavelength) * Math.PI * 2
      const falloff = offset > 0
        ? Math.exp(-(offset * offset) / (2 * cfg.leadSigma * cfg.leadSigma))
        : Math.exp(offset / cfg.tailDecay)
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
    const glow = (amp / cfg.amplitude) * 0.12
    if (wavefront > 1 && glow > 0.01) {
      ctx.beginPath()
      ctx.arc(x, y, wavefront, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${glow})`
      ctx.lineWidth = cfg.wavelength / 4
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
