import { configureStore, createAction } from '@reduxjs/toolkit'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it } from 'vitest'
import { store as baseline } from '../../store/store'
import uiReducer from '../../store/uiSlice'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import TribunalHighlights from './TribunalHighlights'
import { buildTribunalHighlight } from '../../features/tribunal/tribunalHighlights'
import type { GameState } from '../../types'

afterEach(cleanup)

it('owns the room music only while the highlights surface is mounted', () => {
  const initial = { ...baseline.getState(), game: createTribunalScenario() }
  const store = configureStore({
    reducer: (state = initial, action) => ({ ...state, ui: uiReducer(state.ui, action) }),
  })
  const { unmount } = render(
    <Provider store={store}>
      <MemoryRouter>
        <TribunalHighlights />
      </MemoryRouter>
    </Provider>
  )
  expect(store.getState().ui.tribunalHighlightsOpen).toBe(true)
  unmount()
  expect(store.getState().ui.tribunalHighlightsOpen).toBe(false)
})

it('retains roster positions and crosses out departures while updating the active count', () => {
  const advance = createAction<GameState>('test/advance')
  const game = createTribunalScenario('double')
  const initial = { ...baseline.getState(), game }
  const store = configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: advance.match(action) ? action.payload : state.game,
      ui: uiReducer(state.ui, action),
    }),
  })
  render(
    <Provider store={store}>
      <MemoryRouter>
        <TribunalHighlights />
      </MemoryRouter>
    </Provider>
  )
  const roster = screen.getByRole('region', { name: 'Still in the Hub' })
  const originalTiles = [...roster.querySelectorAll('.tribunal-highlights__roster-player')]
  expect(originalTiles).toHaveLength(6)
  const departure = game.players.find((player) => player.id === game.pendingEviction!.evicteeId)!
  const next = structuredClone(game)
  next.players.find((player) => player.id === departure.id)!.status = 'jury'
  next.tribunalHighlights = [buildTribunalHighlight(game, [departure.id])]
  act(() => {
    store.dispatch(advance(next))
  })
  expect([...roster.querySelectorAll('.tribunal-highlights__roster-player')]).toEqual(originalTiles)
  expect(
    within(roster).getByRole('img', { name: `${departure.name} eliminated` })
  ).toBeInTheDocument()
  expect(roster.querySelector('.tribunal-highlights__section-label strong')).toHaveTextContent('5')
})
