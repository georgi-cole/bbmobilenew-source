import { useCallback, useEffect, useRef } from 'react'

export interface PresentationCue {
  atMs: number
  run: () => void
}

/** A finite decorative timeline; suspension preserves elapsed time and fired cues. */
export function usePresentationTimeline(
  active: boolean,
  cues: readonly PresentationCue[],
  sequenceKey: string | number = 'default'
): () => void {
  const elapsedRef = useRef(0)
  const firedRef = useRef(new Set<number>())
  const timersRef = useRef<number[]>([])
  const cancelledRef = useRef(false)
  const cancel = useCallback(() => {
    cancelledRef.current = true
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }, [])

  useEffect(() => {
    elapsedRef.current = 0
    firedRef.current.clear()
    cancelledRef.current = false
  }, [sequenceKey])

  useEffect(() => {
    if (!active || cancelledRef.current) return undefined
    const startedAt = performance.now()
    let disposed = false
    timersRef.current = cues.flatMap((cue, index) => {
      if (firedRef.current.has(index)) return []
      return [
        window.setTimeout(
          () => {
            if (disposed || cancelledRef.current) return
            firedRef.current.add(index)
            cue.run()
          },
          Math.max(0, cue.atMs - elapsedRef.current)
        ),
      ]
    })
    return () => {
      disposed = true
      elapsedRef.current += Math.max(0, performance.now() - startedAt)
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current = []
    }
  }, [active, cues, sequenceKey])

  return cancel
}
