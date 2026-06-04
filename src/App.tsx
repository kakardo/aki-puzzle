import { useState } from 'react'
import PuzzleBoard from './PuzzleBoard'
import SettingsModal, { type Settings } from './SettingsModal'
import './App.css'

function calcGrid(count: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.max(2, Math.round(count / cols))
  return { cols, rows }
}

const DEFAULT_SETTINGS: Settings = { zoomStep: 1.25, resolution: 99, panStep: 80 }
const QUICK_COUNTS = [75, 150, 300, 400, 500, 1000]

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState(1)
  const [input, setInput] = useState('300')
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const pieceCount = parseInt(input)
  const validCount = !isNaN(pieceCount) && pieceCount >= 2 && pieceCount <= 10000
  const canStart = imageSrc !== null && validCount
  const preview = validCount ? calcGrid(pieceCount, imageAspect) : null
  const isCustomCount = validCount && !QUICK_COUNTS.includes(pieceCount)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const img = new Image()
      img.onload = () => {
        setImageSrc(src)
        setImageAspect(img.width / img.height)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  function handleStart() {
    if (!canStart) return
    setGrid(calcGrid(pieceCount, imageAspect))
  }

  if (grid && imageSrc) {
    return (
      <>
        <PuzzleBoard
          imageSrc={imageSrc}
          cols={grid.cols}
          rows={grid.rows}
          zoomStep={settings.zoomStep}
          resolution={settings.resolution}
          panStep={settings.panStep}
          onReset={() => setGrid(null)}
          onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && (
          <SettingsModal
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className="start-screen">
      <h1>ZenPiece</h1>

      <div className="start-section">
        {imageSrc ? (
          <div className="image-chosen">
            <img className="thumbnail" src={imageSrc} alt="Chosen" />
            <label className="change-btn">
              Change image
              <input type="file" accept="image/*" onChange={handleFile} hidden />
            </label>
          </div>
        ) : (
          <label className="primary-btn">
            Choose picture
            <input type="file" accept="image/*" onChange={handleFile} hidden />
          </label>
        )}
      </div>

      <div className="start-section">
        <div className="piece-count-row">
          <input
            className={`piece-input${isCustomCount ? ' piece-input--custom' : ''}`}
            type="number"
            min={2}
            max={10000}
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <label className="section-label">Pieces</label>
        </div>
        {preview ? (
          <p className="piece-hint">{preview.cols} wide × {preview.rows} tall = {preview.cols * preview.rows} pieces</p>
        ) : (
          <p className="piece-hint piece-hint--error">Enter a number between 2 and 10 000</p>
        )}
        <div className="quick-counts">
          {QUICK_COUNTS.map(n => (
            <button
              key={n}
              className={`quick-btn${parseInt(input) === n ? ' active' : ''}`}
              onClick={() => setInput(String(n))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="start-section start-actions">
        <button className="settings-inline-btn" onClick={() => setShowSettings(true)}>Settings</button>
        <button className="primary-btn" disabled={!canStart} onClick={handleStart}>
          Start puzzling
        </button>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
