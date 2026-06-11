import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type KonvaType from 'konva'
import type { PieceData } from '../pieces'

/**
 * Debug only. Press X to snap 10% of total pieces into place (based on total
 * piece count, not remaining). The hook is always called (satisfying React's
 * rules) but the listener is a no-op in production builds. Vite replaces
 * import.meta.env.DEV with false and Rollup removes the dead code entirely.
 */
export function useDebugSolve(
  setPieces: React.Dispatch<React.SetStateAction<PieceData[]>>,
  pieceSizeRef: MutableRefObject<{ pw: number; ph: number; padding: number }>,
  layoutOriginRef: MutableRefObject<{ x: number; y: number }>,
  nodeRefs: MutableRefObject<Record<string, KonvaType.Image>>,
  setSolved: React.Dispatch<React.SetStateAction<boolean>>,
  setFireworksDark: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    if (!import.meta.env.DEV) return

    function handleKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'x') return
      const { pw, ph, padding } = pieceSizeRef.current
      const { x: ox, y: oy } = layoutOriginRef.current

      setPieces(prev => {
        const unlocked = prev.filter(p => !p.locked)
        if (unlocked.length === 0) return prev
        const count = Math.max(1, Math.round(prev.length * 0.10))
        const toPlace = new Set(unlocked.slice(0, count).map(p => p.id))
        const next = prev.map(p => {
          if (!toPlace.has(p.id)) return p
          const cx = ox + p.col * pw - padding
          const cy = oy + p.row * ph - padding
          const node = nodeRefs.current[p.id]
          if (node) { node.x(cx); node.y(cy) }
          return { ...p, x: cx, y: cy, locked: true }
        })
        if (next.every(p => p.locked)) { setSolved(true); setFireworksDark(true) }
        return next
      })
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
}
