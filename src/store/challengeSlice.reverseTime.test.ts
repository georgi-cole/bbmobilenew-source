import { describe, expect, it } from 'vitest'
import challengeReducer, {
  hydrateChallenge,
  markPendingChallengeReverseTimeUsed,
  setPendingChallenge,
  type ChallengeState,
  type PendingChallenge,
} from './challengeSlice'

function pendingChallenge(id = 'challenge-reverse-time'): PendingChallenge {
  return {
    id,
    game: {
      key: 'unit-test-game',
      title: 'Unit Test Game',
      scoringAdapter: 'higherBetter',
    },
    seed: 42,
    participants: ['human', 'ai-1'],
    phase: 'playing',
    aiScores: { 'ai-1': 50 },
    prizeType: 'LOH',
    reverseTimeUsed: false,
  } as PendingChallenge
}

describe('challenge Reverse Time persistence', () => {
  it('marks Reverse Time used only for the currently pending challenge', () => {
    let state = challengeReducer(undefined, setPendingChallenge(pendingChallenge()))

    state = challengeReducer(state, markPendingChallengeReverseTimeUsed('different-challenge'))
    expect(state.pending?.reverseTimeUsed).toBe(false)

    state = challengeReducer(
      state,
      markPendingChallengeReverseTimeUsed('challenge-reverse-time')
    )
    expect(state.pending?.reverseTimeUsed).toBe(true)
  })

  it('preserves the consumed flag through challenge hydration', () => {
    const restored = {
      pending: {
        ...pendingChallenge(),
        reverseTimeUsed: true,
      },
      history: [],
      nextNonce: 1,
      debug: {},
    } satisfies ChallengeState

    const state = challengeReducer(undefined, hydrateChallenge(restored))

    expect(state.pending?.reverseTimeUsed).toBe(true)
    expect(state.pending?.phase).toBe('rules')
  })

  it('starts a new pending challenge with its own unused allowance', () => {
    let state = challengeReducer(undefined, setPendingChallenge(pendingChallenge('first')))
    state = challengeReducer(state, markPendingChallengeReverseTimeUsed('first'))
    expect(state.pending?.reverseTimeUsed).toBe(true)

    state = challengeReducer(state, setPendingChallenge(pendingChallenge('second')))
    expect(state.pending?.id).toBe('second')
    expect(state.pending?.reverseTimeUsed).toBe(false)
  })
})
