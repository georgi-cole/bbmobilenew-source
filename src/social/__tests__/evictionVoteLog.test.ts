import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, setPhase } from '../../store/gameSlice'
import socialReducer from '../socialSlice'
import { socialMiddleware } from '../socialMiddleware'

function makeStore(
  voteResults: Record<string, number>,
  options: { voteResultsMode?: 'house' | 'public'; awaitingTieBreak?: boolean } = {}
) {
  const game = createInitialGameState({ seed: 424242 })
  const playerIds = ['remy', 'rae', 'kai']
  game.players = game.players.slice(0, playerIds.length).map((player, index) => ({
    ...player,
    id: playerIds[index],
    name: ['Remy', 'Rae', 'Kai'][index],
    status: 'active' as const,
  }))
  Object.assign(game, {
    week: 5,
    phase: 'live_vote',
    nomineeIds: Object.keys(voteResults),
    voteResults,
    voteResultsMode: options.voteResultsMode ?? 'house',
    pendingEviction: { evicteeId: 'remy', evictionMessage: 'Remy has been eliminated.' },
    awaitingTieBreak: options.awaitingTieBreak ?? false,
  })

  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    preloadedState: { game, social: socialReducer(undefined, { type: 'init' }) },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(socialMiddleware),
  })
}

describe('socialMiddleware eviction vote log', () => {
  it('saves named house vote totals and the eliminated player in the main game log', () => {
    const store = makeStore({ remy: 9, rae: 2 })

    store.dispatch(setPhase('eviction_results'))

    const voteEvent = store
      .getState()
      .game.tvFeed.find((event) => event.meta?.evictionVoteResults === true)
    expect(voteEvent).toMatchObject({
      text: 'Vote results: Remy 9, Rae 2. Remy was eliminated.',
      type: 'vote',
      channels: ['mainLog'],
      meta: {
        week: 5,
        phase: 'eviction_results',
        voteCounts: { remy: 9, rae: 2 },
      },
    })
  })

  it('keeps a zero-vote nominee visible in a shutout result', () => {
    const store = makeStore({ remy: 11, rae: 0 })

    store.dispatch(setPhase('eviction_results'))

    expect(store.getState().game.tvFeed[0]?.text).toBe(
      'Vote results: Remy 11, Rae 0. Remy was eliminated.'
    )
  })

  it('records tied tallies while a tie-break is still pending', () => {
    const store = makeStore({ remy: 5, rae: 5 }, { awaitingTieBreak: true })

    store.dispatch(setPhase('eviction_results'))

    expect(store.getState().game.tvFeed[0]?.text).toBe(
      'Vote results: Rae 5, Remy 5. The vote is tied between Rae and Remy.'
    )
  })

  it('lists every nominee when more than two receive votes', () => {
    const store = makeStore({ remy: 5, rae: 3, kai: 1 })

    store.dispatch(setPhase('eviction_results'))

    expect(store.getState().game.tvFeed[0]?.text).toBe(
      'Vote results: Remy 5, Rae 3, Kai 1. Remy was eliminated.'
    )
  })

  it('labels audience percentages as percentages instead of house vote counts', () => {
    const store = makeStore({ remy: 55.25, rae: 44.75 }, { voteResultsMode: 'public' })

    store.dispatch(setPhase('eviction_results'))

    expect(store.getState().game.tvFeed[0]?.text).toBe(
      'Audience vote: Remy 55.3%, Rae 44.8%. Remy was eliminated.'
    )
  })
})
