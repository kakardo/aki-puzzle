import { useCallback, useRef, useState } from 'react'
import type { Groups, NetPiece, NetSession, Player, PuzzleConfig, ServerMessage } from '../multiplayer/protocol'
import { PROTOCOL_VERSION } from '../multiplayer/protocol'
import { WebSocketTransport } from '../multiplayer/transport'
import type { Transport } from '../multiplayer/transport'
import type { MultiplayerSendApi, RemoteHandlers } from '../multiplayer/types'

export type MultiplayerStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
export type MultiplayerMode = 'solo' | 'host' | 'guest'

// Drag messages leave at most every 33 ms (about 30 Hz), with the trailing
// position always delivered so remote views never freeze a frame behind.
const DRAG_INTERVAL_MS = 33

const RECONNECT_DELAYS = [500, 1000, 2000, 5000]
const RECONNECT_MAX_ATTEMPTS = 12

export type Multiplayer = {
  status: MultiplayerStatus
  mode: MultiplayerMode
  players: Player[]
  selfId: string | null
  selfColor: string | null
  session: NetSession | null
  sessionEpoch: number
  lanAddresses: string[]
  errorMessage: string | null
  host(name: string, address?: string): Promise<void>
  join(name: string, address: string): Promise<void>
  createSession(config: PuzzleConfig, pieces: NetPiece[], groups: Groups): void
  leave(): void
  requestSync(): void
  api: MultiplayerSendApi
  setRemoteHandlers(h: RemoteHandlers | null): void
  setBoardStateProvider(fn: (() => { pieces: NetPiece[]; groups: Groups }) | null): void
}

export function useMultiplayer(): Multiplayer {
  // State tier: changes a handful of times per session, fine to render from
  const [status, setStatus] = useState<MultiplayerStatus>('idle')
  const [mode, setMode] = useState<MultiplayerMode>('solo')
  const [players, setPlayers] = useState<Player[]>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [selfColor, setSelfColor] = useState<string | null>(null)
  const [session, setSession] = useState<NetSession | null>(null)
  const [sessionEpoch, setSessionEpoch] = useState(0)
  const [lanAddresses, setLanAddresses] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Ref tier: touched up to 30 times a second, must never cause a render
  const transportRef = useRef<Transport | null>(null)
  const handlersRef = useRef<RemoteHandlers | null>(null)
  const providerRef = useRef<(() => { pieces: NetPiece[]; groups: Groups }) | null>(null)
  const hostConfigRef = useRef<PuzzleConfig | null>(null)
  const modeRef = useRef<MultiplayerMode>('solo')
  const selfIdRef = useRef<string | null>(null)
  const playersRef = useRef<Player[]>([])
  const nameRef = useRef('')
  const addressRef = useRef('')
  const leftRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttleRef = useRef<{
    last: number
    timer: ReturnType<typeof setTimeout> | null
    pending: { pieceId: string; x: number; y: number } | null
  }>({ last: 0, timer: null, pending: null })

  function updatePlayers(next: Player[]) {
    playersRef.current = next
    setPlayers(next)
  }

  function handleServerMessage(msg: ServerMessage) {
    const h = handlersRef.current
    switch (msg.type) {
      case 'welcome': {
        selfIdRef.current = msg.playerId
        setSelfId(msg.playerId)
        setSelfColor(msg.color)
        updatePlayers(msg.players)
        setLanAddresses(msg.lanAddresses)
        setStatus('connected')
        setErrorMessage(null)
        reconnectAttemptRef.current = 0
        if (msg.session) {
          // Joining (or rejoining) a running session: the snapshot is the
          // truth, the board rebuilds from it via the epoch key
          setSession(msg.session)
          setSessionEpoch(e => e + 1)
        } else if (modeRef.current === 'host' && hostConfigRef.current && providerRef.current) {
          // The server restarted and lost the session. The host is a full
          // replica, so restore it from the live board
          const state = providerRef.current()
          transportRef.current?.send({
            type: 'create_session',
            config: hostConfigRef.current,
            pieces: state.pieces,
            groups: state.groups,
          })
        }
        return
      }
      case 'session_created':
        setSession(msg.session)
        setSessionEpoch(e => e + 1)
        return
      case 'player_joined':
        updatePlayers([...playersRef.current.filter(p => p.id !== msg.player.id), msg.player])
        return
      case 'player_left':
        updatePlayers(playersRef.current.filter(p => p.id !== msg.playerId))
        h?.onPlayerLeft(msg.playerId)
        return
      case 'grab_granted':
        // Grabs are optimistic; nothing to do on success
        return
      case 'grab_denied':
        h?.onGrabDenied(msg.pieceId)
        return
      case 'piece_grabbed': {
        if (msg.playerId === selfIdRef.current) return
        const color = playersRef.current.find(p => p.id === msg.playerId)?.color ?? '#888'
        h?.onRemoteGrab(msg.playerId, color, msg.groupPieceIds)
        return
      }
      case 'piece_dragged':
        if (msg.playerId === selfIdRef.current) return
        h?.onRemoteDrag(msg.pieceId, msg.x, msg.y)
        return
      case 'piece_dropped':
        if (msg.playerId === selfIdRef.current) return
        h?.onRemoteDrop(msg.pieces, msg.groups)
        return
      case 'piece_released':
        if (msg.playerId === selfIdRef.current) return
        h?.onRemoteRelease(msg.pieceId)
        return
      case 'player_pinged': {
        if (msg.playerId === selfIdRef.current) return
        const player = playersRef.current.find(p => p.id === msg.playerId)
        h?.onRemotePing(player?.color ?? '#888', player?.name ?? '', msg.x, msg.y)
        return
      }
      case 'error':
        if (msg.code === 'version_mismatch' || msg.code === 'session_full') {
          setErrorMessage(msg.message)
          setStatus('failed')
        }
        return
    }
  }

  async function connectAndJoin(address: string, name: string) {
    const transport = new WebSocketTransport()
    transport.onMessage(handleServerMessage)
    transport.onClose(() => {
      if (!leftRef.current) scheduleReconnect()
    })
    transportRef.current = transport
    await transport.connect(address)
    transport.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, name })
  }

  function scheduleReconnect() {
    if (reconnectAttemptRef.current >= RECONNECT_MAX_ATTEMPTS) {
      setStatus('failed')
      setErrorMessage('Lost the connection and could not get it back.')
      return
    }
    setStatus('reconnecting')
    const attempt = reconnectAttemptRef.current++
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null
      try {
        await connectAndJoin(addressRef.current, nameRef.current)
      } catch {
        scheduleReconnect()
      }
    }, delay)
  }

  async function start(asMode: 'host' | 'guest', name: string, address: string) {
    leftRef.current = false
    modeRef.current = asMode
    setMode(asMode)
    nameRef.current = name
    addressRef.current = address
    reconnectAttemptRef.current = 0
    setErrorMessage(null)
    setStatus('connecting')
    try {
      await connectAndJoin(address, name)
    } catch (err) {
      setStatus('failed')
      setErrorMessage('Could not reach the server. Is it running, and is the address right?')
      throw err
    }
  }

  const hostFn = useCallback((name: string, address = 'localhost') => start('host', name, address), [])
  const joinFn = useCallback((name: string, address: string) => start('guest', name, address), [])

  const createSessionFn = useCallback((config: PuzzleConfig, pieces: NetPiece[], groups: Groups) => {
    hostConfigRef.current = config
    transportRef.current?.send({ type: 'create_session', config, pieces, groups })
  }, [])

  const leaveFn = useCallback(() => {
    leftRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    const t = throttleRef.current
    if (t.timer) clearTimeout(t.timer)
    t.timer = null
    t.pending = null
    transportRef.current?.close()
    transportRef.current = null
    hostConfigRef.current = null
    modeRef.current = 'solo'
    selfIdRef.current = null
    playersRef.current = []
    setMode('solo')
    setStatus('idle')
    setPlayers([])
    setSelfId(null)
    setSelfColor(null)
    setSession(null)
    setLanAddresses([])
    setErrorMessage(null)
  }, [])

  const requestSyncFn = useCallback(() => {
    transportRef.current?.send({ type: 'request_sync' })
  }, [])

  const setRemoteHandlersFn = useCallback((h: RemoteHandlers | null) => {
    handlersRef.current = h
  }, [])

  const setBoardStateProviderFn = useCallback((fn: (() => { pieces: NetPiece[]; groups: Groups }) | null) => {
    providerRef.current = fn
  }, [])

  // Stable identity so PuzzleBoard props never churn. Every call is a no-op
  // while disconnected, so the board calls these unconditionally.
  const apiRef = useRef<MultiplayerSendApi | null>(null)
  if (!apiRef.current) {
    const flushPendingDrag = () => {
      const t = throttleRef.current
      if (t.timer) clearTimeout(t.timer)
      t.timer = null
      t.pending = null
    }
    apiRef.current = {
      sendGrab(pieceId) {
        transportRef.current?.send({ type: 'grab', pieceId })
      },
      sendDrag(pieceId, x, y) {
        const t = throttleRef.current
        if (!transportRef.current) return
        const now = performance.now()
        const elapsed = now - t.last
        if (elapsed >= DRAG_INTERVAL_MS) {
          t.last = now
          transportRef.current.send({ type: 'drag', pieceId, x, y })
        } else {
          t.pending = { pieceId, x, y }
          if (!t.timer) {
            t.timer = setTimeout(() => {
              t.timer = null
              const p = t.pending
              t.pending = null
              if (p && transportRef.current) {
                t.last = performance.now()
                transportRef.current.send({ type: 'drag', pieceId: p.pieceId, x: p.x, y: p.y })
              }
            }, DRAG_INTERVAL_MS - elapsed)
          }
        }
      },
      sendDrop(pieceId, pieces, groups) {
        // A pending throttled drag must not land after the drop; the drop
        // carries the exact final positions anyway
        flushPendingDrag()
        transportRef.current?.send({ type: 'drop', pieceId, pieces, groups })
      },
      sendRelease(pieceId) {
        flushPendingDrag()
        transportRef.current?.send({ type: 'release', pieceId })
      },
      sendPing(x, y) {
        transportRef.current?.send({ type: 'ping', x, y })
      },
    }
  }

  return {
    status,
    mode,
    players,
    selfId,
    selfColor,
    session,
    sessionEpoch,
    lanAddresses,
    errorMessage,
    host: hostFn,
    join: joinFn,
    createSession: createSessionFn,
    leave: leaveFn,
    requestSync: requestSyncFn,
    api: apiRef.current,
    setRemoteHandlers: setRemoteHandlersFn,
    setBoardStateProvider: setBoardStateProviderFn,
  }
}
