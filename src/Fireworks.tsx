import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = []
    const shells: Shell[] = []
    let frameId: number
    let lastLaunch = 0
    let startTime: number | null = null
    let done = false

    function launchShell() {
      shells.push({
        x: Math.random() * canvas!.width * 0.7 + canvas!.width * 0.15,
        y: canvas!.height,
        vy: -(Math.random() * 8 + 12),
        hue: Math.random() * 360,
        exploded: false,
      })
    }

    function explode(x: number, y: number, hue: number) {
      const count = 90 + Math.floor(Math.random() * 40)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const speed = Math.random() * 4 + 1.5
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: Math.random() * 0.012 + 0.012,
          radius: Math.random() * 2 + 1,
          hue: hue + Math.random() * 30 - 15,
          brightness: Math.random() * 20 + 60,
        })
      }
    }

    function draw(now: number) {
      if (startTime === null) startTime = now
      const elapsed = now - startTime
      const launching = elapsed < DURATION

      if (launching && now - lastLaunch >= LAUNCH_INTERVAL) {
        launchShell()
        lastLaunch = now
      }

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]
        s.vy += 0.4
        s.y += s.vy
        if (!s.exploded && s.vy >= 0) {
          s.exploded = true
          explode(s.x, s.y, s.hue)
          shells.splice(i, 1)
          continue
        }
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, 2, 0, Math.PI * 2)
        ctx!.fillStyle = `hsl(${s.hue}, 80%, 80%)`
        ctx!.fill()
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.vx *= 0.97
        p.vy = p.vy * 0.97 + 0.06
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay
        if (p.alpha <= 0) { particles.splice(i, 1); continue }
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx!.fillStyle = `hsla(${p.hue}, 80%, ${p.brightness}%, ${p.alpha})`
        ctx!.fill()
      }

      if (!launching && shells.length === 0 && particles.length === 0 && !done) {
        done = true
        onFadeOutStart()
        return
      }

      frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [onFadeOutStart])

  return (
    <canvas
      ref={canvasRef}
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
