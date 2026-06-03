import { useState } from 'react'
import PuzzleBoard from './PuzzleBoard'
import SettingsModal, { type Settings } from './SettingsModal'
import './App.css'

type Step = 'upload' | 'configure'

function calcGrid(count: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.max(2, Math.round(count / cols))
  return { cols, rows }
}

const DEFAULT_SETTINGS: Settings = { zoomStep: 1.25, resolution: 99 }

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState(1)
  const [input, setInput] = useState('50')
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const pieceCount = Math.max(4, parseInt(input) || 4)
  const preview = calcGrid(pieceCount, imageAspect)

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
        setStep('configure')
      }
      img.src = src
    }
    reader.readAsDataURL(file)
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
          onReset={() => { setGrid(null); setStep('upload') }}
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

  if (step === 'configure' && imageSrc) {
    return (
      <div className="upload-screen">
        <h1>ZenPiece</h1>
        <p>How many pieces?</p>
        <input
          className="piece-input"
          type="number"
          min={4}
          max={500}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <p className="piece-hint">
          {preview.cols} × {preview.rows} = {preview.cols * preview.rows} pieces
        </p>
        <button className="settings-inline-btn" onClick={() => setShowSettings(true)}>Settings</button>
        <button className="upload-btn" onClick={() => setGrid(calcGrid(pieceCount, imageAspect))}>
          Start
        </button>
        <button className="text-btn" onClick={() => setStep('upload')}>Change image</button>
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

  return (
    <div className="upload-screen">
      <h1>ZenPiece</h1>
      <p>Upload an image to start your puzzle</p>
      <label className="upload-btn">
        Choose image
        <input type="file" accept="image/*" onChange={handleFile} hidden />
      </label>
      <button className="settings-inline-btn" onClick={() => setShowSettings(true)}>Settings</button>
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
