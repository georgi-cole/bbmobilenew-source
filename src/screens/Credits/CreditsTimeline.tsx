import { useEffect, useState, type RefObject } from 'react'
import { CINEMATIC_CONFIG, type CreditCard } from '../../cinematic/config/cinematicConfig'
import { CreditsOverlay } from '../../cinematic/credits/CreditsOverlay'
import { getCreditsSoundtrackTime } from '../../cinematic/audio/creditsSoundtrack'
import { getTimelineState } from '../../cinematic/timeline/timeline'

const DURATION_SECONDS = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps
const frameAt = (seconds: number) =>
  Math.min(CINEMATIC_CONFIG.durationInFrames - 1, Math.round(seconds * CINEMATIC_CONFIG.fps))

/** Only the editable text rerenders with the clock; media and controls stay settled. */
export default function CreditsTimeline({
  videoRef,
  elapsedRef,
  running,
  playing,
  fallback,
  credits,
  onEnd,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  elapsedRef: RefObject<number>
  running: boolean
  playing: boolean
  fallback: boolean
  credits: readonly CreditCard[]
  onEnd: (instantBlackout: boolean) => void
}) {
  const [frame, setFrame] = useState(() => frameAt(getCreditsSoundtrackTime()))

  useEffect(() => {
    if (!running || (!fallback && !playing)) return undefined
    let animationFrame = 0
    const startedAt = performance.now()
    const initialElapsed = elapsedRef.current
    const tick = (now: number) => {
      const video = videoRef.current
      if (!fallback && (!video || video.paused || video.ended)) return
      const elapsed = Math.min(
        DURATION_SECONDS,
        Math.max(
          0,
          fallback ? initialElapsed + (now - startedAt) / 1000 : (video?.currentTime ?? 0)
        )
      )
      elapsedRef.current = elapsed
      setFrame(frameAt(elapsed))
      if (fallback && elapsed >= DURATION_SECONDS) onEnd(true)
      else animationFrame = window.requestAnimationFrame(tick)
    }
    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [elapsedRef, fallback, onEnd, playing, running, videoRef])

  return <CreditsOverlay frame={frame} state={getTimelineState(frame)} credits={credits} />
}
