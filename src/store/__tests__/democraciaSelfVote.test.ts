import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, submitDemocraciaVote } from '../gameSlice'

function ballot() {
  const state = createInitialGameState({ seed: 7301 })
  const human = state.players.find((player) => player.isUser)!
  state.phase = 'democracia_vote'
  state.democracia = {
    usedThisSeason: true,
    active: true,
    activatedDay: state.week,
    round: 1,
    candidateIds: state.players.map((player) => player.id),
    eligibleVoterIds: state.players.map((player) => player.id),
    votesByVoterId: {},
    awaitingHumanVote: true,
    awaitingPublicBreaker: false,
    resultDisplay: null,
  }
  return { state, human }
}

describe('Democracia self-election', () => {
  it('records a human candidate voting for themselves exactly once', () => {
    const { state, human } = ballot()
    const next = gameReducer(state, submitDemocraciaVote(human.id))
    expect(next.democracia?.votesByVoterId[human.id]).toBe(human.id)
    expect(next.democracia?.awaitingHumanVote).toBe(false)
    const repeated = gameReducer(
      next,
      submitDemocraciaVote(state.players.find((p) => !p.isUser)!.id)
    )
    expect(repeated.democracia?.votesByVoterId[human.id]).toBe(human.id)
  })

  it('still rejects self-election if the human is not an eligible candidate or voter', () => {
    for (const field of ['candidateIds', 'eligibleVoterIds'] as const) {
      const { state, human } = ballot()
      state.democracia![field] = state.democracia![field].filter((id) => id !== human.id)
      const next = gameReducer(state, submitDemocraciaVote(human.id))
      expect(next.democracia?.votesByVoterId[human.id]).toBeUndefined()
      expect(next.democracia?.awaitingHumanVote).toBe(true)
    }
  })
})
