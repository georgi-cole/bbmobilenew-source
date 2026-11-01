import { SoundManager } from '../../services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../services/sound/sounds'
import type { FinalDecisionSceneStage } from './finalDecisionScene.mjs'

/** Existing assets, shaped around the room opening, pleas and final verdict. */
export const FINAL_DECISION_AUDIO = {
  musicKey: 'music:final_three_week',
  musicVolume: 0.25,
  pleaVolume: 0.15,
  choiceVolume: 0.28,
  confirmationVolume: 0.34,
  sealVolume: 0.045,
  revealVolume: 0.12,
  exitVolume: 0.25,
  exitFadeOutMs: 1000,
  fadeInMs: 900,
  mixTransitionMs: 600,
  suspenseBuildMs: 1400,
  verdictDropMs: 180,
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
  /** Finish the retained soundtrack after the departure film has handed off. */
  finish(): void
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
  let finishing = false
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
  const volume = () => {
    if (stage === 'plea-a' || stage === 'plea-b') return FINAL_DECISION_AUDIO.pleaVolume
    if (stage === 'choose') return FINAL_DECISION_AUDIO.choiceVolume
    if (stage === 'confirm' || stage === 'deliberate')
      return FINAL_DECISION_AUDIO.confirmationVolume
    if (stage === 'seal') return FINAL_DECISION_AUDIO.sealVolume
    if (stage === 'announcement') return FINAL_DECISION_AUDIO.revealVolume
    if (stage === 'complete') return FINAL_DECISION_AUDIO.exitVolume
    return FINAL_DECISION_AUDIO.musicVolume
  }
  const transitionMs = () => {
    if (stage === 'seal') return FINAL_DECISION_AUDIO.verdictDropMs
    if (stage === 'choose' || stage === 'confirm' || stage === 'deliberate')
      return FINAL_DECISION_AUDIO.suspenseBuildMs
    return FINAL_DECISION_AUDIO.mixTransitionMs
  }
  const applyMix = (value: number) => {
    currentMix = value
    if (music && claimed) SoundManager.setExternalMusicVolume(owner, music, value)
  }
  const fadeTo = (target: number, duration: number, onFinish?: () => void) => {
    cancelFade()
    if (!music || !claimed || currentMix === target) {
      onFinish?.()
      return
    }
    const from = currentMix
    const start = performance.now()
    const step = (now: number) => {
      if (disposed || !active || paused || !preferences.musicOn) return
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      applyMix(from + (target - from) * progress)
      fadeFrame = progress < 1 ? window.requestAnimationFrame(step) : null
      if (progress === 1) onFinish?.()
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
    if (finishing) {
      if (!active || paused || !preferences.musicOn) dispose()
      return
    }
    if (!active || !begun) {
      cancelAccents()
      relinquishMusic()
      return
    }
    if (paused || !preferences.sfxOn) cancelAccents()
    // A paused owner keeps a silent claim so the phase track cannot restart
    // underneath a suspended scene. Losing ownership yields the channel above.
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
      fadeTo(volume(), transitionMs())
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

  const finish = () => {
    if (disposed || finishing) return
    finishing = true
    generation += 1
    pendingPlay = false
    cancelAccents()
    cancelRetry()
    if (!active || paused || !preferences.musicOn || !music || music.paused || !claimed) {
      dispose()
      return
    }
    fadeTo(0, FINAL_DECISION_AUDIO.exitFadeOutMs, dispose)
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
      if (disposed || finishing) return
      stage = value
      if (value === 'complete') {
        // The same element continues under the departure. Its new owner calls
        // finish only when that film hands off, keeping the musical phrase intact.
        cancelAccents()
      }
      if (value !== 'welcome') begun = true
      sync()
    },
    cue(cue) {
      if (disposed || finishing) return
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
    finish,
    dispose,
  }
}
