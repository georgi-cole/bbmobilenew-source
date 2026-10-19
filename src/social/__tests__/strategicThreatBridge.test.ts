import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { advance, createInitialGameState } from '../../store/gameSlice'
import socialReducer from '../socialSlice'
import { appendRealityEvent } from '../reality/events'
import { createInitialRealityDomainState } from '../reality/state'
import { socialMiddleware } from '../socialMiddleware'
import type { SocialState } from '../types'

describe('strategic threat bridge', () => {
  it('syncs witnessed social influence into the game before AI decisions run', () => {
    const game = createInitialGameState({ seed: 91 })
    const social = {
      ...(socialReducer(undefined, { type: 'test/init' }) as SocialState),
      reality: createInitialRealityDomainState(),
    }
    const observer = game.players.find((player) => !player.isUser)!
    const candidate = game.players.find((player) => player.id !== observer.id)!
    const target = game.players.find(
      (player) => player.id !== observer.id && player.id !== candidate.id
    )!
    appendRealityEvent(social.reality, {
      day: game.week,
      phase: 'social_1',
      type: 'SOCIAL_INTERACTION_RESOLVED',
      actorId: candidate.id,
      targetIds: [target.id],
      participantIds: [candidate.id, target.id],
      witnessIds: [],
      visibility: 'HOUSE_PUBLIC',
      outcome: 'SUCCESS',
      reason: 'The target agreed to the plan.',
      tags: ['PERSUADE', 'ACCEPTED'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })

    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      preloadedState: { game, social },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
    })

    store.dispatch(advance())

    expect(
      store.getState().game.strategicThreatReadsByActorId?.[observer.id]?.[candidate.id]?.persuasion
    ).toBeGreaterThan(0)
  })
})
