import { useEffect, useRef } from 'react'
import { SoundManager, type PlayOptions } from '../../services/sound/SoundManager'
import { useAppSelector } from '../../store/hooks'

const ACCENTS: Record<string, { key: string; options: Omit<PlayOptions, 'signal'> }> = {
  establish: {
    key: 'tv:live_vote',
    options: { volume: 0.12, durationMs: 1100, fadeInMs: 120, fadeOutMs: 450 },
  },
  lock: {
    key: 'tv:voting_eviction',
    options: { volume: 0.16, durationMs: 1600, fadeInMs: 120, fadeOutMs: 500 },
  },
  verdict: {
    key: 'tv:winner_reveal',
    options: { volume: 0.13, durationMs: 2200, fadeInMs: 80, fadeOutMs: 700 },
  },
}

/** Add short broadcast accents; the app keeps its continuous Final Three music bed. */
export function useFinalThreeCompetitionAudio(
  sceneId: string,
  stage: string,
  active: boolean
): void {
  const sfxOn = useAppSelector((state) => state.settings.audio.sfxOn)
  const played = useRef({ sceneId, stages: new Set<string>() })

  useEffect(() => {
    if (played.current.sceneId !== sceneId) {
      played.current = { sceneId, stages: new Set<string>() }
    }
    const accent = ACCENTS[stage]
    if (!accent || !active || !sfxOn || document.hidden || played.current.stages.has(stage)) {
      return undefined
    }

    const abort = new AbortController()
    // Deferring one microtask prevents Strict Mode's discarded effect from
    // playing an accent or consuming the real effect's one-shot receipt.
    void Promise.resolve().then(() => {
      if (abort.signal.aborted || document.hidden || played.current.sceneId !== sceneId) return
      if (played.current.stages.has(stage)) return
      played.current.stages.add(stage)
      void SoundManager.play(accent.key, { ...accent.options, signal: abort.signal }).catch(
        () => {}
      )
    })
    const hide = () => {
      if (document.hidden) abort.abort()
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      abort.abort()
      document.removeEventListener('visibilitychange', hide)
    }
  }, [active, sceneId, sfxOn, stage])
}
