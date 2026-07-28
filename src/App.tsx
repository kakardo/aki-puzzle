import { useState, useEffect, useRef } from 'react'
import PuzzleBoard from './PuzzleBoard'
import SettingsModal, { type Settings, type ProgressMode, type EdgeStyle, type RippleQuality, DEFAULT_SETTINGS } from './SettingsModal'
import StatsScreen from './StatsScreen'
import { useStats } from './stats/useStats'
import { KNOB_DEFAULT } from './pieces'
import DebugView from './debug/DebugView'
import { useMultiplayer, type MultiplayerStatus, type MultiplayerMode } from './hooks/useMultiplayer'
import { prepareNetImage } from './multiplayer/image'
import type { BoardMultiplayer } from './multiplayer/types'
import type { Groups, NetPiece, NetSession, Player } from './multiplayer/protocol'
import './App.css'

// The active player, read straight from storage so it is current right after a
// profile change (state updates are async, localStorage is written first).
function readActiveProfile(): { id: string; name: string } {
  try {
    const raw = localStorage.getItem('zenpiece-stats')
    if (raw) {
      const parsed = JSON.parse(raw)
      const id = parsed?.activeProfileId
      const prof = id && parsed.profiles ? parsed.profiles[id] : null
      if (prof && typeof prof.name === 'string') return { id, name: prof.name || 'Player' }
    }
  } catch {}
  return { id: '', name: 'Player' }
}

function calcGrid(count: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(count * aspect)))
  const rows = Math.max(2, Math.round(count / cols))
  return { cols, rows }
}

const VALID_PROGRESS_MODES: ProgressMode[] = ['off', 'percent', 'count', 'count-total']
// Waves is parked for now, so saved settings fall back to straight.
const VALID_EDGE_STYLES: EdgeStyle[] = ['straight']

const VALID_PIECE_STYLES = ['standard', 'artsy']

const VALID_RIPPLE_QUALITIES: RippleQuality[] = ['off', 'low', 'mid', 'high']

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('zenpiece-settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (!VALID_PIECE_STYLES.includes(parsed.pieceStyle)) parsed.pieceStyle = 'standard'
      if (typeof parsed.knobSize !== 'number' || !Number.isFinite(parsed.knobSize)) parsed.knobSize = KNOB_DEFAULT
      if (typeof parsed.pieceSpacing !== 'number' || !Number.isFinite(parsed.pieceSpacing)) parsed.pieceSpacing = 8
      if (!VALID_EDGE_STYLES.includes(parsed.edgeStyle)) parsed.edgeStyle = 'straight'
      if (typeof parsed.showBorder !== 'boolean') parsed.showBorder = true
      if (!VALID_RIPPLE_QUALITIES.includes(parsed.rippleQuality)) {
        // Migrate the old boolean toggle: On becomes Mid
        parsed.rippleQuality = parsed.showRipple === false ? 'off' : 'mid'
      }
      delete parsed.showRipple
      if (!VALID_PROGRESS_MODES.includes(parsed.progressMode)) parsed.progressMode = 'count-total'
      if (typeof parsed.progressPercent !== 'boolean') parsed.progressPercent = false
      if (typeof parsed.pingNameOnRing !== 'boolean') parsed.pingNameOnRing = DEFAULT_SETTINGS.pingNameOnRing
      if (typeof parsed.pingNameOnArrow !== 'boolean') parsed.pingNameOnArrow = DEFAULT_SETTINGS.pingNameOnArrow
      if (typeof parsed.lastPuzzlesCount !== 'number' || !Number.isFinite(parsed.lastPuzzlesCount)) parsed.lastPuzzlesCount = DEFAULT_SETTINGS.lastPuzzlesCount
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {}
  return DEFAULT_SETTINGS
}

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

// Player chips shown above the canvas while a multiplayer session is active.
// Plain DOM, not Konva, so it can sit outside the board entirely.
function PlayerOverlay({
  players,
  selfId,
  status,
  mode,
  lanAddresses,
  onRejoin,
}: {
  players: Player[]
  selfId: string | null
  status: MultiplayerStatus
  mode: MultiplayerMode
  lanAddresses: string[]
  onRejoin: () => void
}) {
  return (
    <div className="mp-overlay">
      {mode === 'host' && lanAddresses.length > 0 && (
        <div className="mp-address-banner">Friends join with: {lanAddresses.join(' or ')}</div>
      )}
      <div className="mp-chip-row">
        {players.map(p => (
          <div key={p.id} className="mp-chip" style={{ borderColor: p.color }}>
            <span className="mp-chip-dot" style={{ background: p.color }} />
            <span className="mp-chip-name">{p.name}{p.id === selfId ? ' (you)' : ''}</span>
          </div>
        ))}
        {status !== 'connected' && status !== 'idle' && (
          <span className={`mp-status-pill${status === 'failed' ? ' mp-status-pill--error' : ''}`}>
            {status === 'reconnecting' ? 'Reconnecting...' : status === 'failed' ? 'Disconnected' : 'Connecting...'}
            {status === 'failed' && (
              <button className="mp-rejoin-btn" onClick={onRejoin}>Rejoin</button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function StartScreen({ onDebug }: { onDebug: () => void }) {
  const [imageSrc, setImageSrc] = useState<string | null>(() => {
    try { return localStorage.getItem('zenpiece-image') } catch { return null }
  })
  const [imageAspect, setImageAspect] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem('zenpiece-image-aspect') ?? '1') || 1 } catch { return 1 }
  })
  const [input, setInput] = useState(() => {
    try { return localStorage.getItem('zenpiece-piece-count') ?? '300' } catch { return '300' }
  })
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null)
  const [accentColor, setAccentColor] = useState(CUSTOM_DARK)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [puzzleHasProgress, setPuzzleHasProgress] = useState(false)
  const stats = useStats()

  // Multiplayer
  const mp = useMultiplayer()
  const [mpPanel, setMpPanel] = useState<'none' | 'join'>('none')
  // Name comes from the stats profile (readStatsName) for hosting. Joiners get
  // a join screen to pick or rename a player, tracked here.
  const [mpJoinAddress, setMpJoinAddress] = useState('')
  // Blank by default: the joiner either clicks a saved player or types a new
  // name. A profile is only created when they actually join.
  const [joinName, setJoinName] = useState('')
  // Served mode: the app was loaded from the host program (a production build),
  // so the server is this same origin. In dev it runs under Vite and connects
  // to a separately started server by typed address.
  const served = import.meta.env.PROD
  const servedAddress = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  // A shared link may carry the room code as ?code=..., so friends who open it
  // never type anything.
  const [mpRoomCode, setMpRoomCode] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('code') ?? '' } catch { return '' }
  })
  // The host opens the plain URL and needs no code (the server trusts its own
  // machine). Only a shared ?code=... link marks a joiner: they get a focused
  // join screen, never the picker.
  const joinIntent = served && (() => {
    try { return new URLSearchParams(window.location.search).has('code') } catch { return false }
  })()
  const [mpStarting, setMpStarting] = useState(false)
  const [mpStartError, setMpStartError] = useState<string | null>(null)
  // Re-encoded image the host actually plays with, so every client cuts
  // pieces from pixel identical source data (see multiplayer/image.ts)
  const [hostNetImage, setHostNetImage] = useState<string | null>(null)
  const hostSeedRef = useRef(0)
  // Host mode: a persistent hosting state that outlives any single puzzle. The
  // host stays connected across puzzles; joiners follow from one to the next.
  const [hostMode, setHostMode] = useState(false)
  // Bumps on every fresh puzzle so the board remounts cleanly.
  const [boardEpoch, setBoardEpoch] = useState(0)
  // Set when hosting the current in-progress puzzle from the menu, so the board
  // is seeded with the exact state instead of a fresh scatter.
  const hostSnapshotRef = useRef<(() => { pieces: NetPiece[]; groups: Groups; genWidth: number; genHeight: number }) | null>(null)
  const promotedStateRef = useRef<{ pieces: NetPiece[]; groups: Groups; genWidth: number; genHeight: number } | null>(null)
  const pendingHostRef = useRef<{ snap: { pieces: NetPiece[]; groups: Groups; genWidth: number; genHeight: number }; netImage: string } | null>(null)
  const prevPlayersRef = useRef<Player[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const { theme } = settings

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    try { localStorage.setItem('zenpiece-settings', JSON.stringify(settings)) } catch {}
  }, [settings])

  useEffect(() => {
    try { localStorage.setItem('zenpiece-piece-count', input) } catch {}
  }, [input])

  // Joins/leaves get a brief toast. Diffed against the previous players list
  // since the server only ever sends the current roster, not deltas.
  useEffect(() => {
    const prev = prevPlayersRef.current
    const prevIds = new Set(prev.map(p => p.id))
    const curIds = new Set(mp.players.map(p => p.id))
    const joined = mp.players.find(p => !prevIds.has(p.id) && p.id !== mp.selfId)
    const left = prev.find(p => !curIds.has(p.id) && p.id !== mp.selfId)
    if (joined) setToast(`${joined.name} joined`)
    else if (left) setToast(`${left.name} left`)
    prevPlayersRef.current = mp.players
  }, [mp.players, mp.selfId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // A shared join link shows a join screen: pick which saved player to play as
  // (or make a new one) and confirm. No auto-connect.
  const joinAttemptedRef = useRef(false)

  // Hosting the current puzzle from the menu completes here once the server
  // accepts the connection, so a failure surfaces cleanly instead of a dead
  // board. Fresh host-mode puzzles create their session on generation instead.
  useEffect(() => {
    const pending = pendingHostRef.current
    if (!pending) return
    if (mp.status === 'connected' && mp.selfId) {
      pendingHostRef.current = null
      mp.createSession(
        {
          imageDataUrl: pending.netImage,
          cols: grid!.cols,
          rows: grid!.rows,
          seed: hostSeedRef.current,
          knobSize: settings.knobSize,
          pieceStyle: settings.pieceStyle,
          pieceSpacing: settings.pieceSpacing,
          edgeStyle: settings.edgeStyle,
          genWidth: pending.snap.genWidth,
          genHeight: pending.snap.genHeight,
        },
        pending.snap.pieces,
        pending.snap.groups,
      )
      promotedStateRef.current = pending.snap
      setHostNetImage(pending.netImage)
      setBoardEpoch(e => e + 1)
      setHostMode(true)
      setMpStarting(false)
    } else if (mp.status === 'failed') {
      pendingHostRef.current = null
      mp.leave()
      setMpStartError(mp.errorMessage ?? 'Could not host the game.')
      setMpStarting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mp.status, mp.selfId])

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
        const aspect = img.width / img.height
        setImageSrc(src)
        setImageAspect(aspect)
        try {
          localStorage.setItem('zenpiece-image', src)
          localStorage.setItem('zenpiece-image-aspect', String(aspect))
        } catch {}
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveImage() {
    setImageSrc(null)
    setImageAspect(1)
    try {
      localStorage.removeItem('zenpiece-image')
      localStorage.removeItem('zenpiece-image-aspect')
    } catch {}
  }

  async function handleStart() {
    if (!canStart) return
    setAccentColor(matchedQuick ? matchedQuick.dark : CUSTOM_DARK)
    setPuzzleHasProgress(false)
    // Every game gets a known seed so all clients cut identical pieces.
    hostSeedRef.current = Date.now() >>> 0
    setBoardEpoch(e => e + 1)
    if (hostMode) {
      // In host mode a puzzle is shared fresh the instant it starts.
      promotedStateRef.current = null
      setMpStartError(null)
      setMpStarting(true)
      try {
        const netImage = await prepareNetImage(imageSrc!)
        setHostNetImage(netImage)
        setGrid(calcGrid(pieceCount, imageAspect))
      } catch {
        setMpStartError('Could not prepare the image.')
      } finally {
        setMpStarting(false)
      }
      return
    }
    setHostNetImage(null)
    setGrid(calcGrid(pieceCount, imageAspect))
  }

  // Enter host mode from the start page: connect as the host (no code needed on
  // your own machine) and stay connected across puzzles.
  async function enterHostMode() {
    setMpStartError(null)
    setMpStarting(true)
    try {
      promotedStateRef.current = null
      await mp.host(readActiveProfile().name || 'Host', served ? servedAddress : 'localhost', mpRoomCode.trim(), readActiveProfile().id)
      setHostMode(true)
    } catch {
      // Reset to a clean solo state so a failed host attempt never blocks play.
      mp.leave()
      setHostMode(false)
      setMpStartError('Could not reach the server. Run "npm run host" first.')
    } finally {
      setMpStarting(false)
    }
  }

  // Host the current in-progress puzzle from the in-game menu, keeping its exact
  // state. Completes in the pending-host effect once connected.
  async function handleHostThisGame() {
    if (!imageSrc || !grid) return
    const snap = hostSnapshotRef.current?.()
    if (!snap) return
    setMpStartError(null)
    setMpStarting(true)
    try {
      const netImage = await prepareNetImage(imageSrc)
      pendingHostRef.current = { snap, netImage }
      await mp.host(readActiveProfile().name || 'Host', served ? servedAddress : 'localhost', mpRoomCode.trim(), readActiveProfile().id)
    } catch {
      pendingHostRef.current = null
      mp.leave()
      setMpStartError('Could not reach the server. Run "npm run host" first.')
      setMpStarting(false)
    }
  }

  function stopHosting() {
    mp.leave()
    setHostMode(false)
    promotedStateRef.current = null
    setHostNetImage(null)
    setGrid(null)
  }

  async function handleJoinStart() {
    const address = served ? servedAddress : mpJoinAddress.trim()
    if (!address) return
    joinAttemptedRef.current = true
    setMpStartError(null)
    setMpStarting(true)
    try {
      await mp.join(readActiveProfile().name || 'Player', address, mpRoomCode.trim(), readActiveProfile().id)
    } catch {
      setMpStartError(served ? 'Could not reach the game. Check that the host is still running.' : 'Could not reach that address. Check it and that the host is running.')
    } finally {
      setMpStarting(false)
    }
  }

  // Join as an existing saved player (by id).
  function joinAsPlayer(id: string) {
    stats.selectProfile(id)
    handleJoinStart()
  }

  // Join under a freshly typed name: a new player is created only now, on the
  // actual join, so opening the screen never leaves empty profiles behind.
  function joinAsNewName() {
    const nm = joinName.trim()
    if (!nm) return
    stats.createPlayer(nm)
    handleJoinStart()
  }

  function handleRejoin() {
    if (mp.mode === 'host') {
      mp.host(readActiveProfile().name || 'Host', served ? servedAddress : 'localhost', mpRoomCode.trim(), readActiveProfile().id)
    } else {
      handleJoinStart()
    }
  }

  function handleLeaveBoard() {
    // In host mode, leaving a puzzle ends it but keeps you hosting, so you can
    // start another and joiners follow. Otherwise it is a normal leave.
    if (hostMode) {
      mp.endSession()
      promotedStateRef.current = null
      setHostNetImage(null)
      setGrid(null)
      return
    }
    if (mp.mode !== 'solo') {
      mp.leave()
      setHostNetImage(null)
    }
    setMpPanel('none')
    setGrid(null)
  }

  function buildHostMultiplayer(): BoardMultiplayer {
    // Two ways to host: from the menu, the current puzzle is seeded from its
    // snapshot (session already created). From the start page, a fresh puzzle
    // creates its session on generation.
    const snap = promotedStateRef.current
    if (snap) {
      return {
        role: 'host',
        selfColor: mp.selfColor ?? '#888',
        selfName: mp.players.find(p => p.id === mp.selfId)?.name ?? '',
        seed: hostSeedRef.current,
        genWidth: snap.genWidth,
        genHeight: snap.genHeight,
        initialPieces: snap.pieces,
        initialGroups: snap.groups,
        initialHeld: {},
        api: mp.api,
        setRemoteHandlers: mp.setRemoteHandlers,
        setBoardStateProvider: mp.setBoardStateProvider,
      }
    }
    return {
      role: 'host',
      selfColor: mp.selfColor ?? '#888',
      selfName: mp.players.find(p => p.id === mp.selfId)?.name ?? '',
      seed: hostSeedRef.current,
      genWidth: null,
      genHeight: null,
      initialPieces: null,
      initialGroups: {},
      initialHeld: {},
      api: mp.api,
      setRemoteHandlers: mp.setRemoteHandlers,
      setBoardStateProvider: mp.setBoardStateProvider,
      onGenerated: (pieces, genWidth, genHeight) => {
        if (!hostNetImage || !grid) return
        mp.createSession(
          {
            imageDataUrl: hostNetImage,
            cols: grid.cols,
            rows: grid.rows,
            seed: hostSeedRef.current,
            knobSize: settings.knobSize,
            pieceStyle: settings.pieceStyle,
            pieceSpacing: settings.pieceSpacing,
            edgeStyle: settings.edgeStyle,
            genWidth,
            genHeight,
          },
          pieces,
          {},
        )
      },
    }
  }

  function buildGuestMultiplayer(session: NetSession): BoardMultiplayer {
    // Expand the server's groupId -> playerId lock map into a pieceId keyed
    // map, so pieces already held when this client joins highlight at once
    const initialHeld: Record<string, { playerId: string; color: string }> = {}
    for (const piece of session.pieces) {
      const root = session.groups[piece.id] ?? piece.id
      const holderId = session.heldGroups[root]
      if (!holderId) continue
      const color = mp.players.find(p => p.id === holderId)?.color ?? '#888'
      initialHeld[piece.id] = { playerId: holderId, color }
    }
    return {
      role: 'guest',
      selfColor: mp.selfColor ?? '#888',
      selfName: mp.players.find(p => p.id === mp.selfId)?.name ?? '',
      seed: session.config.seed,
      genWidth: session.config.genWidth,
      genHeight: session.config.genHeight,
      initialPieces: session.pieces,
      initialGroups: session.groups,
      initialHeld,
      api: mp.api,
      setRemoteHandlers: mp.setRemoteHandlers,
      setBoardStateProvider: mp.setBoardStateProvider,
    }
  }

  // A joiner who is connected but has no puzzle yet: either the host has not
  // started, or they stepped back between puzzles. This is observer/waiting:
  // they see the host's game the moment it starts, and cannot influence setup.
  if (mp.mode === 'guest' && !mp.session) {
    return (
      <div className="mp-waiting-screen">
        <h1>ZenPiece</h1>
        <p className="mp-waiting-text">
          {mp.status === 'failed'
            ? (mp.errorMessage ?? 'Could not connect.')
            : 'You are viewing the host’s game.'}
        </p>
        {mp.status !== 'failed' && (
          <p className="mp-waiting-text">Waiting for the host to start a puzzle. You will join automatically.</p>
        )}
        {mp.players.length > 0 && (
          <PlayerOverlay
            players={mp.players}
            selfId={mp.selfId}
            status={mp.status}
            mode={mp.mode}
            lanAddresses={mp.lanAddresses}
            onRejoin={handleRejoin}
          />
        )}
        {toast && <div className="mp-toast">{toast}</div>}
        {mp.status === 'failed' && (
          <button className="mp-start-btn" onClick={() => { joinAttemptedRef.current = false; handleJoinStart() }}>Try again</button>
        )}
        {!joinIntent && (
          <button className="mp-cancel-btn" onClick={() => { mp.leave(); setMpPanel('none') }}>Leave</button>
        )}
      </div>
    )
  }

  // Opened via a shared join link: choose which saved player to play as (or
  // make a new one), then join. Never the program.
  if (joinIntent && mp.mode === 'solo') {
    return (
      <div className="mp-waiting-screen">
        <h1>ZenPiece</h1>
        <p className="mp-waiting-text">Join the game</p>
        <div className="mp-panel">
          <input
            className="mp-name-input"
            type="text"
            placeholder="Type a name to play as"
            value={joinName}
            autoFocus
            onChange={e => setJoinName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') joinAsNewName() }}
          />
          {mpStartError && <p className="mp-error">{mpStartError}</p>}
          <div className="mp-panel-actions">
            <button className="mp-start-btn" disabled={mpStarting || !joinName.trim()} onClick={joinAsNewName}>
              {mpStarting ? 'Joining...' : 'Join'}
            </button>
          </div>
          {stats.profiles.some(p => !p.friend) && (
            <div className="join-profiles">
              <span className="join-profiles-label">Or pick a saved player:</span>
              {stats.profiles.filter(p => !p.friend).sort((a, b) => b.sessions - a.sessions).map(p => (
                <button
                  key={p.id}
                  className="join-profile-row"
                  disabled={mpStarting}
                  onClick={() => joinAsPlayer(p.id)}
                >
                  <span className="join-profile-name">{p.name}</span>
                  <span className="join-profile-count">{p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const isGuestBoard = mp.mode === 'guest' && mp.session !== null
  // Host mode makes a puzzle a host board. The solo board also covers the brief
  // window while hosting-from-the-menu is connecting (mode flips to host before
  // hostMode is set), so the board never flashes away.
  const isHostBoard = hostMode && grid !== null && hostNetImage !== null
  const isSoloBoard = !hostMode && !isGuestBoard && grid !== null && imageSrc !== null

  if (isGuestBoard || isHostBoard || isSoloBoard) {
    const session = mp.session
    const boardImageSrc = isGuestBoard ? session!.config.imageDataUrl : (isHostBoard ? hostNetImage! : imageSrc!)
    const boardCols = isGuestBoard ? session!.config.cols : grid!.cols
    const boardRows = isGuestBoard ? session!.config.rows : grid!.rows
    const boardKnobSize = isGuestBoard ? session!.config.knobSize : settings.knobSize
    const boardPieceStyle = isGuestBoard ? session!.config.pieceStyle : settings.pieceStyle
    const boardPieceSpacing = isGuestBoard ? session!.config.pieceSpacing : settings.pieceSpacing
    const boardEdgeStyle = (isGuestBoard ? session!.config.edgeStyle : settings.edgeStyle) as EdgeStyle
    const multiplayerProp: BoardMultiplayer | undefined =
      isHostBoard ? buildHostMultiplayer() : (isGuestBoard ? buildGuestMultiplayer(session!) : undefined)
    const coPlayers = mp.mode !== 'solo'
      ? mp.players.filter(p => p.id !== mp.selfId).map(p => ({ id: p.pid, name: p.name }))
      : []

    return (
      <>
        <PuzzleBoard
          key={isGuestBoard ? `guest-${mp.sessionEpoch}` : (isHostBoard ? `host-${boardEpoch}` : 'local')}
          imageSrc={boardImageSrc}
          cols={boardCols}
          rows={boardRows}
          zoomStep={settings.zoomStep}
          resolution={settings.resolution}
          panStep={settings.panStep}
          knobSize={boardKnobSize}
          pieceStyle={boardPieceStyle}
          pieceSpacing={boardPieceSpacing}
          edgeStyle={boardEdgeStyle}
          showBorder={settings.showBorder}
          rippleQuality={settings.rippleQuality}
          progressMode={settings.progressMode}
          progressPercent={settings.progressPercent}
          theme={settings.theme}
          accentColor={accentColor}
          pingNameOnRing={settings.pingNameOnRing}
          pingNameOnArrow={settings.pingNameOnArrow}
          onReset={handleLeaveBoard}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStats={() => setShowStats(true)}
          onToggleTheme={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}
          onPieceMoved={() => setPuzzleHasProgress(true)}
          multiplayer={multiplayerProp}
          statsHooks={stats}
          coPlayers={coPlayers}
          seed={hostSeedRef.current}
          onHostGame={handleHostThisGame}
          hostSnapshotRef={hostSnapshotRef}
        />
        {mp.mode !== 'solo' && mp.players.length > 1 && (
          <PlayerOverlay
            players={mp.players}
            selfId={mp.selfId}
            status={mp.status}
            mode={mp.mode}
            lanAddresses={mp.lanAddresses}
            onRejoin={handleRejoin}
          />
        )}
        {toast && <div className="mp-toast">{toast}</div>}
        {showSettings && (
          <SettingsModal
            settings={settings}
            onChange={next => {
              if (next.pieceSpacing !== settings.pieceSpacing) setPuzzleHasProgress(false)
              setSettings(next)
            }}
            onClose={() => setShowSettings(false)}
            puzzleHasProgress={puzzleHasProgress}
          />
        )}
        {showStats && (
          <StatsScreen
            stats={stats}
            lastPuzzlesCount={settings.lastPuzzlesCount}
            onClose={() => setShowStats(false)}
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

        <button className="top-settings-btn" onClick={() => setShowStats(true)}>
          Stats
        </button>

        <button className="top-settings-btn" onClick={onDebug}>
          Debug
        </button>
      </div>

      <h1>ZenPiece</h1>

      <div className="start-section">
        {imageSrc ? (
          <div className="image-chosen">
            <img className="thumbnail" src={imageSrc} alt="Chosen" />
            <div className="image-actions">
              <label className="change-btn">
                Change image
                <input type="file" accept="image/*" onChange={handleFile} hidden />
              </label>
              <span className="image-actions-sep">·</span>
              <button className="remove-btn" onClick={handleRemoveImage}>Remove</button>
            </div>
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

      {imageSrc && mpPanel === 'none' && (
        <div className="start-section start-actions">
          <button className="start-btn" disabled={!canStart || mpStarting} onClick={handleStart}>
            {mpStarting ? 'Starting...' : (hostMode ? 'Start hosted puzzle' : 'Start puzzling')}
          </button>
          {hostMode && mpStartError && <p className="mp-error">{mpStartError}</p>}
        </div>
      )}

      <div className="start-section mp-section">
        {hostMode ? (
          <div className="mp-panel">
            <p className="mp-panel-hint">You are hosting. Choose a picture and start a puzzle; anyone with your link joins automatically.</p>
            <div className="mp-panel-actions">
              <button className="mp-cancel-btn" onClick={stopHosting}>Stop hosting</button>
            </div>
          </div>
        ) : (
          <>
            {mpPanel === 'none' && (
              <div className="mp-toggle-row">
                <span className="mp-toggle-label">or</span>
                <button className="mp-toggle-btn" disabled={mpStarting} onClick={enterHostMode}>Host a game</button>
                <button className="mp-toggle-btn" onClick={() => { setMpStartError(null); setMpPanel('join') }}>Join</button>
              </div>
            )}
            {mpPanel === 'none' && mpStartError && <p className="mp-error">{mpStartError}</p>}

            {mpPanel === 'join' && (
              <div className="mp-panel">
                {served ? (
                  <input
                    className="mp-name-input"
                    type="text"
                    placeholder="Room code"
                    value={mpRoomCode}
                    onChange={e => setMpRoomCode(e.target.value)}
                  />
                ) : (
                  <input
                    className="mp-address-input"
                    type="text"
                    placeholder="Host address, e.g. 192.168.1.23"
                    value={mpJoinAddress}
                    onChange={e => setMpJoinAddress(e.target.value)}
                  />
                )}
                {mpStartError && <p className="mp-error">{mpStartError}</p>}
                <div className="mp-panel-actions">
                  <button className="mp-cancel-btn" onClick={() => { setMpPanel('none'); setMpStartError(null) }}>Cancel</button>
                  <button className="mp-start-btn" disabled={mpStarting || (!served && !mpJoinAddress.trim())} onClick={handleJoinStart}>
                    {mpStarting ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showStats && (
        <StatsScreen
          stats={stats}
          lastPuzzlesCount={settings.lastPuzzlesCount}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  const [debugMode, setDebugMode] = useState(false)
  if (debugMode) return <DebugView onExit={() => setDebugMode(false)} />
  return <StartScreen onDebug={() => setDebugMode(true)} />
}
