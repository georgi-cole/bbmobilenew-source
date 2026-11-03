import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { advance, setPhase } from '../../store/gameSlice'
import { isVisibleOnTv } from '../../services/activityService'
import type { GameState, Player } from '../../types'
import {
  createRealityNemesisObjective,
  reconcileNemesisWithVoluntarySafety,
} from '../reality/relationshipAutonomy'
import { createInitialRealityDomainState } from '../reality/state'
import { selectCanonicalRelationshipView } from '../relationshipSemantics'
import { nemesisStoryMiddleware } from '../nemesisStoryMiddleware'
import socialReducer, { commitRealityDomainUpdate } from '../socialSlice'

function makeStore(drama = true) {
  const players: Player[] = [
    { id: 'human', name: 'Quartz', status: 'active', isUser: true, avatar: '🧑' },
    { id: 'echo', name: 'Echo', status: 'active', isUser: false, avatar: '🧑' },
    ...['a', 'b', 'c', 'd'].map(
      (id): Player => ({
        id,
        name: id.toUpperCase(),
        status: 'active',
        isUser: false,
        avatar: '🧑',
      })
    ),
  ]
  const initialGame = gameReducer(undefined, { type: 'init' })
  const initialSocial = socialReducer(undefined, { type: 'init' })
  const reality = createInitialRealityDomainState()
  createRealityNemesisObjective(reality, {
    ownerId: 'echo',
    targetId: 'human',
    sourceEventId: 'private-evaluation',
    reason: 'COMPETITION_THREAT',
    at: { day: 3, phase: 'social_1' },
  })
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: {
      game: {
        ...initialGame,
        season: 1,
        week: 3,
        phase: 'social_1',
        seed: 22,
        mode: 'classic',
        isLive: true,
        players,
        dramaSocialMode: drama,
        tvFeed: [],
        broadcastQueue: [],
        weekendInterlude: null,
      } as GameState,
      social: { ...initialSocial, reality },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }).concat(
        nemesisStoryMiddleware
      ),
  })
}

describe('Nemesis phase-driven delivery', () => {
  it('queues one anonymous clue, then a cause-specific named reveal on a later day', () => {
    const store = makeStore()
    store.dispatch(setPhase('social_2'))
    const clue = store.getState().game.tvFeed.find((event) => event.meta?.nemesisStory === 'clue')
    expect(clue).toBeDefined()
    expect(clue?.text).not.toContain('Echo')
    expect(clue?.meta?.week).toBe(3)
    expect(clue?.meta?.forceOnTv).toBe(true)
    expect(clue && isVisibleOnTv(clue)).toBe(true)
    expect(store.getState().game.broadcastQueue).toContain(clue?.id)

    store.dispatch(setPhase('social_2'))
    expect(
      store.getState().game.tvFeed.filter((event) => event.meta?.nemesisStory === 'clue')
    ).toHaveLength(1)
    store.dispatch(setPhase('week_end'))
    expect(
      store.getState().game.tvFeed.filter((event) => event.meta?.nemesisStory === 'reveal')
    ).toHaveLength(0)

    store.dispatch(advance())
    expect(store.getState().game.week).toBe(4)
    store.dispatch(setPhase('social_1'))
    const reveal = store
      .getState()
      .game.tvFeed.find((event) => event.meta?.nemesisStory === 'reveal')
    expect(reveal).toBeDefined()
    expect(reveal?.text).toContain('Echo')
    expect(reveal?.text).toContain('has turned against you')
    expect(reveal?.text).not.toContain('win power')
    expect(reveal?.meta?.week).toBe(4)
    expect(reveal?.meta?.forceOnTv).toBe(true)
    expect(reveal && isVisibleOnTv(reveal)).toBe(true)

    const social = store.getState().social
    expect(social.reality.events.filter((event) => event.type === 'NEMESIS_REVEALED')).toHaveLength(
      1
    )
    expect(
      social.reality.events.find((event) => event.type === 'NEMESIS_REVEALED')?.reason
    ).toContain('win power')
    expect(
      selectCanonicalRelationshipView({
        reality: social.reality,
        relationships: social.relationships,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(true)
    store.dispatch(setPhase('social_2'))
    expect(
      store.getState().game.tvFeed.filter((event) => event.meta?.nemesisStory === 'reveal')
    ).toHaveLength(1)
  })

  it('delivers a resolved-rivalry epilogue to the same Faux TV without reviving the objective', () => {
    const store = makeStore()
    const reality = structuredClone(store.getState().social.reality)
    reconcileNemesisWithVoluntarySafety(reality, {
      actorId: 'human',
      savedIds: ['echo'],
      eventId: 'real-safety-rescue',
      at: { day: 3, phase: 'pos_ceremony_results' },
    })
    store.dispatch(commitRealityDomainUpdate({ domain: reality, projectAllRelationships: true }))
    store.dispatch(setPhase('social_2'))
    const epilogue = store
      .getState()
      .game.tvFeed.find((event) => event.text.includes('once saw you as a rival'))
    expect(epilogue).toBeDefined()
    expect(epilogue?.text).toContain('Echo')
    expect(epilogue?.meta?.forceOnTv).toBe(true)
    expect(epilogue && isVisibleOnTv(epilogue)).toBe(true)
    expect(
      Object.values(store.getState().social.reality.relationshipAutonomy.nemeses).find(
        (nemesis) => nemesis.ownerId === 'echo' && nemesis.targetId === 'human'
      )?.status
    ).toBe('RECONCILED')
    store.dispatch(setPhase('week_end'))
    expect(
      store.getState().game.tvFeed.filter((event) => event.text.includes('once saw you as a rival'))
    ).toHaveLength(1)
  })

  it('does not create Nemesis scenes when the effective social mode is normal', () => {
    const store = makeStore(false)
    store.dispatch(setPhase('social_2'))
    expect(
      store
        .getState()
        .social.reality.events.some((event) => event.type === 'NEMESIS_ANONYMOUS_CLUE')
    ).toBe(false)
    expect(store.getState().game.tvFeed.some((event) => event.meta?.nemesisStory)).toBe(false)
  })
})
