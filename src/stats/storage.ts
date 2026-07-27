import type { StatsFile, ProfileStats } from './types'
import { createEmptyProfile } from './types'

const STORAGE_KEY = 'zenpiece-stats'
const FILE_VERSION = 1
const DEFAULT_PROFILE_NAME = 'Player'

function emptyFile(): StatsFile {
  const name = DEFAULT_PROFILE_NAME
  return {
    version: FILE_VERSION,
    activeProfile: name,
    profiles: { [name]: createEmptyProfile(name) },
  }
}

// Defensive shape check. A hand-edited or corrupted import should fall back
// to an empty file rather than throw partway through rendering the stats
// screen.
function isValidStatsFile(value: unknown): value is StatsFile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.activeProfile !== 'string') return false
  if (!v.profiles || typeof v.profiles !== 'object') return false
  return Object.values(v.profiles as Record<string, unknown>).every(p => {
    if (!p || typeof p !== 'object') return false
    const profile = p as Record<string, unknown>
    return typeof profile.name === 'string' && Array.isArray(profile.completions) && Array.isArray(profile.sessions)
  })
}

export function loadStatsFile(): StatsFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyFile()
    const parsed = JSON.parse(raw)
    if (!isValidStatsFile(parsed)) return emptyFile()
    return parsed
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

// Returns a profile for the given name, creating an empty one in the file
// if it does not exist yet. Does not switch the active profile.
export function ensureProfile(file: StatsFile, name: string): ProfileStats {
  if (!file.profiles[name]) {
    file.profiles[name] = createEmptyProfile(name)
  }
  return file.profiles[name]
}

export function switchActiveProfile(file: StatsFile, name: string): StatsFile {
  const trimmed = name.trim() || DEFAULT_PROFILE_NAME
  ensureProfile(file, trimmed)
  return { ...file, activeProfile: trimmed }
}

// Renames the active profile in place, carrying its stats to the new name. If
// the new name already belongs to another profile, switches to that one
// instead (rather than overwriting it), so no stats are ever lost.
export function renameActiveProfile(file: StatsFile, name: string): StatsFile {
  const trimmed = name.trim() || DEFAULT_PROFILE_NAME
  const current = file.activeProfile
  if (trimmed === current) return file
  const profiles = { ...file.profiles }
  if (profiles[trimmed]) {
    return { ...file, activeProfile: trimmed }
  }
  const prof = profiles[current] ?? createEmptyProfile(current)
  delete profiles[current]
  profiles[trimmed] = { ...prof, name: trimmed }
  return { ...file, activeProfile: trimmed, profiles }
}

// Renames any profile by name (not only the active one), keeping its stats. A
// no-op if the new name is blank, unchanged, or already taken.
export function renameProfile(file: StatsFile, oldName: string, newName: string): StatsFile {
  const trimmed = newName.trim()
  if (!trimmed || trimmed === oldName) return file
  if (!file.profiles[oldName] || file.profiles[trimmed]) return file
  const profiles = { ...file.profiles }
  const prof = profiles[oldName]
  delete profiles[oldName]
  profiles[trimmed] = { ...prof, name: trimmed }
  const activeProfile = file.activeProfile === oldName ? trimmed : file.activeProfile
  return { ...file, profiles, activeProfile }
}

// Deletes a profile. If it was the active one, the first remaining profile
// becomes active. Deleting the last profile leaves a fresh default in place.
export function deleteProfile(file: StatsFile, name: string): StatsFile {
  if (!file.profiles[name]) return file
  const profiles = { ...file.profiles }
  delete profiles[name]
  const remaining = Object.keys(profiles)
  if (remaining.length === 0) {
    return {
      ...file,
      profiles: { [DEFAULT_PROFILE_NAME]: createEmptyProfile(DEFAULT_PROFILE_NAME) },
      activeProfile: DEFAULT_PROFILE_NAME,
    }
  }
  const activeProfile = file.activeProfile === name ? remaining[0] : file.activeProfile
  return { ...file, profiles, activeProfile }
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
    const parsed = JSON.parse(text)
    if (!isValidStatsFile(parsed)) {
      throw new Error('That file does not look like a ZenPiece stats export.')
    }
    return parsed
  })
}
