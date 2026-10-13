import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  recordConfessionalMisconduct,
} from '../../store/gameSlice'
import socialReducer, { replaceRealityDomain } from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'
import { createInitialRealityDomainState, createRealityAlliance } from '../reality'

describe('administrative Confessional removal', () => {
  it('ends the removed player’s active pact without recording betrayal', () => {
    const game = createInitialGameState()
    game.dramaSocialMode = true
    const player = game.players.find((candidate) => candidate.isUser)
    const partner = game.players.find((candidate) => !candidate.isUser)
    expect(player).toBeDefined()
    expect(partner).toBeDefined()
    if (!player || !partner) return

    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'admin-removal-pact',
      founderIds: [player.id, partner.id],
      memberIds: [],
      purpose: 'Work together',
      at: { day: 1, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    let social = socialReducer(undefined, { type: 'test/init' })
    social = socialReducer(social, replaceRealityDomain(reality))

    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      preloadedState: { game, social },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
    })

    const violation = { playerId: player.id, violation: 'profanity' as const }
    store.dispatch(recordConfessionalMisconduct(violation))
    store.dispatch(recordConfessionalMisconduct(violation))
    store.dispatch(recordConfessionalMisconduct(violation))

    const result = store.getState().social.reality.alliances[pact.id]
    expect(result.status).toBe('DISSOLVED')
    expect(result.memberIds).not.toContain(player.id)
    expect(
      store
        .getState()
        .social.reality.events.some(
          (event) => event.type === 'ALLIANCE_MEMBER_EVICTED' && event.targetIds.includes(player.id)
        )
    ).toBe(true)
    expect(
      store
        .getState()
        .social.reality.events.some(
          (event) =>
            event.type === 'ALLIANCE_BETRAYAL' &&
            (event.actorId === player.id || event.targetIds.includes(player.id))
        )
    ).toBe(false)
    expect(store.getState().social.reality.reentryProfiles[player.id]).toBeUndefined()
  })
})
