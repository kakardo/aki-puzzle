import { useCallback, useEffect, useRef, useState } from 'react'
import type { StatsFile, ProfileStats, SessionRecord, CompletionRecord, PuzzleMode, StatsHooks } from './types'
import {
  loadStatsFile, saveStatsFile,
  createPlayer as createPlayerInFile, selectProfile as selectProfileInFile,
  renameProfile as renameProfileInFile, deleteProfile as deleteProfileInFile,
  setProfileFriend, upsertCoPlayerCompletion,
  exportStatsFile, importStatsFile, STORAGE_KEY,
} from './storage'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface ProfileSummary {
  id: string
  name: string
  friend: boolean
  sessions: number
  completions: number
  createdAt: number | null
}

export interface StatsApi extends StatsHooks {
  profileId: string
  profileName: string
  profile: ProfileStats
  profiles: ProfileSummary[]
  setProfileName(name: string): void
  selectProfile(id: string): void
  createPlayer(name: string): void
  renameProfile(id: string, name: string): void
  deleteProfile(id: string): void
  setFriend(id: string, friend: boolean): void
  exportFile(): void
  importFile(file: File): Promise<void>
}

export function useStats(): StatsApi {
  const [file, setFile] = useState<StatsFile>(() => loadStatsFile())
  const fileRef = useRef(file)
  fileRef.current = file

  // Another tab on the same site (a second player joining on this computer)
  // may add or change profiles. Pick those up live, keeping this tab's own
  // active player if it still exists.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && e.key !== STORAGE_KEY) return
      const reloaded = loadStatsFile()
      const keep = fileRef.current.activeProfileId
      const activeProfileId = reloaded.profiles[keep] && !reloaded.profiles[keep].friend
        ? keep : reloaded.activeProfileId
      const next = { ...reloaded, activeProfileId }
      fileRef.current = next
      setFile(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Persist the loaded (and possibly migrated) file once, so localStorage is
  // always in the current id-keyed format for other readers.
  useEffect(() => { saveStatsFile(fileRef.current) }, [])

  const persist = useCallback((next: StatsFile) => {
    fileRef.current = next
    setFile(next)
    saveStatsFile(next)
  }, [])

  // Every mutation of the active profile goes through here, keyed by its id.
  const updateProfile = useCallback((mutate: (p: ProfileStats) => ProfileStats) => {
    const current = fileRef.current
    const id = current.activeProfileId
    const existing = current.profiles[id]
    if (!existing) return
    persist({ ...current, profiles: { ...current.profiles, [id]: mutate(existing) } })
  }, [persist])

  const setProfileName = useCallback((name: string) => {
    const id = fileRef.current.activeProfileId
    persist(renameProfileInFile(fileRef.current, id, name))
  }, [persist])

  const selectProfile = useCallback((id: string) => {
    persist(selectProfileInFile(fileRef.current, id))
  }, [persist])

  const createPlayer = useCallback((name: string) => {
    persist(createPlayerInFile(fileRef.current, name))
  }, [persist])

  const renameProfile = useCallback((id: string, name: string) => {
    persist(renameProfileInFile(fileRef.current, id, name))
  }, [persist])

  const deleteProfile = useCallback((id: string) => {
    persist(deleteProfileInFile(fileRef.current, id))
  }, [persist])

  const setFriend = useCallback((id: string, friend: boolean) => {
    persist(setProfileFriend(fileRef.current, id, friend))
  }, [persist])

  const startSession = useCallback((pieceCount: number, cols: number, rows: number, mode: PuzzleMode): string => {
    const id = newId()
    const record: SessionRecord = {
      id,
      startedAt: Date.now(),
      endedAt: null,
      pieceCount,
      cols,
      rows,
      mode,
      piecesPlaced: 0,
      pickupsNotPlaced: 0,
      completed: false,
    }
    updateProfile(p => ({ ...p, sessions: [...p.sessions, record] }))
    return id
  }, [updateProfile])

  const onPiecesPlaced = useCallback((sessionId: string, count: number) => {
    if (count <= 0) return
    updateProfile(p => ({
      ...p,
      sessions: p.sessions.map(s => s.id === sessionId ? { ...s, piecesPlaced: s.piecesPlaced + count } : s),
    }))
  }, [updateProfile])

  const onPickupNotPlaced = useCallback((sessionId: string) => {
    updateProfile(p => ({
      ...p,
      sessions: p.sessions.map(s => s.id === sessionId ? { ...s, pickupsNotPlaced: s.pickupsNotPlaced + 1 } : s),
    }))
  }, [updateProfile])

  // On completing a shared puzzle, record it for the active player and, by id,
  // against every co-player too (creating a friend entry if new), so the same
  // game shows up on each participant's machine.
  const completeSession = useCallback((sessionId: string, chainMergeMax: number, coPlayers: { id: string; name: string }[]) => {
    const current = fileRef.current
    const activeId = current.activeProfileId
    const active = current.profiles[activeId]
    if (!active) return
    const session = active.sessions.find(s => s.id === sessionId)
    if (!session || session.completed) return
    const endedAt = Date.now()
    const completion: CompletionRecord = {
      id: newId(),
      date: endedAt,
      pieceCount: session.pieceCount,
      cols: session.cols,
      rows: session.rows,
      timeMs: endedAt - session.startedAt,
      mode: session.mode,
      piecesPlacedBySelf: session.piecesPlaced,
      chainMergeMax,
      coPlayers: coPlayers.map(c => c.name),
    }

    let next: StatsFile = {
      ...current,
      profiles: {
        ...current.profiles,
        [activeId]: {
          ...active,
          sessions: active.sessions.map(s => s.id === sessionId ? { ...s, endedAt, completed: true } : s),
          completions: [...active.completions, completion],
        },
      },
    }

    for (const cp of coPlayers) {
      if (!cp.id || cp.id === activeId) continue
      const theirCoPlayers = [active.name, ...coPlayers.filter(o => o.id !== cp.id).map(o => o.name)]
      const friendCompletion: CompletionRecord = { ...completion, id: newId(), piecesPlacedBySelf: 0, coPlayers: theirCoPlayers }
      next = upsertCoPlayerCompletion(next, cp, friendCompletion)
    }

    persist(next)
  }, [persist])

  const abandonSession = useCallback((sessionId: string) => {
    updateProfile(p => {
      const session = p.sessions.find(s => s.id === sessionId)
      if (!session || session.completed || session.endedAt !== null) return p
      return {
        ...p,
        sessions: p.sessions.map(s => s.id === sessionId ? { ...s, endedAt: Date.now() } : s),
      }
    })
  }, [updateProfile])

  const exportFile = useCallback(() => {
    exportStatsFile(fileRef.current)
  }, [])

  const importFile = useCallback(async (blob: File) => {
    const imported = await importStatsFile(blob)
    persist(imported)
  }, [persist])

  const profileId = file.activeProfileId
  const profile = file.profiles[profileId]
  const profiles: ProfileSummary[] = Object.values(file.profiles).map(p => {
    const times = [...p.sessions.map(s => s.startedAt), ...p.completions.map(c => c.date)]
    const createdAt = p.createdAt ?? (times.length ? Math.min(...times) : null)
    return { id: p.id, name: p.name, friend: p.friend, sessions: p.sessions.length, completions: p.completions.length, createdAt }
  })

  return {
    profileId,
    profileName: profile.name,
    profile,
    profiles,
    setProfileName,
    selectProfile,
    createPlayer,
    renameProfile,
    deleteProfile,
    setFriend,
    startSession,
    onPiecesPlaced,
    onPickupNotPlaced,
    completeSession,
    abandonSession,
    exportFile,
    importFile,
  }
}
