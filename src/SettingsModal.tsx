import { useState } from 'react'
import { KNOB_MIN, KNOB_MAX, KNOB_DEFAULT } from './pieces'
import './SettingsModal.css'

export type PieceStyle = 'standard' | 'artsy'

export interface Settings {
  zoomStep: number
  resolution: number
  panStep: number
  theme: 'light' | 'dark'
  knobSize: number
  pieceStyle: PieceStyle
}

const ZOOM_MIN = 1.05
const ZOOM_MAX = 2.0
const ZOOM_INC = 0.05
const PAN_MIN = 20
const PAN_MAX = 300
const PAN_INC = 20

const PIECE_STYLES: { value: PieceStyle; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'artsy',    label: 'Artsy' },
]

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
}

function Stepper({
  label,
  display,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
}: {
  label: string
  display: string
  onDecrement: () => void
  onIncrement: () => void
  decrementDisabled: boolean
  incrementDisabled: boolean
}) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="stepper">
        <button className="stepper-btn" onClick={onDecrement} disabled={decrementDisabled}>−</button>
        <span className="stepper-value">{display}</span>
        <button className="stepper-btn" onClick={onIncrement} disabled={incrementDisabled}>+</button>
      </div>
    </div>
  )
}

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  const { zoomStep, resolution, panStep, theme, knobSize, pieceStyle } = settings

  const [knobInput, setKnobInput] = useState(String(knobSize))
  const commitKnob = () => {
    let v = parseInt(knobInput, 10)
    if (!Number.isFinite(v)) v = knobSize
    v = Math.min(KNOB_MAX, Math.max(KNOB_MIN, v))
    setKnobInput(String(v))
    onChange({ ...settings, knobSize: v })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="setting-row">
          <span className="setting-label">Theme</span>
          <div className="theme-toggle">
            <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => onChange({ ...settings, theme: 'light' })}>Light</button>
            <button className={`theme-btn${theme === 'dark'  ? ' active' : ''}`} onClick={() => onChange({ ...settings, theme: 'dark'  })}>Dark</button>
          </div>
        </div>

        <Stepper
          label="Zoom step"
          display={`${zoomStep.toFixed(2)}×`}
          onDecrement={() => onChange({ ...settings, zoomStep: Math.max(ZOOM_MIN, parseFloat((zoomStep - ZOOM_INC).toFixed(2))) })}
          onIncrement={() => onChange({ ...settings, zoomStep: Math.min(ZOOM_MAX, parseFloat((zoomStep + ZOOM_INC).toFixed(2))) })}
          decrementDisabled={zoomStep <= ZOOM_MIN}
          incrementDisabled={zoomStep >= ZOOM_MAX}
        />

        {(() => {
          const steps = [1, 2, 99]
          const labels: Record<number, string> = { 1: '1× — Normal', 2: '2× — Sharp', 99: 'Auto — Max' }
          const idx = steps.indexOf(resolution)
          return (
            <Stepper
              label="Piece quality"
              display={labels[resolution] ?? 'Auto — Max'}
              onDecrement={() => onChange({ ...settings, resolution: steps[idx - 1] })}
              onIncrement={() => onChange({ ...settings, resolution: steps[idx + 1] })}
              decrementDisabled={idx <= 0}
              incrementDisabled={idx >= steps.length - 1}
            />
          )
        })()}
        <p className="setting-hint">Auto matches the image's native pixel density. Applies on next puzzle.</p>

        <Stepper
          label="WASD distance"
          display={`${panStep}px`}
          onDecrement={() => onChange({ ...settings, panStep: Math.max(PAN_MIN, panStep - PAN_INC) })}
          onIncrement={() => onChange({ ...settings, panStep: Math.min(PAN_MAX, panStep + PAN_INC) })}
          decrementDisabled={panStep <= PAN_MIN}
          incrementDisabled={panStep >= PAN_MAX}
        />

        <div className="setting-divider" />

        <div className="setting-row">
          <span className="setting-label">Knob size</span>
          <div className="knob-field">
            <input
              className="knob-input"
              type="number"
              inputMode="numeric"
              min={KNOB_MIN}
              max={KNOB_MAX}
              placeholder={String(KNOB_DEFAULT)}
              value={knobInput}
              onChange={e => setKnobInput(e.target.value)}
              onBlur={commitKnob}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
            <span className="knob-unit">%</span>
          </div>
        </div>
        <p className="setting-hint">100 = standard, default {KNOB_DEFAULT}. Range {KNOB_MIN} to {KNOB_MAX}, where knobs reach the piece edge.</p>

        <div className="setting-row">
          <span className="setting-label">Piece style</span>
          <div className="theme-toggle">
            {PIECE_STYLES.map(s => (
              <button
                key={s.value}
                className={`theme-btn${pieceStyle === s.value ? ' active' : ''}`}
                onClick={() => onChange({ ...settings, pieceStyle: s.value })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
