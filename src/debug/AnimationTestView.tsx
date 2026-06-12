import { useState, useRef, useCallback, useEffect } from 'react'
import type { CSSProperties } from 'react'
import testBg from '../assets/test_background.jpg'
import Fireworks from '../animations/Fireworks'
import type { FireworksConfig } from '../animations/Fireworks'
import Ripple from '../animations/Ripple'
import type { RippleConfig } from '../animations/Ripple'

// ---- theme ----------------------------------------------------------------

const ACCENT = '#c084fc'
const ACCENT_DIM = 'rgba(192, 132, 252, 0.35)'
const ACCENT_BG = 'rgba(192, 132, 252, 0.08)'

// ---- styles ---------------------------------------------------------------

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  background: 'rgba(10, 10, 18, 0.93)',
  border: `1px solid ${ACCENT_DIM}`,
  color: ACCENT,
  fontFamily: 'monospace',
  fontSize: '12px',
  borderRadius: '6px',
  padding: '10px 14px',
  zIndex: 9999,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  width: '240px',
  boxSizing: 'border-box',
}

const sectionHeadStyle: CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.5,
  marginBottom: '6px',
}

const groupHeadStyle: CSSProperties = {
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: ACCENT,
  borderBottom: `1px solid ${ACCENT_DIM}`,
  paddingBottom: '4px',
  marginTop: '10px',
  marginBottom: '8px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const btnStyle: CSSProperties = {
  background: ACCENT_BG,
  border: `1px solid ${ACCENT_DIM}`,
  color: ACCENT,
  fontFamily: 'monospace',
  fontSize: '12px',
  borderRadius: '4px',
  padding: '5px 8px',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  marginBottom: '4px',
}

const stopBtnStyle: CSSProperties = {
  ...btnStyle,
  borderColor: 'rgba(255, 150, 150, 0.35)',
  color: '#ff8787',
  background: 'rgba(255, 100, 100, 0.06)',
}

const backBtnStyle: CSSProperties = {
  ...btnStyle,
  marginTop: '12px',
  borderColor: 'rgba(100, 200, 255, 0.35)',
  color: '#74c0fc',
  background: 'rgba(100, 200, 255, 0.05)',
}

const resetBtnStyle: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${ACCENT_DIM}`,
  color: ACCENT,
  fontFamily: 'monospace',
  fontSize: '10px',
  borderRadius: '3px',
  padding: '1px 6px',
  cursor: 'pointer',
  opacity: 0.6,
  letterSpacing: 0,
  textTransform: 'none',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1px',
}

const sliderStyle: CSSProperties = {
  width: '100%',
  accentColor: ACCENT,
  marginBottom: '6px',
}

// ---- Slider row component -------------------------------------------------

function SliderRow({
  label,
  value,
  display,
  defaultValue,
  defaultDisplay,
  description,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display?: string
  defaultValue: number
  defaultDisplay?: string
  description: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const currentStr = display ?? String(value)
  const defaultStr = defaultDisplay ?? String(defaultValue)
  const isChanged = Math.abs(value - defaultValue) > step * 0.01

  return (
    <>
      <div style={rowStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.7 }}>
          {label}
          <span
            title={description}
            style={{ opacity: 0.5, cursor: 'help', userSelect: 'none', fontSize: '11px' }}
          >
            &#9432;
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: isChanged ? '#fff' : ACCENT }}>{currentStr}</span>
          <span style={{ opacity: 0.35, fontSize: '10px' }}>({defaultStr})</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={sliderStyle}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </>
  )
}

// ---- Defaults -------------------------------------------------------------

// Required fields filled in so sliders always have a concrete value to bind to
type FwState = Required<FireworksConfig>
type RippleState = Required<RippleConfig> & { quality: 'low' | 'mid' | 'high' }

const DEFAULT_FW: FwState = {
  duration: 20000,
  launchInterval: 700,
  shellSpeedMin: 12,
  shellSpeedMax: 20,
  particleMin: 90,
  particleMax: 130,
  gravity: 0.4,
  drag: 0.97,
}

const DEFAULT_RIPPLE: RippleState = {
  speed: 0.4,
  wavelength: 70,
  lead: 110,
  leadSigma: 45,
  tailDecay: 230,
  amplitude: 24,
  fade: 0.00022,
  quality: 'mid',
}

// ---- Main component -------------------------------------------------------

interface Props {
  onBack: () => void
}

export default function AnimationTestView({ onBack }: Props) {
  const bgRef = useRef<HTMLImageElement>(null)

  // Fireworks state
  const [fwConfig, setFwConfig] = useState<FwState>(DEFAULT_FW)
  const [fwKey, setFwKey] = useState(0)
  const [fwActive, setFwActive] = useState(false)

  // Ripple state
  const [rippleConfig, setRippleConfig] = useState<RippleState>(DEFAULT_RIPPLE)
  const [rippleKey, setRippleKey] = useState(0)
  const [rippleActive, setRippleActive] = useState(false)
  const [autoInterval, setAutoInterval] = useState(3000)
  const [autoEnabled, setAutoEnabled] = useState(false)

  // Capture function: draws the background image onto a canvas for the ripple
  const captureBackground = useCallback((): HTMLCanvasElement | null => {
    const img = bgRef.current
    if (!img) return null
    const canvas = document.createElement('canvas')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  }, [])

  // Auto-ripple
  useEffect(() => {
    if (!autoEnabled) return
    const id = setInterval(() => {
      setRippleKey(k => k + 1)
      setRippleActive(true)
    }, autoInterval)
    return () => clearInterval(id)
  }, [autoEnabled, autoInterval])

  function setFw<K extends keyof FwState>(key: K, val: FwState[K]) {
    setFwConfig(c => ({ ...c, [key]: val }))
  }

  function setRipple<K extends keyof RippleState>(key: K, val: RippleState[K]) {
    setRippleConfig(c => ({ ...c, [key]: val }))
  }

  function fireFireworks() {
    setFwKey(k => k + 1)
    setFwActive(true)
  }

  function triggerRipple() {
    setRippleKey(k => k + 1)
    setRippleActive(true)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}>

      {/* Stretched background */}
      <img
        ref={bgRef}
        src={testBg}
        alt=""
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'fill',
          zIndex: 0,
          display: 'block',
        }}
      />

      {/* Fireworks */}
      {fwActive && (
        <Fireworks
          key={fwKey}
          {...fwConfig}
          onFadeOutStart={() => setFwActive(false)}
        />
      )}

      {/* Ripple */}
      {rippleActive && (
        <Ripple
          key={rippleKey}
          {...rippleConfig}
          x={window.innerWidth / 2}
          y={window.innerHeight / 2}
          capture={captureBackground}
          onDone={() => setRippleActive(false)}
        />
      )}

      {/* Controls panel */}
      <div style={panelStyle}>
        <div style={sectionHeadStyle}>Animations</div>

        {/* Fireworks section */}
        <div style={groupHeadStyle}>
          <span>Fireworks</span>
          <button style={resetBtnStyle} onClick={() => setFwConfig(DEFAULT_FW)}>Reset</button>
        </div>

        <SliderRow
          label="Duration"
          value={fwConfig.duration}
          display={`${(fwConfig.duration / 1000).toFixed(0)}s`}
          defaultValue={DEFAULT_FW.duration}
          defaultDisplay={`${(DEFAULT_FW.duration / 1000).toFixed(0)}s`}
          description="How long new shells are launched. After this, remaining particles finish and the animation ends."
          min={3000} max={60000} step={1000}
          onChange={v => setFw('duration', v)}
        />
        <SliderRow
          label="Launch interval"
          value={fwConfig.launchInterval}
          display={`${fwConfig.launchInterval}ms`}
          defaultValue={DEFAULT_FW.launchInterval}
          defaultDisplay={`${DEFAULT_FW.launchInterval}ms`}
          description="Milliseconds between each new shell launch. Lower = more shells at once."
          min={100} max={3000} step={50}
          onChange={v => setFw('launchInterval', v)}
        />
        <SliderRow
          label="Shell speed min"
          value={fwConfig.shellSpeedMin}
          defaultValue={DEFAULT_FW.shellSpeedMin}
          description="Minimum upward launch speed for a shell. Controls how low explosions can happen."
          min={2} max={30} step={1}
          onChange={v => setFw('shellSpeedMin', v)}
        />
        <SliderRow
          label="Shell speed max"
          value={fwConfig.shellSpeedMax}
          defaultValue={DEFAULT_FW.shellSpeedMax}
          description="Maximum upward launch speed for a shell. Controls how high explosions can reach."
          min={4} max={40} step={1}
          onChange={v => setFw('shellSpeedMax', v)}
        />
        <SliderRow
          label="Particles min"
          value={fwConfig.particleMin}
          defaultValue={DEFAULT_FW.particleMin}
          description="Minimum number of sparks spawned per explosion."
          min={10} max={200} step={5}
          onChange={v => setFw('particleMin', v)}
        />
        <SliderRow
          label="Particles max"
          value={fwConfig.particleMax}
          defaultValue={DEFAULT_FW.particleMax}
          description="Maximum number of sparks spawned per explosion."
          min={20} max={300} step={5}
          onChange={v => setFw('particleMax', v)}
        />
        <SliderRow
          label="Gravity"
          value={fwConfig.gravity}
          display={fwConfig.gravity.toFixed(2)}
          defaultValue={DEFAULT_FW.gravity}
          defaultDisplay={DEFAULT_FW.gravity.toFixed(2)}
          description="Downward acceleration applied to shells and particles each frame. Higher = heavier, lower bursts."
          min={0} max={1.5} step={0.05}
          onChange={v => setFw('gravity', v)}
        />
        <SliderRow
          label="Drag"
          value={fwConfig.drag}
          display={fwConfig.drag.toFixed(3)}
          defaultValue={DEFAULT_FW.drag}
          defaultDisplay={DEFAULT_FW.drag.toFixed(3)}
          description="Velocity multiplier applied to particles each frame. Closer to 1 = less drag, particles travel further."
          min={0.90} max={1.00} step={0.005}
          onChange={v => setFw('drag', v)}
        />

        <button style={btnStyle} onClick={fireFireworks}>
          {fwActive ? 'Restart fireworks' : 'Fire'}
        </button>
        {fwActive && (
          <button style={stopBtnStyle} onClick={() => setFwActive(false)}>
            Stop fireworks
          </button>
        )}

        {/* Ripple section */}
        <div style={groupHeadStyle}>
          <span>Ripple</span>
          <button style={resetBtnStyle} onClick={() => setRippleConfig(DEFAULT_RIPPLE)}>Reset</button>
        </div>

        <SliderRow
          label="Speed"
          value={rippleConfig.speed}
          display={rippleConfig.speed.toFixed(2)}
          defaultValue={DEFAULT_RIPPLE.speed}
          defaultDisplay={DEFAULT_RIPPLE.speed.toFixed(2)}
          description="Wavefront speed in pixels per millisecond. Higher = faster expanding wave."
          min={0.1} max={2.0} step={0.05}
          onChange={v => setRipple('speed', v)}
        />
        <SliderRow
          label="Wavelength"
          value={rippleConfig.wavelength}
          display={`${rippleConfig.wavelength}px`}
          defaultValue={DEFAULT_RIPPLE.wavelength}
          defaultDisplay={`${DEFAULT_RIPPLE.wavelength}px`}
          description="Distance in pixels between wave crests. Larger = wider, more spread-out ripples."
          min={20} max={200} step={5}
          onChange={v => setRipple('wavelength', v)}
        />
        <SliderRow
          label="Amplitude"
          value={rippleConfig.amplitude}
          display={`${rippleConfig.amplitude}px`}
          defaultValue={DEFAULT_RIPPLE.amplitude}
          defaultDisplay={`${DEFAULT_RIPPLE.amplitude}px`}
          description="Maximum radial displacement in pixels at the peak of the wave. Higher = more dramatic distortion."
          min={2} max={80} step={2}
          onChange={v => setRipple('amplitude', v)}
        />
        <SliderRow
          label="Fade"
          value={rippleConfig.fade}
          display={rippleConfig.fade.toFixed(5)}
          defaultValue={DEFAULT_RIPPLE.fade}
          defaultDisplay={DEFAULT_RIPPLE.fade.toFixed(5)}
          description="How quickly the wave amplitude decays over time. Higher = the ripple dies out faster."
          min={0.00005} max={0.001} step={0.00005}
          onChange={v => setRipple('fade', v)}
        />
        <SliderRow
          label="Lead"
          value={rippleConfig.lead}
          display={`${rippleConfig.lead}px`}
          defaultValue={DEFAULT_RIPPLE.lead}
          defaultDisplay={`${DEFAULT_RIPPLE.lead}px`}
          description="Width of the distortion band rendered ahead of the wavefront. Larger = softer leading edge."
          min={20} max={300} step={10}
          onChange={v => setRipple('lead', v)}
        />
        <SliderRow
          label="Lead sigma"
          value={rippleConfig.leadSigma}
          defaultValue={DEFAULT_RIPPLE.leadSigma}
          description="Gaussian sharpness of the leading edge. Lower = sharper front, higher = more gradual onset."
          min={5} max={150} step={5}
          onChange={v => setRipple('leadSigma', v)}
        />
        <SliderRow
          label="Tail decay"
          value={rippleConfig.tailDecay}
          defaultValue={DEFAULT_RIPPLE.tailDecay}
          description="How slowly the wake behind the wavefront fades. Higher = longer visible trail of rings."
          min={50} max={600} step={10}
          onChange={v => setRipple('tailDecay', v)}
        />

        <div style={{ ...rowStyle, marginBottom: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.7 }}>
            Quality
            <span
              title="Rendering resolution preset. Low uses fewer, thicker annuli (faster). High uses more, thinner rings for smoother distortion."
              style={{ opacity: 0.5, cursor: 'help', userSelect: 'none', fontSize: '11px' }}
            >
              &#9432;
            </span>
          </span>
          <select
            value={rippleConfig.quality}
            onChange={e => setRipple('quality', e.target.value as RippleConfig['quality'])}
            style={{
              background: 'rgba(10,10,18,0.9)',
              border: `1px solid ${ACCENT_DIM}`,
              color: ACCENT,
              fontFamily: 'monospace',
              fontSize: '11px',
              borderRadius: '3px',
              padding: '2px 4px',
            }}
          >
            <option value="low">low</option>
            <option value="mid">mid</option>
            <option value="high">high</option>
          </select>
        </div>

        <button style={btnStyle} onClick={triggerRipple}>
          Ripple
        </button>

        {/* Auto-ripple */}
        <div style={{ ...rowStyle, marginTop: '6px', marginBottom: '6px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.7 }}>
            Auto-ripple
            <span
              title="Automatically triggers a new ripple from the center of the screen on a fixed interval."
              style={{ opacity: 0.5, cursor: 'help', userSelect: 'none', fontSize: '11px' }}
            >
              &#9432;
            </span>
          </span>
          <button
            style={{
              background: autoEnabled ? 'rgba(192, 132, 252, 0.25)' : ACCENT_BG,
              border: `1px solid ${autoEnabled ? ACCENT : ACCENT_DIM}`,
              color: autoEnabled ? '#fff' : ACCENT,
              fontFamily: 'monospace',
              fontSize: '11px',
              borderRadius: '4px',
              padding: '3px 8px',
              cursor: 'pointer',
            }}
            onClick={() => setAutoEnabled(v => !v)}
          >
            {autoEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <SliderRow
          label="Interval"
          value={autoInterval}
          display={`${(autoInterval / 1000).toFixed(1)}s`}
          defaultValue={3000}
          defaultDisplay="3.0s"
          description="Time between automatic ripple triggers when auto-ripple is on."
          min={500} max={15000} step={500}
          onChange={v => setAutoInterval(v)}
        />

        <button style={backBtnStyle} onClick={onBack}>
          Back to debug
        </button>
      </div>
    </div>
  )
}
