import { useEffect, useState } from 'react'
import type { StatsApi } from './stats/useStats'
import { computeSection1, computeSection2, computeRecords, type CompletionSummary } from './stats/compute'
import './SettingsModal.css'
import './StatsScreen.css'

interface Props {
  stats: StatsApi
  lastPuzzlesCount: number
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function SummaryRow({ label, summary }: { label: string; summary: CompletionSummary }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{summary.count}</td>
      <td>{summary.totalPieces}</td>
      <td>{summary.count > 0 ? Math.round(summary.avgPieces) : '-'}</td>
      <td>{summary.count > 0 ? formatDuration(summary.avgTimeMs) : '-'}</td>
    </tr>
  )
}

export default function StatsScreen({ stats, lastPuzzlesCount, onClose }: Props) {
  const [nameInput, setNameInput] = useState(stats.profileName)
  const [importError, setImportError] = useState<string | null>(null)
  const [showPlayers, setShowPlayers] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Keep the top name field in sync when the active player changes via the
  // manager (select, delete, or renaming the current player).
  useEffect(() => { setNameInput(stats.profileName) }, [stats.profileName])

  function commitName() {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== stats.profileName) stats.setProfileName(trimmed)
    else setNameInput(stats.profileName)
  }

  function saveRename() {
    if (editingId && editValue.trim()) stats.renameProfile(editingId, editValue.trim())
    setEditingId(null)
  }

  function renderPlayerRow(p: typeof stats.profiles[number]) {
    const isCurrent = p.id === stats.profileId
    if (editingId === p.id) {
      return (
        <div key={p.id} className="stats-player-row">
          <input
            className="stats-name-input stats-player-edit-input"
            type="text"
            value={editValue}
            autoFocus
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingId(null) }}
          />
          <div className="stats-player-actions">
            <button className="stats-player-btn" onClick={saveRename}>Save</button>
            <button className="stats-player-btn" onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </div>
      )
    }
    return (
      <div key={p.id} className={`stats-player-row${isCurrent ? ' stats-player-row--active' : ''}`}>
        <div className="stats-player-main">
          <span className="stats-player-name">{p.name}{isCurrent ? ' (current)' : ''} <span className="stats-player-id">#{p.id}</span></span>
          <span className="stats-player-meta">
            {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}
            {p.createdAt ? ` · since ${formatDate(p.createdAt)}` : ''}
          </span>
        </div>
        <div className="stats-player-actions">
          {!p.friend && !isCurrent && (
            <button className="stats-player-btn" onClick={() => stats.selectProfile(p.id)}>Select</button>
          )}
          <button className="stats-player-btn" onClick={() => { setEditingId(p.id); setEditValue(p.name); setConfirmDeleteId(null) }}>Rename</button>
          <button className="stats-player-btn" onClick={() => stats.setFriend(p.id, !p.friend)}>
            {p.friend ? 'To players' : 'To friends'}
          </button>
          {confirmDeleteId === p.id ? (
            <>
              <button className="stats-player-btn stats-player-btn--danger" onClick={() => { stats.deleteProfile(p.id); setConfirmDeleteId(null) }}>Confirm</button>
              <button className="stats-player-btn" onClick={() => setConfirmDeleteId(null)}>Keep</button>
            </>
          ) : (
            <button className="stats-player-btn stats-player-btn--danger" onClick={() => { setConfirmDeleteId(p.id); setEditingId(null) }}>Delete</button>
          )}
        </div>
      </div>
    )
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await stats.importFile(file)
      setImportError(null)
    } catch {
      setImportError('That file could not be read as ZenPiece stats.')
    }
  }

  const { completions, sessions } = stats.profile
  const section1 = computeSection1(completions, lastPuzzlesCount)
  const section2 = computeSection2(sessions)
  const records = computeRecords(completions)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stats-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Stats</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="setting-row">
          <span className="setting-label">Name</span>
          <input
            className="stats-name-input"
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        </div>
        <p className="setting-hint">Stats live on this computer, filed under this name. There are no accounts.</p>

        <div className="setting-row">
          <span className="setting-label">Player</span>
          <button className="stats-player-toggle" onClick={() => { setShowPlayers(v => !v); setEditingId(null); setConfirmDeleteId(null) }}>
            {showPlayers ? 'Done' : 'Manage players'}
          </button>
        </div>
        {showPlayers && (
          <div className="stats-player-list">
            {stats.profiles.filter(p => !p.friend).map(renderPlayerRow)}
            <button className="stats-player-row stats-player-new" onClick={() => stats.createPlayer('Player')}>
              + New player
            </button>
            {stats.profiles.some(p => p.friend) && (
              <>
                <span className="join-profiles-label stats-friends-label">Friends (played with)</span>
                {stats.profiles.filter(p => p.friend).sort((a, b) => b.completions - a.completions).map(renderPlayerRow)}
              </>
            )}
          </div>
        )}

        <div className="setting-divider" />

        <h3 className="stats-section-title">Completed puzzles</h3>
        <table className="stats-table">
          <thead>
            <tr>
              <th>Set</th>
              <th>Completed</th>
              <th>Total pieces</th>
              <th>Avg pieces</th>
              <th>Avg time</th>
            </tr>
          </thead>
          <tbody>
            <SummaryRow label="All time" summary={section1.overall} />
            <SummaryRow label="Top 100 hardest" summary={section1.top100} />
            <SummaryRow label="Top 50 hardest" summary={section1.top50} />
            <SummaryRow label="Top 25 hardest" summary={section1.top25} />
            <SummaryRow label="Top 10 hardest" summary={section1.top10} />
            <SummaryRow label="Top 5 hardest" summary={section1.top5} />
          </tbody>
        </table>

        {section1.lastCompleted.length > 0 && (
          <>
            <h4 className="stats-subsection-title">Last {lastPuzzlesCount} completed</h4>
            <ul className="stats-list">
              {section1.lastCompleted.map(c => (
                <li key={c.id}>
                  {formatDate(c.date)}, {c.pieceCount} pieces in {formatDuration(c.timeMs)}
                  {c.mode === 'multiplayer' ? ' (multiplayer)' : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="setting-divider" />

        <h3 className="stats-section-title">All attempts, completed or not</h3>
        <ul className="stats-list">
          <li>Play sessions: {section2.totalSessions}</li>
          <li>Total playtime: {formatDuration(section2.totalPlaytimeMs)}</li>
          <li>Longest single sitting: {formatDuration(section2.longestSittingMs)}</li>
          <li>Pieces connected: {section2.totalPiecesPlaced}</li>
          <li>Most pieces placed in one sitting: {section2.mostPiecesInOneSitting}</li>
          <li>Pickups that were not placed: {section2.totalPickupsNotPlaced}</li>
        </ul>

        <div className="setting-divider" />

        <h3 className="stats-section-title">Records</h3>
        <ul className="stats-list">
          <li>Fastest completion: {records.fastestTimeMs !== null ? formatDuration(records.fastestTimeMs) : 'None yet'}</li>
          <li>Largest puzzle completed: {records.largestPuzzle !== null ? `${records.largestPuzzle} pieces` : 'None yet'}</li>
          <li>Largest chain merge: {records.largestChainMerge !== null ? `${records.largestChainMerge} pieces joined at once` : 'None yet'}</li>
          <li>Fastest multiplayer completion: {records.fastestMultiplayerTimeMs !== null ? formatDuration(records.fastestMultiplayerTimeMs) : 'None yet'}</li>
          <li>Largest multiplayer puzzle: {records.largestMultiplayerPuzzle !== null ? `${records.largestMultiplayerPuzzle} pieces` : 'None yet'}</li>
          <li>Most frequent co-op partner: {records.mostFrequentPartner ? `${records.mostFrequentPartner.name} (${records.mostFrequentPartner.count} puzzles)` : 'None yet'}</li>
          <li>People played with: {records.uniquePartnerCount}</li>
        </ul>

        <div className="setting-divider" />

        <div className="stats-backup-row">
          <button className="reset-btn" onClick={stats.exportFile}>Export stats</button>
          <label className="reset-btn stats-import-label">
            Import stats
            <input type="file" accept="application/json" hidden onChange={handleImport} />
          </label>
        </div>
        {importError && <p className="setting-hint stats-import-error">{importError}</p>}
      </div>
    </div>
  )
}
