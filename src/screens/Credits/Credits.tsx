import { useCallback, useEffect, useRef, useState } from 'react'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { useNavigate } from 'react-router'
import { isCreditsVideoEnabled } from '../../config/featureFlags'
import {
  fadeOutCreditsSoundtrack,
  getCreditsSoundtrackTime,
  isCreditsSoundtrackPlaying,
  pauseCreditsSoundtrack,
  startCreditsSoundtrackFromGesture,
  stopCreditsSoundtrack,
  syncCreditsSoundtrackToTime,
} from '../../cinematic/audio/creditsSoundtrack'
import { CinematicVideo } from '../../cinematic/media/CinematicVideo'
import {
  CINEMATIC_VIDEO_ASSETS,
  releaseCinematicVideoElement,
} from '../../cinematic/media/cinematicMedia'
import '../../cinematic/components/cinematic.css'
import {
  CINEMATIC_CONFIG,
  CINEMATIC_CREDITS,
  type CreditCard,
} from '../../cinematic/config/cinematicConfig'
import {
  loadCreditsContent,
  type CreditsContentLoadResult,
} from '../../cinematic/credits/creditsContent'
import CreditsTimeline from './CreditsTimeline'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { CREDITS_POSTER_SOURCES } from './creditsAssetPaths'
import CreditsFallback from './CreditsFallback'
import './Credits.css'

const EXIT_FADE_MS = 420
// Bound video startup and stalls so Credits always has a timely live fallback.
// Non-autoplay embeds keep the poster and never attach or decode the video.
const VIDEO_READY_TIMEOUT_MS = 1_800
const VIDEO_STALL_TIMEOUT_MS = 1_800
const DURATION_SECONDS = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps

type CreditsProps = {
  /** Starts playback as soon as the credits mount after the finale. */
  autoPlay?: boolean
  /** Called after an embedded credits run finishes or is skipped. */
  onComplete?: () => void
}

export default function Credits({ autoPlay = true, onComplete }: CreditsProps) {
  const reducedMotion = usePresentationReducedMotion()
  const useVideo = isCreditsVideoEnabled() && !reducedMotion
  const navigate = useNavigate()
  const presentationGroup = onComplete ? 'season-finale' : 'credits'
  const presentationPriority = onComplete
    ? PRESENTATION_PRIORITY.finale
    : PRESENTATION_PRIORITY.credits
  const { isOwner } = usePresentationOwner(presentationGroup, presentationPriority)
  const exitTimeoutRef = useRef<number | null>(null)
  const videoReadyTimeoutRef = useRef<number | null>(null)
  const videoStallTimeoutRef = useRef<number | null>(null)
  const videoFailureHandledRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const exitStartedRef = useRef(false)
  const exitDeliveredRef = useRef(false)
  const elapsedRef = useRef(getCreditsSoundtrackTime())
  const resumeAfterForegroundRef = useRef(false)
  const [isExiting, setIsExiting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isForeground, setIsForeground] = useState(() => !document.hidden)
  const [videoReady, setVideoReady] = useState(false)
  const [renderFailed, setRenderFailed] = useState(!useVideo)
  const [creditCards, setCreditCards] = useState<readonly CreditCard[]>(CINEMATIC_CREDITS)
  const [contentState, setContentState] = useState<CreditsContentLoadResult>(() => ({
    cards: CINEMATIC_CREDITS,
    source: 'fallback',
    url: 'bundled',
  }))

  // Record this choice before committing the render so changing motion back
  // cannot attach a fresh video and replay the opening of this credits run.
  if (!useVideo && !renderFailed) setRenderFailed(true)

  const clearVideoTimeouts = useCallback(() => {
    if (videoReadyTimeoutRef.current != null) {
      window.clearTimeout(videoReadyTimeoutRef.current)
      videoReadyTimeoutRef.current = null
    }
    if (videoStallTimeoutRef.current != null) {
      window.clearTimeout(videoStallTimeoutRef.current)
      videoStallTimeoutRef.current = null
    }
  }, [])

  const fallbackToStaticScene = useCallback(() => {
    if (!isOwner || isExiting || exitStartedRef.current || videoFailureHandledRef.current) return
    videoFailureHandledRef.current = true
    clearVideoTimeouts()
    elapsedRef.current = videoRef.current?.currentTime || elapsedRef.current
    releaseCinematicVideoElement(videoRef.current)
    setVideoReady(false)
    setIsPlaying(false)
    setRenderFailed(true)
  }, [clearVideoTimeouts, isExiting, isOwner])

  const onExit = useCallback(
    (instantBlackout = false) => {
      if (!isOwner || exitStartedRef.current) return
      exitStartedRef.current = true
      clearVideoTimeouts()

      setIsExiting(true)
      setIsPlaying(false)
      if (instantBlackout) {
        releaseCinematicVideoElement(videoRef.current)
        stopCreditsSoundtrack()
      } else {
        fadeOutCreditsSoundtrack(EXIT_FADE_MS)
      }
    },
    [clearVideoTimeouts, isOwner]
  )

  useEffect(() => {
    if (!renderFailed) return
    clearVideoTimeouts()
    videoFailureHandledRef.current = true
  }, [clearVideoTimeouts, renderFailed])

  useEffect(() => {
    if (!isExiting || !isOwner || exitDeliveredRef.current) return undefined
    exitTimeoutRef.current = window.setTimeout(() => {
      exitTimeoutRef.current = null
      exitDeliveredRef.current = true
      releaseCinematicVideoElement(videoRef.current)
      stopCreditsSoundtrack()
      if (onComplete) onComplete()
      else navigate('/')
    }, EXIT_FADE_MS)
    return () => {
      if (exitTimeoutRef.current != null) window.clearTimeout(exitTimeoutRef.current)
      exitTimeoutRef.current = null
    }
  }, [isExiting, isOwner, navigate, onComplete])

  const startVisualPlayback = useCallback(() => {
    const video = videoRef.current
    if (
      video == null ||
      exitStartedRef.current ||
      renderFailed ||
      !useVideo ||
      !isOwner ||
      document.hidden
    )
      return

    const soundtrackTime = getCreditsSoundtrackTime()
    if (soundtrackTime > 0.05 && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = Math.min(soundtrackTime, DURATION_SECONDS - 0.05)
    }

    if (videoStallTimeoutRef.current != null) {
      window.clearTimeout(videoStallTimeoutRef.current)
    }
    videoStallTimeoutRef.current = window.setTimeout(fallbackToStaticScene, VIDEO_STALL_TIMEOUT_MS)
    void video.play().catch((error) => {
      fallbackToStaticScene()
      console.warn('[Credits] Background video playback was blocked.', error)
    })
  }, [fallbackToStaticScene, isOwner, useVideo, renderFailed])

  useEffect(() => {
    if (
      !autoPlay ||
      !isOwner ||
      !useVideo ||
      renderFailed ||
      videoReady ||
      isExiting ||
      !isForeground
    ) {
      return undefined
    }

    const timeout = window.setTimeout(() => {
      const video = videoRef.current
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        setVideoReady(true)
        return
      }
      fallbackToStaticScene()
    }, VIDEO_READY_TIMEOUT_MS)
    videoReadyTimeoutRef.current = timeout

    return () => {
      window.clearTimeout(timeout)
      if (videoReadyTimeoutRef.current === timeout) videoReadyTimeoutRef.current = null
    }
  }, [
    autoPlay,
    isExiting,
    isForeground,
    isOwner,
    useVideo,
    renderFailed,
    fallbackToStaticScene,
    videoReady,
  ])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void loadCreditsContent({ signal: controller.signal }).then((result) => {
      if (!active) return
      setCreditCards(result.cards)
      setContentState(result)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (autoPlay && isOwner && useVideo) startVisualPlayback()
  }, [autoPlay, isOwner, useVideo, startVisualPlayback])

  // The background video is muted and may autoplay without a gesture, while
  // its separate soundtrack can be blocked by browser autoplay policy. Prime
  // it at mount and retry once on the first real interaction if necessary.
  useEffect(() => {
    if (!autoPlay || !isOwner || isCreditsSoundtrackPlaying()) return
    const tryStartSoundtrack = () => {
      if (isCreditsSoundtrackPlaying()) return
      const visualTime = renderFailed
        ? elapsedRef.current
        : videoRef.current?.currentTime || getCreditsSoundtrackTime()
      void startCreditsSoundtrackFromGesture(visualTime).catch(() => undefined)
    }
    tryStartSoundtrack()
    window.addEventListener('pointerdown', tryStartSoundtrack, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', tryStartSoundtrack, true)
  }, [autoPlay, isOwner, renderFailed])

  useEffect(() => {
    if (isOwner) return
    clearVideoTimeouts()
    videoRef.current?.pause()
    pauseCreditsSoundtrack()
  }, [clearVideoTimeouts, isOwner])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        const video = videoRef.current
        resumeAfterForegroundRef.current = Boolean(video && !video.paused && !video.ended)
        video?.pause()
        pauseCreditsSoundtrack()
        setIsPlaying(false)
        setIsForeground(false)
        return
      }

      setIsForeground(true)
      const shouldResumeVideo = resumeAfterForegroundRef.current
      resumeAfterForegroundRef.current = false
      if (!isOwner || isExiting) return
      if (renderFailed || !useVideo) {
        syncCreditsSoundtrackToTime(elapsedRef.current, true)
      } else if (shouldResumeVideo || autoPlay) {
        startVisualPlayback()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [autoPlay, isExiting, isOwner, useVideo, renderFailed, startVisualPlayback])

  useEffect(
    () => () => {
      clearVideoTimeouts()
      if (exitTimeoutRef.current != null) window.clearTimeout(exitTimeoutRef.current)
      stopCreditsSoundtrack()
    },
    [clearVideoTimeouts]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onExit()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onExit])

  const handlePlay = useCallback(() => {
    if (!isOwner || !useVideo || exitStartedRef.current) {
      videoRef.current?.pause()
      return
    }
    setIsPlaying(true)
    const elapsed = videoRef.current?.currentTime ?? 0
    // The Home button starts the soundtrack inside its click gesture. When the
    // visual then emits `play`, preserve that valid request instead of pausing
    // and restarting it from this later, potentially non-gesture event.
    if (isCreditsSoundtrackPlaying()) {
      syncCreditsSoundtrackToTime(elapsed, true)
      return
    }
    void startCreditsSoundtrackFromGesture(elapsed).catch((error) => {
      // A direct URL may not carry a user gesture. The silent video still starts immediately.
      console.warn('[Credits] Soundtrack playback was blocked.', error)
    })
  }, [isOwner, useVideo])

  const handleVideoReady = useCallback(() => {
    if (!useVideo || exitStartedRef.current) return
    // Some embedded mobile browsers expose the first decoded frame before
    // they emit canplay. Reveal it as soon as loadeddata arrives too.
    if (videoReadyTimeoutRef.current != null) {
      window.clearTimeout(videoReadyTimeoutRef.current)
      videoReadyTimeoutRef.current = null
    }
    setVideoReady(true)
  }, [useVideo])

  const handleVideoPlaying = useCallback(() => {
    if (!isOwner || !useVideo || exitStartedRef.current) {
      videoRef.current?.pause()
      return
    }
    if (videoStallTimeoutRef.current != null) {
      window.clearTimeout(videoStallTimeoutRef.current)
      videoStallTimeoutRef.current = null
    }
    setIsPlaying(true)
    // Mobile video commonly emits `waiting` once immediately after starting.
    // That pauses the soundtrack to keep it aligned. Resume the soundtrack
    // when the video resumes instead of leaving the rest of Credits silent.
    syncCreditsSoundtrackToTime(videoRef.current?.currentTime ?? 0, true)
  }, [isOwner, useVideo])

  const handleVideoWaiting = useCallback(() => {
    syncCreditsSoundtrackToTime(videoRef.current?.currentTime ?? 0, false)
    if (videoStallTimeoutRef.current != null) {
      window.clearTimeout(videoStallTimeoutRef.current)
    }
    videoStallTimeoutRef.current = window.setTimeout(fallbackToStaticScene, VIDEO_STALL_TIMEOUT_MS)
  }, [fallbackToStaticScene])

  const handleRenderFailure = useCallback(() => {
    console.warn('[Credits] Pre-rendered background unavailable. Using city-lights fallback.')
    fallbackToStaticScene()
  }, [fallbackToStaticScene])

  return (
    <div
      className={`credits-container${isExiting ? ' is-exiting' : ''}`}
      data-presentation-root="credits"
      hidden={!isOwner}
      style={isOwner ? undefined : { display: 'none' }}
    >
      <div className="credits-stage" aria-label="Credits cinematic">
        <div
          className="credits-media"
          data-content-source={contentState.source}
          data-cinematic-renderer="prerendered-video"
          data-video-ready={videoReady && useVideo ? 'true' : 'false'}
        >
          <CreditsFallback posterUrl={CREDITS_POSTER_SOURCES[0]} />
          {!renderFailed && (
            <CinematicVideo
              ref={videoRef}
              asset={CINEMATIC_VIDEO_ASSETS['credits-background']}
              prepare={autoPlay && isOwner && !renderFailed && useVideo}
              className={`credits-video${videoReady && useVideo ? ' is-ready' : ''}`}
              aria-hidden="true"
              data-testid="credits-background-video"
              autoPlay={autoPlay}
              onLoadedData={handleVideoReady}
              onCanPlay={handleVideoReady}
              onEmptied={() => {
                setIsPlaying(false)
                setVideoReady(false)
              }}
              onLoadedMetadata={startVisualPlayback}
              onPlay={handlePlay}
              onPlaying={handleVideoPlaying}
              onPause={() => {
                if (videoStallTimeoutRef.current != null) {
                  window.clearTimeout(videoStallTimeoutRef.current)
                  videoStallTimeoutRef.current = null
                }
                setIsPlaying(false)
                syncCreditsSoundtrackToTime(videoRef.current?.currentTime ?? 0, false)
              }}
              onWaiting={handleVideoWaiting}
              onSeeked={() =>
                syncCreditsSoundtrackToTime(
                  videoRef.current?.currentTime ?? 0,
                  isCreditsSoundtrackPlaying()
                )
              }
              onEnded={() => onExit(true)}
              onError={handleRenderFailure}
            />
          )}
          <div className="credits-overlay-track">
            <CreditsTimeline
              videoRef={videoRef}
              elapsedRef={elapsedRef}
              running={autoPlay && isOwner && isForeground && !isExiting}
              playing={isPlaying}
              fallback={renderFailed || !useVideo}
              credits={creditCards}
              onEnd={onExit}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="credits-exit"
        onClick={() => onExit()}
        aria-label="Skip credits"
      >
        <span>Skip</span>
        <span aria-hidden="true">×</span>
      </button>

      <div
        className={`credits-end-guard${isExiting ? ' is-visible' : ''}`}
        data-testid="credits-end-guard"
        aria-hidden="true"
      />
    </div>
  )
}
