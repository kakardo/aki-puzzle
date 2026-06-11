import { useRef } from 'react'
import { useAnimationLoop } from './loop'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  decay: number
  radius: number
  hue: number
  brightness: number
}

interface Shell {
  x: number
  y: number
  vy: number
  hue: number
  exploded: boolean
}

const DURATION = 20_000
const LAUNCH_INTERVAL = 700

export default function Fireworks({ onFadeOutStart }: { onFadeOutStart: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    particles: [] as Particle[],
    shells: [] as Shell[],
    lastLaunch: 0,
    startTime: null as number | null,
    elapsed: 0,
    done: false,
  })

  useAnimationLoop((rawDt) => {
    const dt = rawDt * 0.4
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const s = stateRef.current

    const now = performance.now()
    if (s.startTime === null) s.startTime = now
    s.elapsed = now - s.startTime
    const launching = s.elapsed < DURATION

    if (launching && now - s.lastLaunch >= LAUNCH_INTERVAL) {
      s.shells.push({
        x: Math.random() * canvas.width * 0.7 + canvas.width * 0.15,
        y: canvas.height,
        vy: -(Math.random() * 8 + 12),
        hue: Math.random() * 360,
        exploded: false,
      })
      s.lastLaunch = now
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = s.shells.length - 1; i >= 0; i--) {
      const sh = s.shells[i]
      sh.vy += 0.4 * dt
      sh.y += sh.vy * dt
      if (!sh.exploded && sh.vy >= 0) {
        sh.exploded = true
        const count = 90 + Math.floor(Math.random() * 40)
        for (let j = 0; j < count; j++) {
          const angle = (j / count) * Math.PI * 2
          const speed = Math.random() * 4 + 1.5
          s.particles.push({
            x: sh.x,
            y: sh.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            alpha: 1,
            decay: Math.random() * 0.012 + 0.012,
            radius: Math.random() * 2 + 1,
            hue: sh.hue + Math.random() * 30 - 15,
            brightness: Math.random() * 20 + 60,
          })
        }
        s.shells.splice(i, 1)
        continue
      }
      ctx.beginPath()
      ctx.arc(sh.x, sh.y, 2, 0, Math.PI * 2)
      ctx.fillStyle = `hsl(${sh.hue}, 80%, 80%)`
      ctx.fill()
    }

    const drag = Math.pow(0.97, dt)
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i]
      p.vx *= drag
      p.vy = p.vy * drag + 0.06 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.alpha -= p.decay * dt
      if (p.alpha <= 0) { s.particles.splice(i, 1); continue }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${p.hue}, 80%, ${p.brightness}%, ${p.alpha})`
      ctx.fill()
    }

    if (!launching && s.shells.length === 0 && s.particles.length === 0 && !s.done) {
      s.done = true
      onFadeOutStart()
      return false
    }
  }, [onFadeOutStart])

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    />
  )
}
