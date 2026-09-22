import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import finaleReducer, {
  finalizeFinale,
  forceJurorVote,
  skipAllJurorsThunk,
  startFinale,
} from '../finaleSlice'

const publicProfiles = {
  'finalist-a': {
    playerId: 'finalist-a',
    approval: 65,
    previousApproval: 62,
    seasonApprovals: [56, 61, 65],
    completedDirectionCount: 2,
    cumulativePositiveDelta: 12,
  },
  'finalist-b': {
    playerId: 'finalist-b',
    approval: 50,
    previousApproval: 52,
    seasonApprovals: [54, 50],
    completedDirectionCount: 1,
    cumulativePositiveDelta: 6,
  },
}

function startPayload(overrides: Partial<Parameters<typeof startFinale>[0]> = {}) {
  return {
    finalistIds: ['finalist-a', 'finalist-b'],
    jurorIds: ['juror-a'],
    preJuryIds: [],
    humanPlayerIds: [],
    seed: 123,
    ...overrides,
  }
}

describe('finaleSlice', () => {
  it('only includes the public finalist ballot when the feature is enabled', () => {
    let state = finaleReducer(
      undefined,
      startFinale(
        startPayload({
          cfg: { publicFinalVoteEnabled: false },
          publicApprovalProfiles: publicProfiles,
        })
      )
    )
    expect(state.publicJurorEnabled).toBe(false)

    state = finaleReducer(
      undefined,
      startFinale(
        startPayload({ cfg: { publicFinalVoteEnabled: true }, publicApprovalProfiles: publicProfiles })
      )
    )
    expect(state.publicJurorEnabled).toBe(true)
  })

  it('recovers a malformed even Tribunal without a random champion', () => {
    const tied = finaleReducer(
      finaleReducer(
        finaleReducer(
          finaleReducer(
            undefined,
            startFinale(startPayload({ jurorIds: ['juror-a', 'juror-b'] }))
          ),
          forceJurorVote({ jurorId: 'juror-a', finalistId: 'finalist-a' })
        ),
        forceJurorVote({ jurorId: 'juror-b', finalistId: 'finalist-b' })
      ),
      finalizeFinale({ seed: 987 })
    )

    const tiedDifferentSeed = finaleReducer(
      {
        ...tied,
        isComplete: false,
        winnerId: null,
        runnerUpId: null,
        tieBreakUsed: false,
        tieBreakReason: null,
      },
      finalizeFinale({ seed: 1 })
    )

    expect(tied.isComplete).toBe(true)
    expect(tied.tieBreakUsed).toBe(true)
    expect(tied.tieBreakReason).toBe('legacy_recovery')
    expect(tied.winnerId).toBe('finalist-a')
    expect(tiedDifferentSeed.winnerId).toBe(tied.winnerId)
  })

  it('stops Skip All at an uncast human ballot', () => {
    const store = configureStore({ reducer: { finale: finaleReducer } })
    store.dispatch(
      startFinale(
        startPayload({
          jurorIds: ['human-juror'],
          humanPlayerIds: ['human-juror'],
        })
      )
    )

    store.dispatch(skipAllJurorsThunk(['human-juror'], 123) as never)

    const finale = store.getState().finale
    expect(finale.awaitingHumanJurorId).toBe('human-juror')
    expect(finale.votes['human-juror']).toBeUndefined()
    expect(finale.isComplete).toBe(false)
  })
})
