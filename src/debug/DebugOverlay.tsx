import type { FC } from 'react'

interface Props {
  zoom: number
  resolution: number
  actualCanvasRes: number
  pieceCount: number
  lockedCount: number
}

const DebugOverlay: FC<Props> = ({ zoom, resolution, actualCanvasRes, pieceCount, lockedCount }) => {
  const dpr = window.devicePixelRatio || 1
  const settingLabel = resolution === 99 ? 'auto' : `${resolution}x`
  const crispUpTo = actualCanvasRes > 0 ? (actualCanvasRes / dpr).toFixed(2) : '?'

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      background: 'rgba(0, 0, 0, 0.78)',
      color: '#00ff88',
      fontFamily: 'monospace',
      fontSize: '11px',
      lineHeight: 1.7,
      padding: '8px 12px',
      borderRadius: '5px',
      zIndex: 9999,
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      <div>zoom: {zoom.toFixed(3)}</div>
      <div>dpr: {dpr}</div>
      <div>quality setting: {settingLabel}</div>
      <div>canvas res: {actualCanvasRes > 0 ? `${actualCanvasRes.toFixed(2)}x` : 'loading'}</div>
      <div>crisp up to: {crispUpTo}x zoom</div>
      <div>pieces: {lockedCount} / {pieceCount}</div>
    </div>
  )
}

export default DebugOverlay
