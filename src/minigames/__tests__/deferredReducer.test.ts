import { configureStore, createSlice } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { createDeferredReducer, registerMinigameReducer } from '../deferredReducer'

describe('deferred minigame reducers', () => {
  it('keeps the idle state shape and can reset retained state before its game loads', () => {
    const idle = { status: 'idle', score: 0 }
    const reducer = createDeferredReducer('unloaded-test-game', idle, 'test/reset')
    const retained = { status: 'complete', score: 42 }
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(idle)
    expect(reducer(retained, { type: 'season/unrelated' })).toBe(retained)
    expect(reducer(retained, { type: 'test/reset' })).toEqual(idle)
  })

  it('activates the real reducer in an existing store without replacing state or subscribers', () => {
    const reducer = createDeferredReducer('loaded-test-game', { score: 0 }, 'test/reset')
    const store = configureStore({
      reducer: { game: reducer },
      preloadedState: { game: { score: 12 } },
    })
    const listener = vi.fn()
    store.subscribe(listener)
    const slice = createSlice({
      name: 'loaded-test-game',
      initialState: { score: 0 },
      reducers: {
        add: (state) => {
          state.score += 5
        },
      },
    })
    registerMinigameReducer('loaded-test-game', slice.reducer)
    store.dispatch(slice.actions.add())
    expect(store.getState().game.score).toBe(17)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('does not import the Famous Figures implementation to initialize the shared store slots', async () => {
    const loadImplementation = vi.fn(() => {
      throw new Error('Game implementation loaded during startup')
    })
    vi.doMock('../../features/famousFigures/famousFiguresSlice', loadImplementation)
    try {
      const { hostedMinigameReducers } = await import('../sessionReducers')
      expect(hostedMinigameReducers.famousFigures(undefined, { type: '@@INIT' }).status).toBe(
        'idle'
      )
      expect(loadImplementation).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('../../features/famousFigures/famousFiguresSlice')
    }
  })

  it('uses the real question bank as soon as its game module is imported', async () => {
    const { hostedMinigameReducers } = await import('../sessionReducers')
    const idle = hostedMinigameReducers.cwgo(undefined, { type: '@@INIT' })
    const { startCwgoCompetition } = await import('../../features/cwgo/cwgoCompetitionSlice')
    const started = hostedMinigameReducers.cwgo(
      idle,
      startCwgoCompetition({
        participantIds: ['human', 'ai'],
        prizeType: 'LOH',
        seed: 42,
      })
    )
    expect(started.questionOrder).toHaveLength(54)
    expect(started.aliveIds).toEqual(['human', 'ai'])
  })
})
