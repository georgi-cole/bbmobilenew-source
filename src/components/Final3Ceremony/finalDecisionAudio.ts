import { SoundManager } from '../../services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../services/sound/sounds'
import type { FinalDecisionSceneStage } from './finalDecisionScene.mjs'

/** Existing assets, mixed quietly beneath this presentation's dialogue. */
export const FINAL_DECISION_AUDIO = {
  musicKey: 'music:final_three_week',
  musicVolume: 0.22,
  pleaVolume: 0.16,
  revealVolume: 0.1,
  fadeInMs: 700,
  mixTransitionMs: 350,
  cues: {
    'decision:begin': {
      key: 'tv:live_vote',
      volume: 0.16,
      durationMs: 1200,
      fadeInMs: 120,
      fadeOutMs: 450,
    },
    'decision:seal': {
      key: 'tv:voting_eviction',
      volume: 0.28,
      durationMs: 2600,
      fadeInMs: 100,
      fadeOutMs: 600,
    },
  },
} as const

interface AudioPreferences {
  musicOn: boolean
  sfxOn: boolean
}

export interface FinalDecisionAudioController {
  setActive(active: boolean): void
  setPreferences(preferences: AudioPreferences): void
  setStage(stage: FinalDecisionSceneStage): void
  cue(cue: string): void
  dispose(): void
}

/** Own only this scene's soundtrack and abortable accents, never global preferences. */
export function createFinalDecisionAudio(
  sceneId: string,
  initialPreferences: AudioPreferences
): FinalDecisionAudioController {
  const owner = `final-decision:${sceneId}`
  let preferences = initialPreferences
  let active = false
  let paused = false
  let begun = false
  let disposed = false
  let failed = false
  let stage: FinalDecisionSceneStage = 'welcome'
  let music: HTMLAudioElement | null = null
  let claimed = false
  let pendingPlay = false
  let generation = 0
  let currentMix = 0
  let fadeFrame: number | null = null
  let retryGesture: (() => void) | null = null
  let accents: AbortController | null = null
  const playedCues = new Set<string>()

  const cancelFade = () => {
    if (fadeFrame !== null) window.cancelAnimationFrame(fadeFrame)
    fadeFrame = null
  }
  const cancelRetry = () => {
    if (!retryGesture) return
    for (const event of ['pointerdown', 'keydown', 'touchstart']) {
      document.removeEventListener(event, retryGesture, true)
    }
    retryGesture = null
  }
  const cancelAccents = () => {
    accents?.abort()
    accents = null
  }
  const volume = () =>
    stage === 'plea-a' || stage === 'plea-b'
      ? FINAL_DECISION_AUDIO.pleaVolume
      : stage === 'seal' || stage === 'announcement'
        ? FINAL_DECISION_AUDIO.revealVolume
        : FINAL_DECISION_AUDIO.musicVolume
  const applyMix = (value: number) => {
    currentMix = value
    if (music && claimed) SoundManager.setExternalMusicVolume(owner, music, value)
  }
  const fadeTo = (target: number, duration: number) => {
    cancelFade()
    if (!music || !claimed || currentMix === target) return
    const from = currentMix
    const start = performance.now()
    const step = (now: number) => {
      if (disposed || !active || paused || !preferences.musicOn) return
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      applyMix(from + (target - from) * progress)
      fadeFrame = progress < 1 ? window.requestAnimationFrame(step) : null
    }
    fadeFrame = window.requestAnimationFrame(step)
  }
  const relinquishMusic = () => {
    generation += 1
    pendingPlay = false
    cancelFade()
    cancelRetry()
    music?.pause()
    if (music && claimed) SoundManager.releaseExternalMusic(owner, music)
    claimed = false
    currentMix = 0
  }
  const musicFailed = () => {
    if (disposed) return
    failed = true
    relinquishMusic()
  }
  const guardPlayback = () => {
    if (disposed || !active || paused || !preferences.musicOn || document.hidden) music?.pause()
  }
  const prepareMusic = () => {
    if (music || failed || typeof Audio === 'undefined') return
    const source = SOUND_REGISTRY[FINAL_DECISION_AUDIO.musicKey]?.src
    if (!source) return
    try {
      music = new Audio(source)
      music.preload = 'auto'
      music.loop = true
      music.volume = 0
      music.addEventListener('error', musicFailed)
      music.addEventListener('play', guardPlayback)
    } catch {
      failed = true
    }
  }

  const sync = () => {
    if (disposed) return
    if (!active || !begun) {
      cancelAccents()
      relinquishMusic()
      return
    }
    if (paused || !preferences.sfxOn) cancelAccents()
    // A paused owner keeps a silent claim so the phase track cannot restart
    // underneath Pause. Losing presentation ownership yields the channel above.
    if (!preferences.musicOn && !music) return
    prepareMusic()
    if (!music || failed) return
    if (!claimed) {
      SoundManager.claimExternalMusic(owner, music, 0)
      claimed = true
    }
    if (paused || !preferences.musicOn) {
      generation += 1
      pendingPlay = false
      cancelFade()
      cancelRetry()
      applyMix(0)
      music.pause()
      return
    }
    if (music.paused && !pendingPlay) {
      const element = music
      const attempt = ++generation
      pendingPlay = true
      cancelRetry()
      void element
        .play()
        .then(() => {
          if (attempt !== generation || disposed) return
          pendingPlay = false
          fadeTo(volume(), FINAL_DECISION_AUDIO.fadeInMs)
        })
        .catch((error: unknown) => {
          if (attempt !== generation || disposed) return
          pendingPlay = false
          relinquishMusic()
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            retryGesture = () => {
              cancelRetry()
              if (active && !paused && preferences.musicOn) sync()
            }
            for (const event of ['pointerdown', 'keydown', 'touchstart']) {
              document.addEventListener(event, retryGesture, true)
            }
          } else {
            failed = true
          }
        })
    } else if (!pendingPlay) {
      fadeTo(volume(), FINAL_DECISION_AUDIO.mixTransitionMs)
    }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAccents()
    relinquishMusic()
    if (music) {
      music.removeEventListener('error', musicFailed)
      music.removeEventListener('play', guardPlayback)
      music.removeAttribute('src')
      music.load()
      music = null
    }
  }

  return {
    setActive(value) {
      active = value
      sync()
    },
    setPreferences(value) {
      preferences = value
      sync()
    },
    setStage(value) {
      stage = value
      if (value === 'complete') {
        dispose()
        return
      }
      if (value !== 'welcome') begun = true
      sync()
    },
    cue(cue) {
      if (disposed) return
      if (cue === 'presentation:dispose') {
        dispose()
        return
      }
      if (cue === 'presentation:pause' || cue === 'presentation:resume') {
        paused = cue === 'presentation:pause'
        sync()
        return
      }
      if (cue === 'decision:begin') begun = true
      sync()
      if (!active || paused || !preferences.sfxOn || playedCues.has(cue)) return
      const accent = FINAL_DECISION_AUDIO.cues[cue as keyof typeof FINAL_DECISION_AUDIO.cues]
      if (!accent) return
      playedCues.add(cue)
      accents ??= new AbortController()
      const { key, ...options } = accent
      void SoundManager.play(key, { ...options, signal: accents.signal }).catch(() => {})
    },
    dispose,
  }
}
