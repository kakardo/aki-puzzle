import { useCallback, useRef, useState } from 'react'
import type { StatsFile, ProfileStats, SessionRecord, CompletionRecord, PuzzleMode, StatsHooks } from './types'
import {
  loadStatsFile, saveStatsFile, ensureProfile, switchActiveProfile,
  exportStatsFile, importStatsFile,
} from './storage'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface StatsApi extends StatsHooks {
  profileName: string
  profile: ProfileStats
  setProfileName(name: string): void
  exportFile(): void
  importFile(file: File): Promise<void>
}

export function useStats(): StatsApi {
  const [file, setFile] = useState<StatsFile>(() => loadStatsFile())
  const fileRef = useRef(file)
  fileRef.current = file

  const persist = useCallback((next: StatsFile) => {
    fileRef.current = next
    setFile(next)
    saveStatsFile(next)
  }, [])

  // Every mutation goes through here so there is exactly one place that
  // keeps the file -> profiles -> profile nesting immutable.
  const updateProfile = useCallback((mutate: (p: ProfileStats) => ProfileStats) => {
    const current = fileRef.current
    const name = current.activeProfile
    const existing = current.profiles[name] ?? ensureProfile(current, name)
    const updated = mutate(existing)
    persist({ ...current, profiles: { ...current.profiles, [name]: updated } })
  }, [persist])

  const setProfileName = useCallback((name: string) => {
    persist(switchActiveProfile({ ...fileRef.current, profiles: { ...fileRef.current.profiles } }, name))
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

  const completeSession = useCallback((sessionId: string, chainMergeMax: number, coPlayers: string[]) => {
    updateProfile(p => {
      const session = p.sessions.find(s => s.id === sessionId)
      if (!session || session.completed) return p
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
        coPlayers,
      }
      return {
        ...p,
        sessions: p.sessions.map(s => s.id === sessionId ? { ...s, endedAt, completed: true } : s),
        completions: [...p.completions, completion],
      }
    })
  }, [updateProfile])

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

  const profileName = file.activeProfile
  const profile = file.profiles[profileName] ?? ensureProfile(file, profileName)

  return {
    profileName,
    profile,
    setProfileName,
    startSession,
    onPiecesPlaced,
    onPickupNotPlaced,
    completeSession,
    abandonSession,
    exportFile,
    importFile,
  }
}
