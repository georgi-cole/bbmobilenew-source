import { describe, expect, it } from 'vitest'
import { createInitialRealityDomainState } from '../../src/social/reality'
import { socialMiddleware } from '../../src/social/socialMiddleware'

describe('socialMiddleware alliance Safety consequences', () => {
  it('routes a completed Safety decline through one canonical ceremony', () => {
    let state = {
      game: {
        gameId: 'safety-alliance-test',
        seed: 7,
        phase: 'pos_ceremony_results',
        week: 4,
        mode: 'classic',
        publicModeEnabled: false,
        lohId: 'loh',
        prevHohId: null,
        posWinnerId: 'holder',
        povSavedId: null,
        nomineeIds: ['ally'],
        awaitingPovDecision: true,
        awaitingPovSaveTarget: false,
        dramaSocialMode: true,
        players: [
          { id: 'loh', name: 'LOH', status: 'loh' },
          { id: 'holder', name: 'Holder', status: 'pos' },
          { id: 'ally', name: 'Ally', status: 'nominated' },
        ],
      },
      social: {
        commitments: [],
        incomingInteractions: [],
        scheduledIncomingInteractions: [],
        relationships: {
          holder: {
            ally: { affinity: 65, tags: ['alliance'] },
          },
          ally: {
            holder: { affinity: 65, tags: ['alliance'] },
          },
        },
        reality: createInitialRealityDomainState(),
      },
    }
    const dispatched: Array<{ type?: string; payload?: Record<string, unknown> }> = []
    const api = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action as { type?: string; payload?: Record<string, unknown> })
        return action
      },
    }

    const invoke = socialMiddleware(api as never)((action: unknown) => {
      state = { ...state, game: { ...state.game, awaitingPovDecision: false } }
      return action
    })
    invoke({ type: 'game/submitPovDecision', payload: false })

    const ceremonies = dispatched.filter((action) => action.type === 'social/recordRealityCeremony')
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].payload).toMatchObject({
      actorId: 'holder',
      targetIds: ['ally'],
      kind: 'SAFETY_DECLINED',
      safetyEligibleTargetIds: ['ally'],
      day: 4,
      phase: 'pos_ceremony_results',
    })
    expect(
      dispatched.some((action) => action.type === 'social/recordRealityAllianceBetrayal')
    ).toBe(false)
    expect(dispatched.some((action) => action.type === 'social/updateRelationship')).toBe(false)
  })
})
