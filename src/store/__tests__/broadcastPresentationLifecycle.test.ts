import { describe, expect, it } from 'vitest'
import gameReducer, {
  addTvEvent,
  claimActiveBroadcastEvent,
  claimPresentationEvent,
  consumeBroadcastEvent,
  hydrateGame,
  setPhase,
  syncPhaseBroadcasts,
} from '../gameSlice'
import { createPresentationEventClaim } from '../../broadcasting/fauxTvPresentation'
import type { GameState } from '../../types'
import { store } from '../store'
import { createProfile } from '../profilesSlice'
import { loadSavedRunProfile } from '../saveStatePersistence'

function fixture(): GameState {
  const state = gameReducer(undefined, { type: 'init' })
  return {
    ...state,
    phase: 'social_1',
    tvFeed: [],
    broadcastQueue: [],
    activeBroadcastEventId: null,
  }
}

function addEvent(state: GameState, text: string, order: number): GameState {
  return gameReducer(
    state,
    addTvEvent({
      text,
      type: 'twist',
      meta: { major: 'ambush', broadcastOrder: order, forceOnTv: true },
    })
  )
}

describe('broadcast presentation lifecycle', () => {
  it('delivers runtime reveals in the current phase instead of the template phase', () => {
    const state = addEvent(fixture(), 'The real target is revealed now.', 100)
    const event = state.tvFeed[0]
    expect(event.meta).toMatchObject({
      phase: 'social_1',
      week: state.week,
      gameId: state.gameId,
    })
    expect(state.broadcastQueue).toContain(event.id)
  })

  it('pins an unread card across late arrivals, queue rebuild, and save hydration', () => {
    let state = addEvent(fixture(), 'The first consequence.', 100)
    const firstId = state.tvFeed[0].id
    state = gameReducer(state, claimActiveBroadcastEvent(firstId))
    state = addEvent(state, 'The next result.', 0)
    const secondId = state.tvFeed[0].id
    state = gameReducer(state, syncPhaseBroadcasts({ phase: state.phase }))
    state = gameReducer(state, hydrateGame(JSON.parse(JSON.stringify(state))))
    expect(state.activeBroadcastEventId).toBe(firstId)
    expect(state.broadcastQueue?.slice(0, 2)).toEqual([firstId, secondId])

    state = gameReducer(state, claimActiveBroadcastEvent(secondId))
    expect(state.activeBroadcastEventId).toBe(firstId)
    state = gameReducer(state, consumeBroadcastEvent(firstId))
    expect(state.activeBroadcastEventId).toBeNull()
    expect(state.broadcastQueue?.[0]).toBe(secondId)

    state = gameReducer(state, claimActiveBroadcastEvent(secondId))
    state = gameReducer(state, consumeBroadcastEvent(firstId))
    expect(state.activeBroadcastEventId).toBe(secondId)
    expect(state.tvFeed.find((event) => event.id === secondId)?.meta?.broadcastConsumed).not.toBe(
      true
    )
  })

  it('keeps runtime result copy when its borrowed rules template is synchronized', () => {
    let state = fixture()
    state = gameReducer(state, setPhase('loh_results'))
    state = gameReducer(
      state,
      addTvEvent({
        text: 'Quinn wins the Final 4 competition, but there is no immunity today.',
        type: 'game',
        meta: { major: 'vox_final4_immunity_comp', forceOnTv: true },
      })
    )
    const resultId = state.tvFeed[0].id
    state = gameReducer(state, syncPhaseBroadcasts({ phase: 'loh_results' }))
    const result = state.tvFeed.find((event) => event.id === resultId)
    expect(result?.text).toContain('Quinn wins')
    expect(result?.meta?.broadcastConsumed).not.toBe(true)
    expect(state.broadcastQueue).toContain(resultId)
  })

  it('ignores missing, consumed, and off-phase pin requests', () => {
    let state = addEvent(fixture(), 'An old consequence.', 100)
    const eventId = state.tvFeed[0].id
    state = gameReducer(state, claimActiveBroadcastEvent('missing'))
    expect(state.activeBroadcastEventId).toBeNull()
    state = gameReducer(state, setPhase('live_vote'))
    state = gameReducer(state, claimActiveBroadcastEvent(eventId))
    expect(state.activeBroadcastEventId).toBeNull()
    state = gameReducer(state, setPhase('social_1'))
    state = gameReducer(state, consumeBroadcastEvent(eventId))
    state = gameReducer(state, claimActiveBroadcastEvent(eventId))
    expect(state.activeBroadcastEventId).toBeNull()
  })

  it('persists start claims without acknowledging the unread card or changing game outcomes', () => {
    let state = addEvent(fixture(), 'An unread shock.', 100)
    const event = state.tvFeed[0]
    const claim = createPresentationEventClaim(state.gameId, event)
    const playersBefore = state.players
    state = gameReducer(state, claimPresentationEvent(claim))
    state = gameReducer(state, claimPresentationEvent(claim))
    state = gameReducer(state, claimPresentationEvent({ ...claim, gameId: 'another-run' }))
    expect(state.presentationEventClaims).toEqual([claim])
    expect(state.players).toBe(playersBefore)
    expect(state.tvFeed[0].meta?.broadcastConsumed).not.toBe(true)
    state = gameReducer(state, hydrateGame(JSON.parse(JSON.stringify(state))))
    expect(state.presentationEventClaims).toEqual([claim])
    expect(state.broadcastQueue).toContain(event.id)
  })

  it('writes a presented source and start claim before the trailing autosave window', () => {
    const profileId = 'broadcast-presentation-checkpoint'
    store.dispatch(createProfile({ id: profileId, name: 'Georgi', avatar: 'test-avatar' }))
    store.dispatch(hydrateGame(fixture()))
    store.dispatch(
      addTvEvent({
        text: 'A newly presented shock.',
        type: 'twist',
        meta: { major: 'ambush', forceOnTv: true },
      })
    )
    const event = store.getState().game.tvFeed[0]
    store.dispatch(claimActiveBroadcastEvent(event.id))
    expect(loadSavedRunProfile(profileId).runs.classic?.game.activeBroadcastEventId).toBe(event.id)
    const claim = createPresentationEventClaim(store.getState().game.gameId, event)
    store.dispatch(claimPresentationEvent(claim))
    expect(loadSavedRunProfile(profileId).runs.classic?.game.presentationEventClaims).toEqual([
      claim,
    ])
  })
})
