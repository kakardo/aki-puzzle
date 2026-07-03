// Stats are stored as two raw logs, never as running totals. Every summary,
// record, or top-N list in compute.ts is derived from these on read. That
// keeps the write side trivial (append one record) and makes it impossible
// for a precomputed average or a running max to drift out of sync with the
// underlying data.

export type PuzzleMode = 'solo' | 'multiplayer'

// One entry per puzzle that reached "all pieces locked". Both solo and
// multiplayer completions land here, tagged by mode, so the section 1
// summaries naturally cover both while the multiplayer-only records can
// filter on mode.
export interface CompletionRecord {
  id: string
  date: number
  pieceCount: number
  cols: number
  rows: number
  timeMs: number
  mode: PuzzleMode
  piecesPlacedBySelf: number
  chainMergeMax: number
  // Names of the other players present when this puzzle solved. Empty for
  // solo. Names, not player ids, since ids are new every reconnect.
  coPlayers: string[]
}

// One entry per puzzle attempt, win or not. This is what section 2 (totals
// across everything, completed or abandoned) is built from.
export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number | null
  pieceCount: number
  cols: number
  rows: number
  mode: PuzzleMode
  piecesPlaced: number
  pickupsNotPlaced: number
  completed: boolean
}

export interface ProfileStats {
  name: string
  createdAt: number
  completions: CompletionRecord[]
  sessions: SessionRecord[]
}

export interface StatsFile {
  version: number
  activeProfile: string
  profiles: Record<string, ProfileStats>
}

// The slice of the stats API that PuzzleBoard needs. Kept separate from the
// full useStats() return type so PuzzleBoard only depends on this shape,
// not on profile management or import/export.
export interface StatsHooks {
  startSession(pieceCount: number, cols: number, rows: number, mode: PuzzleMode): string
  onPiecesPlaced(sessionId: string, count: number): void
  onPickupNotPlaced(sessionId: string): void
  completeSession(sessionId: string, chainMergeMax: number, coPlayers: string[]): void
  abandonSession(sessionId: string): void
}

export function createEmptyProfile(name: string): ProfileStats {
  return {
    name,
    createdAt: Date.now(),
    completions: [],
    sessions: [],
  }
}
