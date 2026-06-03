import './SettingsModal.css'

export interface Settings {
  zoomStep: number
  resolution: number
  panStep: number
}

const ZOOM_MIN = 1.05
const ZOOM_MAX = 2.0
const ZOOM_INC = 0.05

interface Props {
  settings: Settings
  onChange: (s: Settings) => void
  onClose: () => void
}

function Stepper({
  label,
  value,
  display,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
}: {
  label: string
  value?: number
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

const PAN_MIN = 20
const PAN_MAX = 300
const PAN_INC = 20

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  const { zoomStep, resolution, panStep } = settings

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
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
      </div>
    </div>
  )
}
