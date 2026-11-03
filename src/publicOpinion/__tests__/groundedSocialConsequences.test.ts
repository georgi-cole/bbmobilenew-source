import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { computeSocialAudienceStoryReactions } from '../AudienceStoryService'
import type { SocialActionLogEntry } from '../../social/types'
import type { RealitySocialEvent } from '../../social/reality/types'
import publicReducer, { hydratePublicOpinion } from '../publicOpinionSlice'
import { publicOpinionMiddleware } from '../publicOpinionMiddleware'
import socialReducer, { recordSocialAction, replaceRealityDomain } from '../../social/socialSlice'
import { createInitialRealityDomainState } from '../../social/reality/state'

function log(
  actionId = 'public_callout',
  overrides: Partial<SocialActionLogEntry> = {}
): SocialActionLogEntry {
  return {
    id: 'action',
    actorId: 'a',
    targetId: 'b',
    actionId,
    visibility: 'HOUSE_PUBLIC',
    outcome: 'success',
    cost: 1,
    newEnergy: 5,
    delta: -4,
    timestamp: 10,
    week: 3,
    phase: 'social_1',
    source: 'manual',
    ...overrides,
  }
}
function harm(overrides: Partial<RealitySocialEvent> = {}): RealitySocialEvent {
  return {
    id: 'harm',
    sequence: 1,
    day: 3,
    phase: 'social_1',
    type: 'SOCIAL_ACTION',
    actionId: 'startFight',
    actorId: 'b',
    targetIds: ['a'],
    participantIds: ['b', 'a'],
    witnessIds: ['c'],
    visibility: 'HOUSE_PUBLIC',
    outcome: 'SUCCESS',
    reason: 'recorded public incident',
    tags: [],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: true,
    juryEligible: true,
    ...overrides,
  }
}
function reactions(
  entry: SocialActionLogEntry,
  realityEvents: RealitySocialEvent[] = [],
  actionHistory = [entry],
  approval = 50
) {
  return computeSocialAudienceStoryReactions({
    entry,
    profiles: {
      b: {
        playerId: 'b',
        approval,
        previousApproval: approval,
        seasonApprovals: [approval],
        completedDirectionCount: 0,
        cumulativePositiveDelta: 0,
      },
    },
    realityEvents,
    actionHistory,
    week: 3,
  })
}

describe('grounded public social consequences', () => {
  it('distinguishes a grounded boundary from attacking a disliked person without evidence', () => {
    for (const approval of [10, 90]) {
      const entry = log()
      expect(
        reactions(entry, [harm()], [entry], approval).some(
          (r) => r.reason === 'audience_grounded_boundary'
        )
      ).toBe(true)
      const unsupported = reactions(entry, [], [entry], approval)
      expect(unsupported.some((r) => r.playerId === 'a' && r.delta > 0)).toBe(false)
      expect(unsupported.some((r) => r.reason === 'audience_unsupported_attack')).toBe(true)
    }
  })
  it('keeps private scenes private and requires matching source provenance', () => {
    const entry = log()
    expect(
      reactions(entry, [harm({ visibility: 'PAIR_ONLY', publicEligible: false })]).some(
        (r) => r.reason === 'audience_grounded_boundary'
      )
    ).toBe(false)
    expect(reactions({ ...entry, visibility: 'PAIR_ONLY' })).toEqual([])
    expect(reactions({ ...entry, realityEventId: 'missing' }, [harm()])).toEqual([])
    expect(reactions({ ...entry, realityEventId: 'harm' }, [harm()])).toEqual([])
  })
  it('does not reward escalation even when the grievance is grounded', () => {
    const result = reactions(log('startFight'), [harm()])
    expect(result.some((r) => r.playerId === 'a' && r.delta > 0)).toBe(false)
    expect(result.some((r) => r.reason === 'audience_escalation_cost')).toBe(true)
  })
  it('does not treat misconduct toward someone else as a grounded callout or repair', () => {
    const unrelatedHarm = harm({ targetIds: ['c'], participantIds: ['b', 'c'] })
    const callout = reactions(log(), [unrelatedHarm], [log()], 90)
    expect(callout.some((r) => r.reason === 'audience_grounded_boundary')).toBe(false)
    expect(callout.some((r) => r.reason === 'fan_favorite_backlash')).toBe(true)

    const apology = log('apologize', { delta: 4 })
    const apologyReactions = reactions(apology, [harm({ actorId: 'a', targetIds: ['c'] })])
    expect(apologyReactions.some((r) => r.reason === 'audience_accountable_repair')).toBe(false)
  })
  it('recognizes pile-ons against unpopular people without a villain-callout farm', () => {
    const history = [
      log('public_callout', { actorId: 'x', id: 'x' }),
      log('startFight', { actorId: 'y', id: 'y' }),
      log(),
    ]
    const result = reactions(history[2], [], history, 10)
    expect(result.some((r) => r.playerId === 'a' && r.delta > 0)).toBe(false)
    expect(result.some((r) => r.reason === 'audience_underdog_rally')).toBe(true)
  })
  it('caps accountable repair and public warmth instead of paying apology cycles', () => {
    const entry = log('apologize', { delta: 4 })
    const ownHarm = harm({ actorId: 'a', targetIds: ['b'] })
    expect(
      reactions(entry, [ownHarm])
        .filter((r) => r.playerId === 'a' && r.delta > 0)
        .reduce((sum, r) => sum + r.delta, 0)
    ).toBe(1)
    expect(
      reactions(entry, [ownHarm], [entry, { ...entry, id: 'second', timestamp: 11 }]).some(
        (r) => r.playerId === 'a' && r.delta > 0
      )
    ).toBe(false)
    const warmth = log('compliment', { delta: 5 })
    expect(
      reactions(
        warmth,
        [],
        Array.from({ length: 4 }, (_, i) => ({ ...warmth, id: String(i) }))
      ).some((r) => r.playerId === 'a' && r.delta > 0)
    ).toBe(false)
  })
  it('applies the same contract to AI and human sources', () => {
    expect(reactions(log('public_callout', { source: 'manual' }), [harm()])).toEqual(
      reactions(log('public_callout', { source: 'system' }), [harm()])
    )
  })
  it('requires a public factual source for exposure credit', () => {
    const entry = log('expose_secret', { realityEventId: 'exposure' })
    const source = harm({
      id: 'exposure',
      actorId: 'a',
      actionId: 'expose_secret',
      targetIds: ['b'],
      relatedFactIds: ['verified'],
    })
    expect(
      reactions(entry, [source]).some((r) => r.reason === 'audience_substantiated_exposure')
    ).toBe(true)
    expect(
      reactions(entry, [{ ...source, relatedFactIds: [] }]).some(
        (r) => r.reason === 'audience_substantiated_exposure'
      )
    ).toBe(false)
  })
})

describe('persisted audience story receipts', () => {
  function setup(publicModeEnabled = true) {
    const game = {
      mode: 'classic',
      phase: 'social_1',
      week: 3,
      seed: 42,
      publicModeEnabled,
      voxPopuli: { status: 'active' },
      nomineeIds: [],
      players: ['a', 'b', 'c'].map((id) => ({ id, name: id, status: 'active', avatar: 'x' })),
    }
    const store = configureStore({
      reducer: {
        game: (state: typeof game = game): typeof game => state,
        social: socialReducer,
        publicOpinion: publicReducer,
      },
      middleware: (getDefault) => getDefault().concat(publicOpinionMiddleware),
    })
    const domain = createInitialRealityDomainState()
    domain.events.push(harm())
    store.dispatch(replaceRealityDomain(domain))
    return store
  }
  it.each([true, false])(
    'applies once across duplicate logs and save/load (meter=%s)',
    (visible) => {
      const store = setup(visible),
        entry = log()
      store.dispatch(recordSocialAction({ entry }))
      const applied = JSON.stringify(store.getState().publicOpinion.profiles)
      const saved = JSON.parse(JSON.stringify(store.getState().publicOpinion))
      store.dispatch(recordSocialAction({ entry }))
      expect(JSON.stringify(store.getState().publicOpinion.profiles)).toBe(applied)
      const restored = setup(visible)
      restored.dispatch(hydratePublicOpinion(saved))
      restored.dispatch(recordSocialAction({ entry }))
      expect(JSON.stringify(restored.getState().publicOpinion.profiles)).toBe(applied)
      expect(restored.getState().publicOpinion.directions).toEqual([])
      expect(restored.getState().game.voxPopuli.status).toBe('active')
    }
  )
})
