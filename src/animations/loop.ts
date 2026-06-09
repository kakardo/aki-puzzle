import { useEffect } from 'react'

/**
 * Runs a requestAnimationFrame loop and passes a delta-time scalar to the
 * callback each frame. dt is 1.0 at 60fps, 0.5 at 120fps, etc., so physics
 * values written for 60fps stay correct at any refresh rate.
 *
 * The loop stops automatically when the component unmounts.
 */
export function useAnimationLoop(
  callback: (dt: number) => boolean | void,
  deps: unknown[] = []
) {
  useEffect(() => {
    let frameId: number
    let last: number | null = null
    let running = true

    function loop(now: number) {
      const dt = last === null ? 1 : (now - last) / 16.667
      last = now
      const keepGoing = callback(dt)
      if (running && keepGoing !== false) {
        frameId = requestAnimationFrame(loop)
      }
    }

    frameId = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(frameId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
