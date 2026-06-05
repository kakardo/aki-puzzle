import { useState, useEffect } from 'react'
import PuzzleBoard from './PuzzleBoard'
import SettingsModal, { type Settings } from './SettingsModal'
import './App.css'

function calcGrid(count: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.max(2, Math.round(count / cols))
  return { cols, rows }
}

const DEFAULT_SETTINGS: Settings = { zoomStep: 1.25, resolution: 99, panStep: 80, theme: 'light' }

const QUICK_COUNTS: { n: number; light: string; dark: string }[] = [
  { n: 75,   light: '#ff8787', dark: '#e03131' },
  { n: 150,  light: '#ffa94d', dark: '#e8590c' },
  { n: 300,  light: '#ffe066', dark: '#f59f00' },
  { n: 400,  light: '#8ce99a', dark: '#2f9e44' },
  { n: 500,  light: '#66d9e8', dark: '#0c8599' },
  { n: 1000, light: '#b197fc', dark: '#6741d9' },
]

const CUSTOM_LIGHT = '#f78fd4'
const CUSTOM_DARK  = '#c2255c'

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageAspect, setImageAspect] = useState(1)
  const [input, setInput] = useState('300')
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null)
  const [accentColor, setAccentColor] = useState(CUSTOM_DARK)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const { theme } = settings
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const pieceCount = parseInt(input)
  const validCount = !isNaN(pieceCount) && pieceCount >= 2 && pieceCount <= 10000
  const canStart = imageSrc !== null && validCount
  const preview = validCount ? calcGrid(pieceCount, imageAspect) : null
  const matchedQuick = QUICK_COUNTS.find(q => q.n === pieceCount)
  const isCustomCount = validCount && !matchedQuick

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
    setAccentColor(matchedQuick ? matchedQuick.dark : CUSTOM_DARK)
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
          theme={settings.theme}
          accentColor={accentColor}
          onReset={() => setGrid(null)}
          onOpenSettings={() => setShowSettings(true)}
          onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}
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

  const activeLight = matchedQuick ? matchedQuick.light : isCustomCount ? CUSTOM_LIGHT : undefined
  const activeDark  = matchedQuick ? matchedQuick.dark  : isCustomCount ? CUSTOM_DARK  : undefined

  return (
    <div className="start-screen">
      <div className="start-top-bar">
        <div
          className="theme-toggle-wrap"
          onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}
          role="button"
          aria-label="Toggle theme"
        >
          <span className="theme-label">{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          <div className={`toggle-track${theme === 'dark' ? ' toggle-track--on' : ''}`}>
            <span className="toggle-icon toggle-icon--sun">☀️</span>
            <span className="toggle-icon toggle-icon--moon">🌙</span>
            <div className="toggle-thumb" />
          </div>
        </div>

        <button className="top-settings-btn" onClick={() => setShowSettings(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>

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
            className="piece-input"
            type="number"
            min={2}
            max={10000}
            value={input}
            onChange={e => setInput(e.target.value)}
            style={activeDark ? {
              borderColor: activeDark,
              color: activeDark,
              boxShadow: `0 0 0 2px ${activeLight}55`,
            } : undefined}
          />
          <label className="section-label">Pieces</label>
        </div>
        {preview ? (
          <p className="piece-hint">{preview.cols} wide × {preview.rows} tall = {preview.cols * preview.rows} pieces</p>
        ) : (
          <p className="piece-hint piece-hint--error">Enter a number between 2 and 10 000</p>
        )}
        <div className="quick-counts">
          {QUICK_COUNTS.map(({ n, light, dark }) => {
            const isActive = pieceCount === n
            return (
              <button
                key={n}
                className="quick-btn"
                style={{
                  backgroundColor: isActive ? dark : undefined,
                  borderColor: isActive ? dark : light,
                  color: isActive ? '#fff' : light,
                }}
                onClick={() => setInput(String(n))}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      <div className="start-section start-actions">
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
