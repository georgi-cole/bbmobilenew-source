import { configureStore } from '@reduxjs/toolkit'
import type { UnknownAction } from 'redux'
import { describe, expect, it } from 'vitest'
import { evictedAiStateRetentionMiddleware } from '../evictedAiStateRetentionMiddleware'
import {
  getEvictedAiIdsReadyForPrivateStatePruning,
  hasEvictedAiPrivateState,
  pruneEvictedAiPrivateState,
  type EvictedAiRetentionGame,
} from '../reality/evictedAiRetention'
import { createInitialRealityDomainState } from '../reality/state'
import type { RealityDomainState } from '../reality/types'
import socialReducer, {
  influenceUpdated,
  replaceRealityDomain,
  setEnergyBankEntry,
  updateSocialMemory,
} from '../socialSlice'

describe('evicted AI private-state retention', () => {
  it('selects only permanent AI evictees after the next game day', () => {
    const game: EvictedAiRetentionGame = {
      week: 4,
      players: [
        { id: 'ready', status: 'evicted', evictedAtWeek: 3 },
        { id: 'same-day', status: 'evicted', evictedAtWeek: 4 },
        { id: 'jury', status: 'jury', evictedAtWeek: 3 },
        { id: 'human', status: 'evicted', isUser: true, evictedAtWeek: 3 },
        { id: 'battle-back', status: 'evicted', evictedAtWeek: 3 },
        { id: 'legacy', status: 'evicted' },
      ],
      battleBack: { candidates: ['battle-back'] },
    }

    expect(getEvictedAiIdsReadyForPrivateStatePruning(game)).toEqual(['ready'])
  })

  it('removes private runtime state but retains the season record and shared history', () => {
    const domain = createInitialRealityDomainState()
    domain.memoriesByOwner.departed = []
    domain.memoriesByOwner.active = []
    domain.beliefsByOwner.departed = {}
    domain.contestants.departed = {} as RealityDomainState['contestants'][string]
    domain.cooldowns.departed = {}
    domain.voteIntents.departed = {} as RealityDomainState['voteIntents'][string]
    domain.reentryProfiles.departed = {} as RealityDomainState['reentryProfiles'][string]
    domain.relationshipAutonomy.intents.owned = {
      ownerId: 'departed',
      targetId: 'active',
    } as RealityDomainState['relationshipAutonomy']['intents'][string]
    domain.relationshipAutonomy.intents.targeted = {
      ownerId: 'active',
      targetId: 'departed',
    } as RealityDomainState['relationshipAutonomy']['intents'][string]
    domain.relationshipAutonomy.intents.retained = {
      ownerId: 'active',
      targetId: 'other',
    } as RealityDomainState['relationshipAutonomy']['intents'][string]
    domain.relationshipAutonomy.nemeses.targeted = {
      ownerId: 'active',
      targetId: 'departed',
    } as RealityDomainState['relationshipAutonomy']['nemeses'][string]
    domain.relationships.departed = { active: {} as never }
    domain.publicPerception.departed = {
      authenticity: 1,
      entertainment: 2,
      likability: 3,
      underdog: 4,
      strategicRespect: 5,
      competitionRespect: 6,
      loyalty: 7,
      controversy: 8,
      fatigue: 9,
      sourceEventIds: ['season-event'],
    }
    domain.events.push({ id: 'season-event' } as never)
    domain.facts['season-fact'] = {} as never

    const result = pruneEvictedAiPrivateState(domain, ['departed'])

    expect(hasEvictedAiPrivateState(domain, ['departed'])).toBe(true)
    expect(hasEvictedAiPrivateState(result, ['departed'])).toBe(false)
    expect(result).not.toBe(domain)
    expect(result.memoriesByOwner).not.toHaveProperty('departed')
    expect(result.beliefsByOwner).not.toHaveProperty('departed')
    expect(result.contestants).not.toHaveProperty('departed')
    expect(result.cooldowns).not.toHaveProperty('departed')
    expect(result.voteIntents).not.toHaveProperty('departed')
    expect(result.reentryProfiles).not.toHaveProperty('departed')
    expect(result.relationshipAutonomy.intents).not.toHaveProperty('owned')
    expect(result.relationshipAutonomy.intents).not.toHaveProperty('targeted')
    expect(result.relationshipAutonomy.intents).toHaveProperty('retained')
    expect(result.relationshipAutonomy.nemeses).not.toHaveProperty('targeted')
    expect(result.relationships.departed).toEqual(domain.relationships.departed)
    expect(result.publicPerception.departed).toEqual(domain.publicPerception.departed)
    expect(result.events).toEqual(domain.events)
    expect(result.facts).toEqual(domain.facts)
    expect(result.memoriesByOwner.active).toBe(domain.memoriesByOwner.active)
  })

  it('does not replace the domain when there is no private state to prune', () => {
    const domain = createInitialRealityDomainState()
    expect(pruneEvictedAiPrivateState(domain, ['already-clean'])).toBe(domain)
  })

  it('prunes after a game-day advance through the store middleware', () => {
    const game: EvictedAiRetentionGame = {
      week: 5,
      players: [{ id: 'departed', status: 'evicted', evictedAtWeek: 4 }],
    }
    const domain = createInitialRealityDomainState()
    domain.memoriesByOwner.departed = []

    const gameReducer = (state = game, action: UnknownAction) =>
      action.type === 'game/advance' ? { ...state, week: state.week + 1 } : state
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(evictedAiStateRetentionMiddleware),
    })
    store.dispatch(replaceRealityDomain(domain))
    store.dispatch(setEnergyBankEntry({ playerId: 'departed', value: 25 }))
    store.dispatch(influenceUpdated({ actorId: 'departed', decisionType: 'vote', weights: {} }))
    store.dispatch(
      updateSocialMemory({ actorId: 'active', targetId: 'departed', deltas: { gratitude: 1 } })
    )
    store.dispatch(
      updateSocialMemory({ actorId: 'active', targetId: 'other', deltas: { gratitude: 1 } })
    )
    store.dispatch(
      updateSocialMemory({ actorId: 'departed', targetId: 'active', deltas: { gratitude: 1 } })
    )

    store.dispatch({ type: 'game/advance' })

    expect(store.getState().game.week).toBe(6)
    expect(store.getState().social.reality.memoriesByOwner).not.toHaveProperty('departed')
    expect(store.getState().social.energyBank).not.toHaveProperty('departed')
    expect(store.getState().social.influenceWeights).not.toHaveProperty('departed')
    expect(store.getState().social.socialMemory).not.toHaveProperty('departed')
    expect(store.getState().social.socialMemory.active).not.toHaveProperty('departed')
    expect(store.getState().social.socialMemory.active).toHaveProperty('other')
  })
})
