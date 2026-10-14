import { describe, expect, it } from 'vitest'
import {
  shouldAutomaticallyAdvanceAfterConfessionalVote,
  type ConfessionalReturnGame,
} from '../confessionalReturnResume'

const returnState = { resumedFromConfessional: true, returnCue: 'live_vote' }

function game(overrides: Partial<ConfessionalReturnGame> = {}): ConfessionalReturnGame {
  return {
    phase: 'live_vote',
    mode: 'classic',
    players: [{ id: 'human', isUser: true, status: 'active' as const }],
    votes: { human: 'nominee' },
    voteResults: null,
    awaitingHumanVote: false,
    awaitingDoubleVoteOffer: false,
    awaitingTieBreak: false,
    awaitingFinal3Eviction: false,
    awaitingVoteDeductionPrompt: false,
    ...overrides,
  }
}

describe('shouldAutomaticallyAdvanceAfterConfessionalVote', () => {
  it('continues the live vote once the human ballot is sealed', () => {
    expect(shouldAutomaticallyAdvanceAfterConfessionalVote(returnState, game(), false)).toBe(true)
  })

  it('waits for the player when a vote or another Confessional decision is still pending', () => {
    expect(
      shouldAutomaticallyAdvanceAfterConfessionalVote(
        returnState,
        game({ awaitingHumanVote: true, votes: {} }),
        false
      )
    ).toBe(false)
    expect(shouldAutomaticallyAdvanceAfterConfessionalVote(returnState, game(), true)).toBe(false)
  })

  it('ignores stale route cues and terminal or already-resolved vote states', () => {
    expect(shouldAutomaticallyAdvanceAfterConfessionalVote(null, game(), false)).toBe(false)
    expect(
      shouldAutomaticallyAdvanceAfterConfessionalVote(
        { resumedFromConfessional: true, returnCue: 'eviction_results' },
        game(),
        false
      )
    ).toBe(false)
    expect(
      shouldAutomaticallyAdvanceAfterConfessionalVote(
        returnState,
        game({ voteResults: { nominee: 3 } }),
        false
      )
    ).toBe(false)
    expect(
      shouldAutomaticallyAdvanceAfterConfessionalVote(returnState, game({ votes: {} }), false)
    ).toBe(false)
  })
})

