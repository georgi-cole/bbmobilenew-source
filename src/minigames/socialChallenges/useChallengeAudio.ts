import { useCallback } from 'react'
import { SoundManager } from '../../services/sound/SoundManager'

export type ChallengeGame = 'rps' | 'last-light' | 'abyss'
type ChallengeCue = 'lock' | 'reveal' | 'success' | 'loss' | 'draw' | 'roll' | 'link'

const CUES: Record<ChallengeGame, Record<ChallengeCue, string>> = {
  rps: {
    lock: 'ui:confirm',
    reveal: 'tv:ceremony_impact',
    success: 'minigame:gb_winner',
    loss: 'minigame:gb_death',
    draw: 'minigame:gb_new_turn',
    roll: 'minigame:risk_wheel_spin',
    link: 'minigame:gb_safe_step',
  },
  'last-light': {
    lock: 'ui:confirm',
    reveal: 'minigame:gb_safe_step',
    success: 'tv:winner_reveal',
    loss: 'minigame:cinematic_thunder',
    draw: 'minigame:gb_new_turn',
    roll: 'minigame:risk_wheel_spin',
    link: 'minigame:risk_wheel_good',
  },
  abyss: {
    lock: 'ui:confirm',
    reveal: 'tv:ceremony_impact',
    success: 'minigame:risk_wheel_good',
    loss: 'minigame:gb_death',
    draw: 'minigame:gb_new_turn',
    roll: 'minigame:risk_wheel_spin',
    link: 'minigame:risk_wheel_good',
  },
}

export function useChallengeAudio(game: ChallengeGame): (cue: ChallengeCue) => void {
  return useCallback(
    (cue: ChallengeCue) => {
      SoundManager.play(CUES[game][cue], { volume: cue === 'lock' ? 0.34 : 0.46 })
    },
    [game]
  )
}
