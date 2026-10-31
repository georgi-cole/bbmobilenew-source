import { SoundManager } from './SoundManager'

export interface CinematicAudioController {
  play: () => void
  pause: () => void
  resume: () => void
  syncTo: (timeSeconds: number) => void
  currentTime: () => number
  fadeOutAndStop: (durationMs: number) => void
  dispose: () => void
}

const DEFAULT_FADE_STEP_MS = 50
const MIN_FADE_INTERVAL_MS = 16
const RETRY_EVENTS: Array<keyof DocumentEventMap> = ['click', 'keydown', 'touchstart']

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume))
}

function isAutoplayBlocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'NotAllowedError'
  )
}

export function createCinematicAudio(
  src: string,
  volume = 1,
  options: { loop?: boolean } = {}
): CinematicAudioController {
  if (typeof Audio === 'undefined') {
    return {
      play: () => {},
      pause: () => {},
      resume: () => {},
      syncTo: () => {},
      currentTime: () => 0,
      fadeOutAndStop: () => {},
      dispose: () => {},
    }
  }

  const audio = new Audio(src)
  const owner = `cinematic:${src}`
  const baseVolume = clampVolume(volume)
  audio.preload = 'auto'
  audio.volume = baseVolume
  audio.loop = options.loop ?? false

  let fadeTimer: number | null = null
  let retryHandler: (() => void) | null = null
  let playAttemptToken = 0
  let currentBaseVolume = baseVolume
  let disposed = false

  const clearFadeTimer = () => {
    if (fadeTimer != null) {
      window.clearInterval(fadeTimer)
      fadeTimer = null
    }
  }

  const clearRetryHandler = () => {
    if (typeof document === 'undefined') {
      retryHandler = null
      return
    }
    if (retryHandler == null) {
      return
    }
    for (const eventName of RETRY_EVENTS) {
      document.removeEventListener(eventName, retryHandler, true)
    }
    retryHandler = null
  }

  const attemptPlay = (restart = true) => {
    if (disposed) return
    const attemptToken = ++playAttemptToken
    clearFadeTimer()
    clearRetryHandler()
    if (restart) {
      audio.currentTime = 0
      audio.volume = baseVolume
      currentBaseVolume = baseVolume
    }
    SoundManager.claimExternalMusic(owner, audio, baseVolume)
    void audio.play().catch((error: unknown) => {
      if (attemptToken !== playAttemptToken) {
        return
      }
      if (isAutoplayBlocked(error) && typeof document !== 'undefined') {
        if (retryHandler != null) {
          return
        }
        retryHandler = () => attemptPlay(restart)
        for (const eventName of RETRY_EVENTS) {
          document.addEventListener(eventName, retryHandler, true)
        }
      }
    })
  }

  const stop = () => {
    playAttemptToken += 1
    clearFadeTimer()
    clearRetryHandler()
    audio.pause()
    audio.currentTime = 0
    audio.volume = baseVolume
    currentBaseVolume = baseVolume
    SoundManager.releaseExternalMusic(owner, audio)
  }

  return {
    play: () => attemptPlay(true),
    pause: () => {
      playAttemptToken += 1
      clearFadeTimer()
      clearRetryHandler()
      audio.pause()
      SoundManager.releaseExternalMusic(owner, audio)
    },
    resume: () => attemptPlay(false),
    syncTo: (timeSeconds) => {
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return
      try {
        const end = Number.isFinite(audio.duration)
          ? Math.max(0, audio.duration - 0.05)
          : timeSeconds
        if (Math.abs(audio.currentTime - timeSeconds) > 0.18) {
          audio.currentTime = Math.min(timeSeconds, end)
        }
      } catch {
        // Media may not have metadata yet; its first playback event will sync again.
      }
    },
    currentTime: () => audio.currentTime,
    fadeOutAndStop: (durationMs: number) => {
      playAttemptToken += 1
      clearFadeTimer()
      clearRetryHandler()

      if (durationMs <= 0 || audio.paused || audio.ended) {
        stop()
        return
      }

      const startingVolume = currentBaseVolume
      const steps = Math.max(1, Math.ceil(durationMs / DEFAULT_FADE_STEP_MS))
      const intervalMs = Math.max(MIN_FADE_INTERVAL_MS, Math.floor(durationMs / steps))
      let step = 0

      fadeTimer = window.setInterval(() => {
        step += 1
        currentBaseVolume = clampVolume(startingVolume * (1 - step / steps))
        SoundManager.setExternalMusicVolume(owner, audio, currentBaseVolume)

        if (step >= steps) {
          stop()
        }
      }, intervalMs)
    },
    dispose: () => {
      disposed = true
      stop()
      audio.removeAttribute('src')
      audio.load()
    },
  }
}
