import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type KonvaType from 'konva'
import type { PieceData } from '../pieces'

export type DebugActions = {
  completeAll: () => void
  leaveOne: () => void
}

/**
 * Debug only. Populates actionsRef with completeAll and leaveOne so an external
 * UI can trigger them. Always a no-op in production builds.
 */
export function useDebugActions(
  setPieces: React.Dispatch<React.SetStateAction<PieceData[]>>,
  setGroups: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  pieceSizeRef: MutableRefObject<{ pw: number; ph: number; padding: number }>,
  layoutOriginRef: MutableRefObject<{ x: number; y: number }>,
  nodeRefs: MutableRefObject<Record<string, KonvaType.Image>>,
  onSolved: (lastPlaced: PieceData) => void,
  actionsRef: MutableRefObject<DebugActions | null> | undefined
) {
  const onSolvedRef = useRef(onSolved)
  onSolvedRef.current = onSolved

  useEffect(() => {
    if (!import.meta.env.DEV || !actionsRef) return

    actionsRef.current = {
      completeAll() {
        const { pw, ph, padding } = pieceSizeRef.current
        const { x: ox, y: oy } = layoutOriginRef.current
        setPieces(prev => {
          const unlocked = prev.filter(p => !p.locked)
          if (unlocked.length === 0) return prev
          const lastId = unlocked[Math.floor(Math.random() * unlocked.length)].id
          const next = prev.map(p => {
            if (p.locked) return p
            const cx = ox + p.col * pw - padding
            const cy = oy + p.row * ph - padding
            const node = nodeRefs.current[p.id]
            if (node) { node.x(cx); node.y(cy) }
            return { ...p, x: cx, y: cy, locked: true }
          })
          const lastPlaced = next.find(p => p.id === lastId)!
          onSolvedRef.current(lastPlaced)
          return next
        })
      },
      leaveOne() {
        const { pw, ph, padding } = pieceSizeRef.current
        const { x: ox, y: oy } = layoutOriginRef.current
        setPieces(prev => {
          if (prev.length === 0) return prev
          // Pick one piece to leave from the full set, works on any board state
          const leaveIdx = Math.floor(Math.random() * prev.length)
          const leaveId = prev[leaveIdx].id
          // Park the leave piece just above the puzzle so it is clearly visible
          const scatterX = ox + 20
          const scatterY = oy - ph - padding * 2 - 20
          return prev.map(p => {
            if (p.id === leaveId) {
              const node = nodeRefs.current[p.id]
              if (node) { node.x(scatterX); node.y(scatterY) }
              return { ...p, x: scatterX, y: scatterY, locked: false }
            }
            const cx = ox + p.col * pw - padding
            const cy = oy + p.row * ph - padding
            const node = nodeRefs.current[p.id]
            if (node) { node.x(cx); node.y(cy) }
            return { ...p, x: cx, y: cy, locked: true }
          })
        })
        // Clear all groups so the leftover piece cannot drag locked pieces with it
        setGroups({})
      },
    }

    return () => { actionsRef.current = null }
  }, []) // all captured values are stable refs or stable setters
}
