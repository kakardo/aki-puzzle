import { useRef, useState, useMemo } from 'react'
import PuzzleBoard from '../PuzzleBoard'
import SettingsModal, { DEFAULT_SETTINGS, type Settings } from '../SettingsModal'
import DebugControls from './DebugControls'
import { generateDebugImage } from './debugImage'
import type { DebugActions } from './useDebugActions'

const COLS = 4
const ROWS = 3

interface Props {
  onExit: () => void
}

export default function DebugView({ onExit }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [boardKey, setBoardKey] = useState(0)
  const actionsRef = useRef<DebugActions | null>(null)

  const imageSrc = useMemo(() => generateDebugImage(COLS, ROWS), [])

  return (
    <>
      <PuzzleBoard
        key={boardKey}
        imageSrc={imageSrc}
        cols={COLS}
        rows={ROWS}
        zoomStep={settings.zoomStep}
        resolution={settings.resolution}
        panStep={settings.panStep}
        knobSize={settings.knobSize}
        pieceStyle={settings.pieceStyle}
        pieceSpacing={settings.pieceSpacing}
        edgeStyle={settings.edgeStyle}
        showBorder={settings.showBorder}
        rippleQuality={settings.rippleQuality}
        progressMode={settings.progressMode}
        progressPercent={settings.progressPercent}
        theme={settings.theme}
        accentColor="#6741d9"
        onReset={() => setBoardKey(k => k + 1)}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}
        onPieceMoved={() => {}}
        debugActionsRef={actionsRef}
      />

      <DebugControls
        onCompleteAll={() => actionsRef.current?.completeAll()}
        onLeaveOne={() => actionsRef.current?.leaveOne()}
        onReset={() => setBoardKey(k => k + 1)}
        onExit={onExit}
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
