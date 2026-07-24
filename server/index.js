// ZenPiece multiplayer server. One process hosts one session on the local
// network. Run with: node server/index.js [port]
//
// The server holds the canonical board state and arbitrates drag locks;
// clients compute snaps and send authoritative drops. See
// src/multiplayer/protocol.ts for the full message reference.

import { WebSocketServer } from 'ws'
import os from 'node:os'
import { PROTOCOL_VERSION, DEFAULT_PORT } from './protocol.js'
import {
  createStore, addPlayer, removePlayer, createSession,
  tryGrab, isHolder, applyDrag, applyDrop, releaseLock,
  membersOf, snapshot,
} from './session.js'

const port = Number(process.argv[2]) || DEFAULT_PORT
const store = createStore()
const sockets = new Map() // playerId -> ws

const wss = new WebSocketServer({
  port,
  maxPayload: 20 * 1024 * 1024, // session snapshots carry the puzzle image
})

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

// Echo rule: state changes caused by a player are never sent back to them.
function broadcast(msg, exceptPlayerId = null) {
  const data = JSON.stringify(msg)
  for (const [playerId, ws] of sockets) {
    if (playerId === exceptPlayerId) continue
    if (ws.readyState === ws.OPEN) ws.send(data)
  }
}

function lanAddresses() {
  const out = []
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address)
    }
  }
  return out
}

function handleMessage(ws, msg) {
  // Everything except join requires a registered player
  if (msg.type === 'join') {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      send(ws, { type: 'error', code: 'version_mismatch', message: 'Update the app: the host is running a different version.' })
      ws.close()
      return
    }
    const player = addPlayer(store, msg.name)
    if (!player) {
      send(ws, { type: 'error', code: 'session_full', message: 'This session is full.' })
      ws.close()
      return
    }
    ws.playerId = player.id
    sockets.set(player.id, ws)
    send(ws, {
      type: 'welcome',
      playerId: player.id,
      color: player.color,
      players: [...store.players.values()],
      session: snapshot(store),
      lanAddresses: lanAddresses(),
    })
    broadcast({ type: 'player_joined', player }, player.id)
    console.log(`joined: ${player.name} (${store.players.size} connected)`)
    return
  }

  const playerId = ws.playerId
  if (!playerId || !store.players.has(playerId)) return

  switch (msg.type) {
    case 'create_session': {
      // Only honoured while no session exists: the first host, or the host
      // restoring after a server restart. A new puzzle means a new server.
      if (store.session) {
        send(ws, { type: 'error', code: 'session_exists', message: 'A puzzle is already running on this server.' })
        return
      }
      if (!msg.config || !Array.isArray(msg.pieces)) return
      createSession(store, msg.config, msg.pieces, msg.groups ?? {})
      broadcast({ type: 'session_created', session: snapshot(store) }, playerId)
      console.log(`session created: ${msg.config.cols}x${msg.config.rows} pieces`)
      return
    }
    case 'grab': {
      if (!store.session) return
      const result = tryGrab(store, playerId, msg.pieceId)
      if (!result.ok) {
        send(ws, { type: 'grab_denied', pieceId: msg.pieceId, heldBy: result.heldBy ?? '' })
        return
      }
      send(ws, { type: 'grab_granted', pieceId: msg.pieceId })
      broadcast({ type: 'piece_grabbed', playerId, pieceId: msg.pieceId, groupPieceIds: result.members }, playerId)
      return
    }
    case 'drag': {
      if (!store.session) return
      // Drags from anyone but the lock holder are stale messages from the
      // optimistic window after a denied grab; drop them silently.
      if (!isHolder(store, playerId, msg.pieceId)) return
      if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return
      applyDrag(store, msg.pieceId, msg.x, msg.y)
      broadcast({ type: 'piece_dragged', playerId, pieceId: msg.pieceId, x: msg.x, y: msg.y }, playerId)
      return
    }
    case 'drop': {
      if (!store.session) return
      if (!isHolder(store, playerId, msg.pieceId)) {
        // Their optimistic local state is now wrong; hand them the truth
        send(ws, { type: 'error', code: 'not_lock_holder', message: 'Drop rejected.' })
        send(ws, { type: 'session_created', session: snapshot(store) })
        return
      }
      if (!Array.isArray(msg.pieces)) return
      applyDrop(store, playerId, msg.pieceId, msg.pieces, msg.groups ?? store.session.groups)
      broadcast({ type: 'piece_dropped', playerId, pieces: msg.pieces, groups: store.session.groups }, playerId)
      return
    }
    case 'release': {
      if (!store.session) return
      if (releaseLock(store, playerId, msg.pieceId)) {
        broadcast({ type: 'piece_released', playerId, pieceId: msg.pieceId }, playerId)
      }
      return
    }
    case 'ping': {
      // Transient: relayed to everyone else and never stored, so a late
      // joiner never inherits a stale ping.
      if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return
      broadcast({ type: 'player_pinged', playerId, x: msg.x, y: msg.y }, playerId)
      return
    }
    case 'request_sync': {
      const snap = snapshot(store)
      if (snap) send(ws, { type: 'session_created', session: snap })
      return
    }
  }
}

function dropConnection(ws) {
  const playerId = ws.playerId
  if (!playerId || !sockets.has(playerId)) return
  sockets.delete(playerId)
  const player = store.players.get(playerId)
  const releasedGroups = removePlayer(store, playerId)
  // Free the pieces a ghost would otherwise hold forever
  for (const groupId of releasedGroups) {
    broadcast({ type: 'piece_released', playerId, pieceId: groupId })
  }
  broadcast({ type: 'player_left', playerId })
  if (player) console.log(`left: ${player.name} (${store.players.size} connected)`)
}

wss.on('connection', ws => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('message', data => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string') return
    try {
      handleMessage(ws, msg)
    } catch (err) {
      console.error('message handling failed:', err)
    }
  })
  ws.on('close', () => dropConnection(ws))
  ws.on('error', () => dropConnection(ws))
})

// A sleeping laptop never sends a close frame; ping so its locks are not
// stuck forever. Two missed pongs and the connection is terminated.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 10000)

wss.on('close', () => clearInterval(heartbeat))

console.log(`ZenPiece server listening on port ${port}`)
const ips = lanAddresses()
if (ips.length > 0) console.log(`Friends on your network can join with: ${ips.join(' or ')}`)
