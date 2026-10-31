import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { CinematicVideo } from '../../cinematic/media/CinematicVideo'
import {
  CINEMATIC_VIDEO_ASSETS,
  releaseCinematicVideoElement,
  resolveCinematicMediaUrl,
} from '../../cinematic/media/cinematicMedia'
import { isTwinShockVideoPilotEnabled } from '../../config/featureFlags'
import type { TwinShockRevealAnimation } from '../../types'
import { SoundManager } from '../../services/sound/SoundManager'
import {
  PRESENTATION_PRIORITY,
  getPresentationOwner,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio'
import './TwinShockIntroCinematic.css'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
export const TWIN_SHOCK_INTRO_DURATION_MS = 16_200
const CINEMATIC_FADE_OUT_MS = 1_200
const SKIP_FADE_OUT_MS = 420
const VIDEO_READY_TIMEOUT_MS = 900
const VIDEO_STALL_TIMEOUT_MS = 1_500
const FALLBACK_IMAGE_STYLES = {
  '--twin-intro-childhood-image': `url("${resolveCinematicMediaUrl('assets/twin-shock/twin-shock-childhood.webp')}")`,
  '--twin-intro-grown-image': `url("${resolveCinematicMediaUrl('assets/twin-shock/twin-shock-roadtrip.webp')}")`,
  '--twin-intro-reveal-image': `url("${resolveCinematicMediaUrl('assets/twin-shock/twin-shock-lia-ali-reveal.webp')}")`,
} as CSSProperties

type CinematicStage = 'signal' | 'childhood' | 'grown' | 'reveal' | 'verdict'

interface TwinShockIntroCinematicProps {
  reveal: TwinShockRevealAnimation
  onComplete: () => void
}

interface IntroHubAudioWindow extends Window {
  _introhubMusicOn?: boolean
}

function asset(path: string): string {
  return `${BASE}${path}`
}

function stageAt(elapsedMs: number): CinematicStage {
  if (elapsedMs < 1_400) return 'signal'
  if (elapsedMs < 4_200) return 'childhood'
  if (elapsedMs < 7_100) return 'grown'
  if (elapsedMs < 10_800) return 'reveal'
  return 'verdict'
}

export default function TwinShockIntroCinematic({
  reveal,
  onComplete,
}: TwinShockIntroCinematicProps) {
  const reducedMotion = usePresentationReducedMotion()
  const useVideoPilot = isTwinShockVideoPilotEnabled() && !reducedMotion
  const { isOwner } = usePresentationOwner('twin-shock', PRESENTATION_PRIORITY.twinShock)
  const durationMs = TWIN_SHOCK_INTRO_DURATION_MS
  const [elapsedMs, setElapsedMs] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [isForeground, setIsForeground] = useState(
    () => typeof document === 'undefined' || !document.hidden
  )
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const onCompleteRef = useRef(onComplete)
  const elapsedRef = useRef(0)
  const completedRef = useRef(false)
  const fadeStartedRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const audioRef = useRef<CinematicAudioController | null>(null)
  const skipRef = useRef<HTMLButtonElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const musicAllowedRef = useRef(false)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const complete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = null
    releaseCinematicVideoElement(videoRef.current)
    audioRef.current?.dispose()
    setCompleted(true)
    onCompleteRef.current()
  }, [])

  const updateElapsed = useCallback(
    (nextElapsedMs: number) => {
      const bounded = Math.max(0, Math.min(durationMs, nextElapsedMs))
      elapsedRef.current = bounded
      setElapsedMs(bounded)
      if (!fadeStartedRef.current && bounded >= durationMs - CINEMATIC_FADE_OUT_MS) {
        fadeStartedRef.current = true
        audioRef.current?.fadeOutAndStop(CINEMATIC_FADE_OUT_MS)
      }
    },
    [durationMs]
  )

  const skip = useCallback(() => {
    if (completedRef.current || completionTimerRef.current != null) return
    fadeStartedRef.current = true
    audioRef.current?.fadeOutAndStop(SKIP_FADE_OUT_MS)
    completionTimerRef.current = window.setTimeout(complete, SKIP_FADE_OUT_MS)
  }, [complete])

  useEffect(() => {
    // Losing ownership suspends the intro; it must not advance game flow.
    if (!isOwner || completed) return undefined
    if (reducedMotion) {
      const immediateCompletion = window.setTimeout(complete, 0)
      return () => window.clearTimeout(immediateCompletion)
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skipRef.current?.focus()

    const audio = createCinematicAudio(
      asset('/assets/sounds/cinematic/Twin_shock_presentation.mp4'),
      0.62
    )
    audioRef.current = audio
    musicAllowedRef.current = (window as IntroHubAudioWindow)._introhubMusicOn !== false
    fadeStartedRef.current = false
    if (musicAllowedRef.current && !document.hidden && (!useVideoPilot || videoFailed)) {
      audio.syncTo(elapsedRef.current / 1000)
      audio.resume()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      audio.dispose()
      audioRef.current = null
      if (getPresentationOwner()?.groupId === 'twin-shock') {
        void SoundManager.syncMusic()
      }
    }
  }, [complete, completed, isOwner, reducedMotion, skip, useVideoPilot, videoFailed])

  useEffect(() => {
    if (completed || !isOwner || !isForeground || (useVideoPilot && !videoFailed)) return undefined

    const startedAt = performance.now() - elapsedRef.current
    const intervalId = window.setInterval(() => {
      if (completedRef.current) return
      const nextElapsed = performance.now() - startedAt
      updateElapsed(nextElapsed)
      if (nextElapsed >= durationMs) {
        window.clearInterval(intervalId)
        complete()
      }
    }, 60)

    return () => window.clearInterval(intervalId)
  }, [
    complete,
    completed,
    durationMs,
    isForeground,
    isOwner,
    updateElapsed,
    useVideoPilot,
    videoFailed,
  ])

  useEffect(() => {
    if (completed || !isOwner || !useVideoPilot || videoFailed || !isForeground) return undefined
    const video = videoRef.current
    if (!video) {
      const fallbackTimeout = window.setTimeout(() => setVideoFailed(true), 0)
      return () => window.clearTimeout(fallbackTimeout)
    }

    let failed = false
    let playbackStarted = false
    let playRequested = false
    let stallTimeout: number | null = null
    const syncFromVideo = () => {
      if (!completedRef.current)
        updateElapsed(Math.max(elapsedRef.current, video.currentTime * 1000))
    }
    const clearStallTimeout = () => {
      if (stallTimeout == null) return
      window.clearTimeout(stallTimeout)
      stallTimeout = null
    }
    const failToLiveFallback = () => {
      if (failed || completedRef.current) return
      failed = true
      clearStallTimeout()
      syncFromVideo()
      setVideoReady(false)
      setVideoFailed(true)
      video.pause()
      releaseCinematicVideoElement(video)
      if (musicAllowedRef.current) {
        audioRef.current?.syncTo(elapsedRef.current / 1000)
        audioRef.current?.resume()
      }
    }
    const requestPlayback = () => {
      if (failed || completedRef.current || playRequested) return
      playRequested = true
      if (elapsedRef.current > 0 && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        video.currentTime = elapsedRef.current / 1000
      }
      stallTimeout = window.setTimeout(failToLiveFallback, VIDEO_STALL_TIMEOUT_MS)
      try {
        void Promise.resolve(video.play()).catch(failToLiveFallback)
      } catch {
        failToLiveFallback()
      }
    }
    const startWhenReady = () => {
      if (failed || completedRef.current || playbackStarted) return
      playbackStarted = true
      window.clearTimeout(readyTimeout)
      if (elapsedRef.current > 0) video.currentTime = elapsedRef.current / 1000
      setVideoReady(true)
      requestPlayback()
    }
    const handlePlaying = () => {
      clearStallTimeout()
      if (!musicAllowedRef.current) return
      audioRef.current?.syncTo(video.currentTime)
      audioRef.current?.resume()
    }
    const handleWaiting = () => {
      audioRef.current?.pause()
      clearStallTimeout()
      stallTimeout = window.setTimeout(failToLiveFallback, VIDEO_STALL_TIMEOUT_MS)
    }
    const handleEnded = () => {
      syncFromVideo()
      if (completionTimerRef.current != null) return
      audioRef.current?.fadeOutAndStop(0)
      complete()
    }
    const readyTimeout = window.setTimeout(failToLiveFallback, VIDEO_READY_TIMEOUT_MS)

    // Muted play requests the first decoded frame even when a WebView limits
    // preload to metadata. Keep the live fallback visible until data arrives.
    video.addEventListener('loadedmetadata', requestPlayback)
    video.addEventListener('loadeddata', startWhenReady)
    video.addEventListener('canplay', startWhenReady)
    video.addEventListener('timeupdate', syncFromVideo)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('stalled', handleWaiting)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', failToLiveFallback)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startWhenReady()
    else requestPlayback()

    return () => {
      failed = true
      window.clearTimeout(readyTimeout)
      clearStallTimeout()
      video.removeEventListener('loadedmetadata', requestPlayback)
      video.removeEventListener('loadeddata', startWhenReady)
      video.removeEventListener('canplay', startWhenReady)
      video.removeEventListener('timeupdate', syncFromVideo)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('stalled', handleWaiting)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', failToLiveFallback)
    }
  }, [complete, completed, isForeground, isOwner, updateElapsed, useVideoPilot, videoFailed])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (useVideoPilot && videoRef.current) {
          updateElapsed(videoRef.current.currentTime * 1000)
          setVideoReady(false)
          setVideoFailed(true)
          releaseCinematicVideoElement(videoRef.current)
        }
        audioRef.current?.pause()
        setIsForeground(false)
        return
      }

      setIsForeground(true)
      if (musicAllowedRef.current && !completedRef.current) {
        audioRef.current?.syncTo(elapsedRef.current / 1000)
        audioRef.current?.resume()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [updateElapsed, useVideoPilot])

  const stage = useMemo(() => stageAt(elapsedMs), [elapsedMs])
  const progress = Math.min(1, elapsedMs / durationMs)
  const isAliEntering = reveal.type === 'ali_enters'

  if (!isOwner || reducedMotion || completed) return null

  return (
    <section
      className={`twin-intro twin-intro--${stage}${videoReady ? ' twin-intro--video-ready' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Lia and Ali Twin Shock introduction"
      style={FALLBACK_IMAGE_STYLES}
      data-stage={stage}
      data-presentation-root="twin-shock-intro"
    >
      <CinematicVideo
        ref={videoRef}
        asset={CINEMATIC_VIDEO_ASSETS['twin-shock-intro-background']}
        prepare={isOwner && useVideoPilot && !videoFailed && isForeground}
        className={`twin-intro__video${videoReady ? ' twin-intro__video--ready' : ''}`}
        aria-hidden="true"
        data-testid="twin-shock-background-video"
      />
      <div className="twin-intro__photo twin-intro__photo--childhood" aria-hidden="true" />
      <div className="twin-intro__photo twin-intro__photo--grown" aria-hidden="true" />
      <div className="twin-intro__photo twin-intro__photo--reveal" aria-hidden="true" />
      <div className="twin-intro__scan" aria-hidden="true" />
      <div className="twin-intro__grain" aria-hidden="true" />

      <button ref={skipRef} className="twin-intro__skip" type="button" onClick={skip}>
        Skip <span aria-hidden="true">×</span>
      </button>

      <div className="twin-intro__counter" aria-hidden="true">
        <span>Secret family archive</span>
        <strong>02 / 01</strong>
      </div>

      <div className="twin-intro__signal" aria-hidden={stage !== 'signal'}>
        <div className="twin-intro__eye">
          <span />
        </div>
        <p>House signal intercepted</p>
        <h2>
          Identity
          <br />
          breach
        </h2>
      </div>

      <div
        className="twin-intro__chapter twin-intro__chapter--childhood"
        aria-hidden={stage !== 'childhood'}
      >
        <span>Chapter one · The beginning</span>
        <h2>
          Double trouble
          <br />
          from day one.
        </h2>
        <p>Same birthday. Same smile. One very suspicious missing slice of cake.</p>
      </div>

      <div
        className="twin-intro__chapter twin-intro__chapter--grown"
        aria-hidden={stage !== 'grown'}
      >
        <span>Chapter two · Perfecting the act</span>
        <h2>
          They always knew
          <br />
          how to play it cool.
        </h2>
        <p>Almost always.</p>
      </div>

      <div
        className="twin-intro__chapter twin-intro__chapter--reveal"
        aria-hidden={stage !== 'reveal'}
      >
        <span>Twin Shock · Present day</span>
        <h2>
          Lia <i>&</i> Ali
        </h2>
        <div className="twin-intro__names" aria-label="Lia and Ali">
          <p>
            <strong>Lia</strong>
            <small>You knew her face.</small>
          </p>
          <p>
            <strong>Ali</strong>
            <small>She was the other half of the game.</small>
          </p>
        </div>
      </div>

      <div className="twin-intro__verdict" aria-hidden={stage !== 'verdict'}>
        <span>{isAliEntering ? 'Secret mission complete' : 'The secret was exposed'}</span>
        <h2>{isAliEntering ? 'Ali enters the House.' : 'Lia & Ali play as one.'}</h2>
        <p>One face. Two players. The House will never look at Lia the same way again.</p>
      </div>

      <div className="twin-intro__progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </section>
  )
}
