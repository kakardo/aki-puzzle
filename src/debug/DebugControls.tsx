import type { FC, CSSProperties } from 'react'

interface Props {
  onCompleteAll: () => void
  onLeaveOne: () => void
  onReset: () => void
  onExit: () => void
}

const panel: CSSProperties = {
  position: 'fixed',
  top: '12px',
  right: '12px',
  background: 'rgba(12, 12, 12, 0.9)',
  border: '1px solid rgba(0, 255, 136, 0.3)',
  color: '#00ff88',
  fontFamily: 'monospace',
  fontSize: '12px',
  borderRadius: '6px',
  padding: '10px 12px',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: '148px',
}

const label: CSSProperties = {
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.5,
  marginBottom: '2px',
}

const btn: CSSProperties = {
  background: 'rgba(0, 255, 136, 0.08)',
  border: '1px solid rgba(0, 255, 136, 0.35)',
  color: '#00ff88',
  fontFamily: 'monospace',
  fontSize: '12px',
  borderRadius: '4px',
  padding: '5px 8px',
  cursor: 'pointer',
  textAlign: 'left',
}

const exitBtn: CSSProperties = {
  ...btn,
  marginTop: '4px',
  borderColor: 'rgba(255, 100, 100, 0.35)',
  color: '#ff8787',
  background: 'rgba(255, 100, 100, 0.06)',
}

const DebugControls: FC<Props> = ({ onCompleteAll, onLeaveOne, onReset, onExit }) => (
  <div style={panel}>
    <div style={label}>Debug</div>
    <button style={btn} onClick={onCompleteAll}>Complete all</button>
    <button style={btn} onClick={onLeaveOne}>Fill &amp; leave one</button>
    <button style={btn} onClick={onReset}>Reset puzzle</button>
    <button style={exitBtn} onClick={onExit}>Exit debug</button>
  </div>
)

export default DebugControls
