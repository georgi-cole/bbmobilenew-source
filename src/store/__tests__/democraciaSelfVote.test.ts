import { describe, expect, it } from 'vitest'
import gameReducer, { advance, createInitialGameState, submitDemocraciaVote } from '../gameSlice'

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

describe('Democracia ballots', () => {
  it('keeps AI ballots directed at other candidates', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = createInitialGameState({ seed })
      state.phase = 'loh_comp_announcement'
      state.democracia = { ...state.democracia!, active: true, activatedDay: state.week }
      const next = gameReducer(state, advance())
      const votes = Object.entries(next.democracia!.votesByVoterId)
      expect(votes.length).toBeGreaterThan(0)
      for (const [voter, candidate] of votes) expect(candidate).not.toBe(voter)
    }
  })
  it('rejects self-election and records a vote for another candidate exactly once', () => {
    const { state, human } = ballot()
    const next = gameReducer(state, submitDemocraciaVote(human.id))
    expect(next.democracia?.votesByVoterId[human.id]).toBeUndefined()
    expect(next.democracia?.awaitingHumanVote).toBe(true)
    const candidate = state.players.find((p) => !p.isUser)!.id
    const accepted = gameReducer(next, submitDemocraciaVote(candidate))
    expect(accepted.democracia?.votesByVoterId[human.id]).toBe(candidate)
    expect(accepted.democracia?.awaitingHumanVote).toBe(false)
    expect(gameReducer(accepted, submitDemocraciaVote(human.id))).toEqual(accepted)
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
