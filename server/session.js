// All server-side state and the rules for changing it. One server process
// hosts one session; everything lives in memory on purpose (the host client
// is a full replica and recreates the session if this process restarts).

import { randomUUID } from 'node:crypto'
import { PLAYER_COLORS } from './protocol.js'

export function createStore() {
  return {
    // { config, pieces: Map<id, {id,x,y,locked}>, groups: {pieceId: groupId} }
    session: null,
    players: new Map(), // playerId -> { id, name, color }
    locks: new Map(),   // groupId -> playerId
    // The player who created the current session. Host mode stays connected
    // across puzzles, so this drives who may replace or end the session.
    hostId: null,
  }
}

// Clears the running puzzle but keeps players connected, so a host can go back
// and start a different puzzle without dropping anyone.
export function endSession(store) {
  store.session = null
  store.locks.clear()
}

// Same convention as the client: a piece with no entry is its own group.
export function rootOf(groups, pieceId) {
  return groups[pieceId] ?? pieceId
}

export function membersOf(store, pieceId) {
  const groups = store.session.groups
  const root = rootOf(groups, pieceId)
  const members = []
  for (const id of store.session.pieces.keys()) {
    if (rootOf(groups, id) === root) members.push(id)
  }
  return members
}

export function addPlayer(store, name, pid) {
  if (store.players.size >= PLAYER_COLORS.length) return null
  const taken = new Set([...store.players.values()].map(p => p.color))
  const color = PLAYER_COLORS.find(c => !taken.has(c))
  const player = {
    id: randomUUID(),
    pid: String(pid || '').slice(0, 8),
    name: String(name || 'Player').slice(0, 24),
    color,
  }
  store.players.set(player.id, player)
  return player
}

// Removes the player and releases every lock they held. Returns the lock
// group ids that were released so the caller can broadcast piece_released.
export function removePlayer(store, playerId) {
  store.players.delete(playerId)
  const released = []
  for (const [groupId, holder] of store.locks) {
    if (holder === playerId) {
      store.locks.delete(groupId)
      released.push(groupId)
    }
  }
  return released
}

export function createSession(store, config, pieces, groups) {
  store.session = {
    config,
    pieces: new Map(pieces.map(p => [p.id, { id: p.id, x: p.x, y: p.y, locked: !!p.locked }])),
    groups: { ...groups },
  }
  store.locks.clear()
}

// First grab wins. Resolves the group against the server's own groups map,
// so a grab racing a merge still locks the merged group correctly.
export function tryGrab(store, playerId, pieceId) {
  const piece = store.session?.pieces.get(pieceId)
  if (!piece) return { ok: false, heldBy: null }
  if (piece.locked) return { ok: false, heldBy: null }
  const groupId = rootOf(store.session.groups, pieceId)
  const holder = store.locks.get(groupId)
  if (holder && holder !== playerId) return { ok: false, heldBy: holder }
  store.locks.set(groupId, playerId)
  return { ok: true, members: membersOf(store, pieceId) }
}

export function isHolder(store, playerId, pieceId) {
  if (!store.session) return false
  const groupId = rootOf(store.session.groups, pieceId)
  return store.locks.get(groupId) === playerId
}

// Keeps the whole group roughly current server-side during a drag, so a
// player joining mid-drag sees the group near its true position.
export function applyDrag(store, pieceId, x, y) {
  const anchor = store.session.pieces.get(pieceId)
  if (!anchor) return
  const dx = x - anchor.x
  const dy = y - anchor.y
  for (const id of membersOf(store, pieceId)) {
    const p = store.session.pieces.get(id)
    p.x += dx
    p.y += dy
  }
}

// The drop is authoritative: absolute positions for the moved group and the
// complete new groups map. Releases the drag lock.
export function applyDrop(store, playerId, pieceId, patches, groups) {
  const groupId = rootOf(store.session.groups, pieceId)
  for (const patch of patches) {
    const p = store.session.pieces.get(patch.id)
    if (!p) continue
    p.x = patch.x
    p.y = patch.y
    p.locked = !!patch.locked
  }
  store.session.groups = { ...groups }
  if (store.locks.get(groupId) === playerId) store.locks.delete(groupId)
}

export function releaseLock(store, playerId, pieceId) {
  const groupId = rootOf(store.session.groups, pieceId)
  if (store.locks.get(groupId) === playerId) {
    store.locks.delete(groupId)
    return true
  }
  return false
}

export function snapshot(store) {
  if (!store.session) return null
  const heldGroups = {}
  for (const [groupId, playerId] of store.locks) heldGroups[groupId] = playerId
  return {
    config: store.session.config,
    pieces: [...store.session.pieces.values()],
    groups: { ...store.session.groups },
    heldGroups,
  }
}
