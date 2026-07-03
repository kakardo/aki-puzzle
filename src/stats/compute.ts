import type { CompletionRecord, SessionRecord } from './types'

export interface CompletionSummary {
  count: number
  totalPieces: number
  avgPieces: number
  avgTimeMs: number
}

function summarize(completions: CompletionRecord[]): CompletionSummary {
  const count = completions.length
  if (count === 0) return { count: 0, totalPieces: 0, avgPieces: 0, avgTimeMs: 0 }
  const totalPieces = completions.reduce((sum, c) => sum + c.pieceCount, 0)
  const totalTimeMs = completions.reduce((sum, c) => sum + c.timeMs, 0)
  return {
    count,
    totalPieces,
    avgPieces: totalPieces / count,
    avgTimeMs: totalTimeMs / count,
  }
}

// Section 1: the overall summary, plus the same summary recomputed over
// just the hardest N completions (by piece count). "Hardest" and "top" are
// the same ranking here: biggest puzzles first.
export interface Section1Stats {
  overall: CompletionSummary
  top100: CompletionSummary
  top50: CompletionSummary
  top25: CompletionSummary
  top10: CompletionSummary
  top5: CompletionSummary
  lastCompleted: CompletionRecord[]
}

export function computeSection1(completions: CompletionRecord[], lastN: number): Section1Stats {
  const byHardest = [...completions].sort((a, b) => b.pieceCount - a.pieceCount)
  const byRecent = [...completions].sort((a, b) => b.date - a.date)
  return {
    overall: summarize(completions),
    top100: summarize(byHardest.slice(0, 100)),
    top50: summarize(byHardest.slice(0, 50)),
    top25: summarize(byHardest.slice(0, 25)),
    top10: summarize(byHardest.slice(0, 10)),
    top5: summarize(byHardest.slice(0, 5)),
    lastCompleted: byRecent.slice(0, Math.max(0, lastN)),
  }
}

// Section 2: totals across every attempt, completed or abandoned.
export interface Section2Stats {
  totalPiecesPlaced: number
  totalPickupsNotPlaced: number
  totalPlaytimeMs: number
  totalSessions: number
  longestSittingMs: number
  mostPiecesInOneSitting: number
}

export function computeSection2(sessions: SessionRecord[]): Section2Stats {
  let totalPiecesPlaced = 0
  let totalPickupsNotPlaced = 0
  let totalPlaytimeMs = 0
  let longestSittingMs = 0
  let mostPiecesInOneSitting = 0

  for (const s of sessions) {
    totalPiecesPlaced += s.piecesPlaced
    totalPickupsNotPlaced += s.pickupsNotPlaced
    const duration = (s.endedAt ?? s.startedAt) - s.startedAt
    totalPlaytimeMs += duration
    if (duration > longestSittingMs) longestSittingMs = duration
    if (s.piecesPlaced > mostPiecesInOneSitting) mostPiecesInOneSitting = s.piecesPlaced
  }

  return {
    totalPiecesPlaced,
    totalPickupsNotPlaced,
    totalPlaytimeMs,
    totalSessions: sessions.length,
    longestSittingMs,
    mostPiecesInOneSitting,
  }
}

export interface Records {
  fastestTimeMs: number | null
  largestPuzzle: number | null
  largestChainMerge: number | null
  fastestMultiplayerTimeMs: number | null
  largestMultiplayerPuzzle: number | null
  mostFrequentPartner: { name: string; count: number } | null
  uniquePartnerCount: number
}

export function computeRecords(completions: CompletionRecord[]): Records {
  if (completions.length === 0) {
    return {
      fastestTimeMs: null,
      largestPuzzle: null,
      largestChainMerge: null,
      fastestMultiplayerTimeMs: null,
      largestMultiplayerPuzzle: null,
      mostFrequentPartner: null,
      uniquePartnerCount: 0,
    }
  }

  const multiplayer = completions.filter(c => c.mode === 'multiplayer')
  const partnerCounts = new Map<string, number>()
  for (const c of multiplayer) {
    for (const name of c.coPlayers) {
      partnerCounts.set(name, (partnerCounts.get(name) ?? 0) + 1)
    }
  }
  let mostFrequentPartner: { name: string; count: number } | null = null
  for (const [name, count] of partnerCounts) {
    if (!mostFrequentPartner || count > mostFrequentPartner.count) mostFrequentPartner = { name, count }
  }

  return {
    fastestTimeMs: Math.min(...completions.map(c => c.timeMs)),
    largestPuzzle: Math.max(...completions.map(c => c.pieceCount)),
    largestChainMerge: Math.max(...completions.map(c => c.chainMergeMax)),
    fastestMultiplayerTimeMs: multiplayer.length > 0 ? Math.min(...multiplayer.map(c => c.timeMs)) : null,
    largestMultiplayerPuzzle: multiplayer.length > 0 ? Math.max(...multiplayer.map(c => c.pieceCount)) : null,
    mostFrequentPartner,
    uniquePartnerCount: partnerCounts.size,
  }
}
