import type { StatsFile, ProfileStats, CompletionRecord } from './types'
import { createEmptyProfile, generateProfileId } from './types'

export const STORAGE_KEY = 'zenpiece-stats'
const FILE_VERSION = 2
const DEFAULT_PROFILE_NAME = 'Player'

function takenIds(file: StatsFile): Set<string> {
  return new Set(Object.keys(file.profiles))
}

function emptyFile(): StatsFile {
  const id = generateProfileId()
  return {
    version: FILE_VERSION,
    activeProfileId: id,
    profiles: { [id]: createEmptyProfile(DEFAULT_PROFILE_NAME, id) },
  }
}

// Accepts the current id-keyed format, the older name-keyed format, or a
// partial/hand-edited file, and returns a valid id-keyed StatsFile. Returns
// null only when the input is not a stats file at all.
function normalize(parsed: unknown): StatsFile | null {
  if (!parsed || typeof parsed !== 'object') return null
  const v = parsed as Record<string, unknown>
  const rawProfiles = v.profiles
  if (!rawProfiles || typeof rawProfiles !== 'object') return null

  const taken = new Set<string>()
  const profiles: Record<string, ProfileStats> = {}
  // Maps an old name key to the id it was assigned, so activeProfile (a name)
  // can be resolved to activeProfileId.
  const nameToId: Record<string, string> = {}

  for (const [key, value] of Object.entries(rawProfiles as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const p = value as Record<string, unknown>
    if (!Array.isArray(p.completions) || !Array.isArray(p.sessions)) continue
    let id = typeof p.id === 'string' && p.id ? p.id : ''
    if (!id || taken.has(id)) id = generateProfileId(taken)
    taken.add(id)
    const name = typeof p.name === 'string' ? p.name : key
    profiles[id] = {
      id,
      name,
      friend: typeof p.friend === 'boolean' ? p.friend : false,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      completions: p.completions as CompletionRecord[],
      sessions: p.sessions as ProfileStats['sessions'],
    }
    nameToId[key] = id
  }

  if (Object.keys(profiles).length === 0) return emptyFile()

  let activeProfileId = ''
  if (typeof v.activeProfileId === 'string' && profiles[v.activeProfileId]) {
    activeProfileId = v.activeProfileId
  } else if (typeof v.activeProfile === 'string' && nameToId[v.activeProfile]) {
    activeProfileId = nameToId[v.activeProfile]
  }
  // Active must be one of your own players, never a friend.
  if (!activeProfileId || profiles[activeProfileId].friend) {
    const firstPlayer = Object.values(profiles).find(p => !p.friend)
    if (firstPlayer) {
      activeProfileId = firstPlayer.id
    } else {
      const def = createEmptyProfile(DEFAULT_PROFILE_NAME, generateProfileId(taken))
      profiles[def.id] = def
      activeProfileId = def.id
    }
  }

  return { version: FILE_VERSION, activeProfileId, profiles }
}

export function loadStatsFile(): StatsFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyFile()
    return normalize(JSON.parse(raw)) ?? emptyFile()
  } catch {
    return emptyFile()
  }
}

export function saveStatsFile(file: StatsFile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch {
    // Storage full or unavailable (private browsing, etc). Stats simply
    // stop persisting for this session; nothing to recover from here.
  }
}

// Creates a new player (friend = false) with a fresh id and makes it active.
export function createPlayer(file: StatsFile, name: string): StatsFile {
  const trimmed = name.trim() || DEFAULT_PROFILE_NAME
  const id = generateProfileId(takenIds(file))
  const profiles = { ...file.profiles, [id]: createEmptyProfile(trimmed, id) }
  return { ...file, profiles, activeProfileId: id }
}

// Makes an existing profile the active one. Only players can be active, so a
// friend is flipped to a player first.
export function selectProfile(file: StatsFile, id: string): StatsFile {
  const prof = file.profiles[id]
  if (!prof) return file
  const profiles = prof.friend ? { ...file.profiles, [id]: { ...prof, friend: false } } : file.profiles
  return { ...file, profiles, activeProfileId: id }
}

// Renames any profile by id, keeping its stats. Names may repeat: the id is
// the key, so this only changes the display name.
export function renameProfile(file: StatsFile, id: string, newName: string): StatsFile {
  const trimmed = newName.trim()
  const prof = file.profiles[id]
  if (!trimmed || !prof || prof.name === trimmed) return file
  return { ...file, profiles: { ...file.profiles, [id]: { ...prof, name: trimmed } } }
}

// Moves a profile between your players and your friends. Moving the active
// player to friends hands active to another player (or a fresh default).
export function setProfileFriend(file: StatsFile, id: string, friend: boolean): StatsFile {
  const prof = file.profiles[id]
  if (!prof || prof.friend === friend) return file
  const profiles = { ...file.profiles, [id]: { ...prof, friend } }
  let activeProfileId = file.activeProfileId
  if (friend && activeProfileId === id) {
    const nextPlayer = Object.values(profiles).find(p => !p.friend)
    if (nextPlayer) {
      activeProfileId = nextPlayer.id
    } else {
      const def = createEmptyProfile(DEFAULT_PROFILE_NAME, generateProfileId(new Set(Object.keys(profiles))))
      profiles[def.id] = def
      activeProfileId = def.id
    }
  }
  return { ...file, profiles, activeProfileId }
}

export function deleteProfile(file: StatsFile, id: string): StatsFile {
  if (!file.profiles[id]) return file
  const profiles = { ...file.profiles }
  delete profiles[id]
  if (Object.keys(profiles).length === 0) return emptyFile()
  let activeProfileId = file.activeProfileId
  if (activeProfileId === id) {
    const nextPlayer = Object.values(profiles).find(p => !p.friend) ?? Object.values(profiles)[0]
    if (nextPlayer && !nextPlayer.friend) {
      activeProfileId = nextPlayer.id
    } else {
      const def = createEmptyProfile(DEFAULT_PROFILE_NAME, generateProfileId(new Set(Object.keys(profiles))))
      profiles[def.id] = def
      activeProfileId = def.id
    }
  }
  return { ...file, profiles, activeProfileId }
}

// Records a shared multiplayer completion against a co-player, by id. Creates a
// friend entry if that id is not known yet, and keeps the stored name current.
export function upsertCoPlayerCompletion(
  file: StatsFile,
  coPlayer: { id: string; name: string },
  completion: CompletionRecord,
): StatsFile {
  if (!coPlayer.id) return file
  const existing = file.profiles[coPlayer.id]
  const base = existing ?? createEmptyProfile(coPlayer.name || 'Player', coPlayer.id, true)
  const updated: ProfileStats = {
    ...base,
    name: coPlayer.name || base.name,
    completions: [...base.completions, completion],
  }
  return { ...file, profiles: { ...file.profiles, [coPlayer.id]: updated } }
}

export function exportStatsFile(file: StatsFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `zenpiece-stats-${date}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function importStatsFile(file: File): Promise<StatsFile> {
  return file.text().then(text => {
    const normalized = normalize(JSON.parse(text))
    if (!normalized) {
      throw new Error('That file does not look like a ZenPiece stats export.')
    }
    return normalized
  })
}
