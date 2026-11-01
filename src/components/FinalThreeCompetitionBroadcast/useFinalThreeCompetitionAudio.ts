import { useEffect, useRef } from 'react'
import { SoundManager, type PlayOptions } from '../../services/sound/SoundManager'
import { useAppSelector } from '../../store/hooks'
import type { CompetitionBroadcastFrame } from './competitionBroadcastSimulation'

type CompetitionAudioFrame = Pick<
  CompetitionBroadcastFrame,
  'kind' | 'phase' | 'eventId' | 'activePlayerId' | 'players'
>

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

const LIVE_ACCENTS = {
  hit: { key: 'minigame:quicktap_tap', options: { volume: 0.13, durationMs: 260, fadeOutMs: 80 } },
  slide: { key: 'ui:risk_wheel_click', options: { volume: 0.08, durationMs: 180, fadeOutMs: 70 } },
  buzz: { key: 'ui:jury_vote', options: { volume: 0.12, durationMs: 250, fadeOutMs: 90 } },
  correct: { key: 'ui:confirm', options: { volume: 0.11, durationMs: 330, fadeOutMs: 110 } },
  wrong: {
    key: 'minigame:risk_wheel_bad',
    options: { volume: 0.1, durationMs: 380, fadeOutMs: 140 },
  },
} as const

function liveAccent(frame?: CompetitionAudioFrame | null) {
  if (!frame?.activePlayerId) return undefined
  if (frame.kind === 'sequence') {
    if (!['correct', 'wrong', 'answer'].includes(frame.phase)) return undefined
    return frame.players.find((player) => player.id === frame.activePlayerId)?.solved
      ? LIVE_ACCENTS.correct
      : LIVE_ACCENTS.slide
  }
  if (frame.phase === 'buzz') return LIVE_ACCENTS.buzz
  if (frame.phase === 'wrong') return LIVE_ACCENTS.wrong
  if (frame.phase === 'correct')
    return frame.kind === 'signal' ? LIVE_ACCENTS.hit : LIVE_ACCENTS.correct
  return undefined
}

/** Add short broadcast accents; the app keeps its continuous Final Three music bed. */
export function useFinalThreeCompetitionAudio(
  sceneId: string,
  stage: string,
  active: boolean,
  replayFrame?: CompetitionAudioFrame | null
): void {
  const sfxOn = useAppSelector((state) => state.settings.audio.sfxOn)
  const played = useRef({ sceneId, stages: new Set<string>() })
  const accent = stage === 'live' ? liveAccent(replayFrame) : ACCENTS[stage]
  const receipt = stage === 'live' ? `live:${replayFrame?.eventId ?? ''}` : stage

  useEffect(() => {
    if (played.current.sceneId !== sceneId) {
      played.current = { sceneId, stages: new Set<string>() }
    }
    if (!accent || !active || !sfxOn || document.hidden || played.current.stages.has(receipt)) {
      return undefined
    }

    const abort = new AbortController()
    // Deferring one microtask prevents Strict Mode's discarded effect from
    // playing an accent or consuming the real effect's one-shot receipt.
    void Promise.resolve().then(() => {
      if (abort.signal.aborted || document.hidden || played.current.sceneId !== sceneId) return
      if (played.current.stages.has(receipt)) return
      played.current.stages.add(receipt)
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
  }, [accent, active, receipt, sceneId, sfxOn])
}
