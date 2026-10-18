import { describe, expect, it } from 'vitest'
import { createInitialGameState, getNominationTargetScore } from '../gameSlice'
import type { GameState, Player } from '../../types'

function prepareSocialThreatState(): {
  state: GameState
  decider: Player
  socialThreat: Player
  ordinaryTarget: Player
} {
  const state = createInitialGameState({ seed: 1907 })
  state.week = 6
  state.dramaSocialMode = false
  state.strategicAlliances = undefined
  const decider = state.players.find((player) => !player.isUser)!
  const [socialThreat, ordinaryTarget] = state.players
    .filter((player) => player.id !== decider.id)
    .slice(0, 2)
  if (!socialThreat || !ordinaryTarget) throw new Error('Expected two elimination candidates')

  for (const player of state.players) {
    player.stats = { lohWins: 0, posWins: 0, timesNominated: 1 }
    player.competitionProfile = undefined
  }
  state.strategicRelationships = {
    [decider.id]: {
      [socialThreat.id]: { affinity: 0, tags: [] },
      [ordinaryTarget.id]: { affinity: 0, tags: [] },
    },
  }
  state.strategicThreatReadsByActorId = {
    [decider.id]: {
      [socialThreat.id]: {
        persuasion: 1,
        networkReach: 1,
        publicRespect: 1,
        juryAppeal: 0.5,
        score: 9,
      },
    },
  }
  return { state, decider, socialThreat, ordinaryTarget }
}

describe('social routes to winning', () => {
  it('lets an AI target witnessed social dominance even without competition wins', () => {
    const { state, decider, socialThreat } = prepareSocialThreatState()

    const socialThreatScore = getNominationTargetScore(state, decider.id, socialThreat)
    const withoutObservedRead = { ...state, strategicThreatReadsByActorId: undefined }
    const baselineScore = getNominationTargetScore(withoutObservedRead, decider.id, socialThreat)

    expect(socialThreatScore - baselineScore).toBe(36)
  })
})
