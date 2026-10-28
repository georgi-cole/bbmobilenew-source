import { describe, expect, it, vi } from 'vitest'
import socialReducer, {
  recordIncomingInteractionDecision,
  recordIncomingInteractionDecisions,
} from '../socialSlice'
import {
  batchIncomingInteractionDecisions,
  logIncomingInteractionDecision,
} from '../incomingInteractionLogging'

describe('ordered incoming decision batches', () => {
  it('matches individual reducer consequences and retention across nested batches', () => {
    const dispatch = vi.fn()
    batchIncomingInteractionDecisions(dispatch, () => {
      for (let i = 0; i < 650; i++) {
        batchIncomingInteractionDecisions(dispatch, () =>
          logIncomingInteractionDecision(dispatch, {
            stage: 'generation',
            actorId: `actor-${i}`,
            reason: 'test',
          })
        )
      }
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    const action = dispatch.mock.calls[0][0] as ReturnType<
      typeof recordIncomingInteractionDecisions
    >
    const individual = action.payload.reduce(
      (state, entry) => socialReducer(state, recordIncomingInteractionDecision(entry)),
      socialReducer(undefined, { type: 'test' })
    )
    expect(socialReducer(undefined, action)).toEqual(individual)
  })
  it('flushes diagnostics and restores normal logging after an exception', () => {
    const dispatch = vi.fn()
    expect(() =>
      batchIncomingInteractionDecisions(dispatch, () => {
        logIncomingInteractionDecision(dispatch, { stage: 'dropped', reason: 'test' })
        throw new Error('stop')
      })
    ).toThrow('stop')
    logIncomingInteractionDecision(dispatch, { stage: 'generation', reason: 'after' })
    expect(dispatch.mock.calls.map(([a]) => a.type)).toEqual([
      recordIncomingInteractionDecisions.type,
      recordIncomingInteractionDecision.type,
    ])
  })
})
