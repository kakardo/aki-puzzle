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
  // Stable short id (4 chars, base62). The real key for everything: names may
  // repeat or change, the id does not. Shared between machines in multiplayer.
  id: string
  name: string
  // false = one of your own players; true = someone you have played with.
  friend: boolean
  createdAt: number
  completions: CompletionRecord[]
  sessions: SessionRecord[]
}

export interface StatsFile {
  version: number
  activeProfileId: string
  // Keyed by profile id.
  profiles: Record<string, ProfileStats>
}

// The slice of the stats API that PuzzleBoard needs. Kept separate from the
// full useStats() return type so PuzzleBoard only depends on this shape,
// not on profile management or import/export.
export interface StatsHooks {
  startSession(pieceCount: number, cols: number, rows: number, mode: PuzzleMode): string
  onPiecesPlaced(sessionId: string, count: number): void
  onPickupNotPlaced(sessionId: string): void
  completeSession(sessionId: string, chainMergeMax: number, coPlayers: { id: string; name: string }[]): void
  abandonSession(sessionId: string): void
}

// Short, human-shareable id: 4 chars of digits and letters (base62).
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function generateProfileId(taken: Set<string> = new Set()): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let id = ''
    for (let i = 0; i < 4; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
    if (!taken.has(id)) return id
  }
  // Extremely unlikely fallback: extend length rather than loop forever.
  return `${Date.now().toString(36).slice(-4)}`
}

export function createEmptyProfile(name: string, id: string, friend = false): ProfileStats {
  return {
    id,
    name,
    friend,
    createdAt: Date.now(),
    completions: [],
    sessions: [],
  }
}
