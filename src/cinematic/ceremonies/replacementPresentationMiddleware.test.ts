import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import {
  replacementPresentationMiddleware,
  getReplacementFilmPresentation,
  getReplacementPresentation,
} from './replacementPresentationMiddleware'

const initial = {
  gameId: 'run',
  week: 2,
  season: 1,
  phase: 'pos_comp',
  mode: 'classic',
  nomineeIds: ['a', 'b'],
  players: ['a', 'b', 'c', 'loh', 'pos'].map((id) => ({ id, status: 'active' })),
  lohId: 'loh',
  posWinnerId: 'pos',
} as unknown as GameState
const create = () =>
  configureStore({
    reducer: {
      game: (state = initial, action: { type: string; payload?: Partial<GameState> }) =>
        action.type === 'fixture' ? { ...state, ...action.payload } : state,
    },
    middleware: (getDefault) => getDefault().concat(replacementPresentationMiddleware),
  })
describe('store-scoped committed replacement tracking', () => {
  it('survives Confessional-like UI unmounts and repeated unrelated actions without changing identity', () => {
    const store = create()
    store.dispatch({
      type: 'fixture',
      payload: { phase: 'pos_ceremony_results' },
    })
    expect(getReplacementPresentation(store.getState().game)).toBeNull()
    store.dispatch({ type: 'fixture', payload: { nomineeIds: ['a', 'c'] } })
    const first = getReplacementPresentation(store.getState().game)
    expect(first?.replacementIds).toEqual(['c'])
    store.dispatch({ type: 'unrelated' })
    expect(getReplacementPresentation(store.getState().game)?.eventKey).toBe(first?.eventKey)
    store.dispatch({ type: 'fixture', payload: { seed: 99 } })
    expect(getReplacementPresentation(store.getState().game)?.eventKey).toBe(first?.eventKey)
  })
  it('does not bleed across stores or new seasons', () => {
    const first = create(),
      second = create()
    first.dispatch({
      type: 'fixture',
      payload: { phase: 'pos_ceremony_results', nomineeIds: ['a', 'c'] },
    })
    expect(getReplacementPresentation(second.getState().game)).toBeNull()
    first.dispatch({ type: 'fixture', payload: { gameId: 'new', nomineeIds: ['a', 'b'] } })
    expect(getReplacementPresentation(first.getState().game)).toBeNull()
  })
  it('does not claim restored committed blocks as a new outcome', () => {
    const store = create()
    store.dispatch({
      type: 'fixture',
      payload: { gameId: 'restored', phase: 'pos_ceremony_results', nomineeIds: ['a', 'c'] },
    })
    expect(getReplacementPresentation(store.getState().game)).toBeNull()
  })

  it('keeps an executed Ambush with its director and out of the generic replacement film', () => {
    const store = create()
    store.dispatch({
      type: 'fixture',
      payload: {
        phase: 'pos_ceremony_results',
        lohNominationPlan: { strategy: 'backdoor', targetId: 'c', status: 'executed' },
      },
    })
    store.dispatch({ type: 'fixture', payload: { nomineeIds: ['a', 'c'] } })
    expect(getReplacementPresentation(store.getState().game)?.owner).toBe('ambush')
    expect(getReplacementFilmPresentation(store.getState().game)).toBeNull()
  })
})
