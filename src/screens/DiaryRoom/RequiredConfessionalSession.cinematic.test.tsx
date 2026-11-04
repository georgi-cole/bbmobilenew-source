import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { createInitialGameState } from '../../store/gameSlice'
import RequiredConfessionalSession from './RequiredConfessionalSession'

vi.mock('./RequiredConfessionalDecision', () => ({
  default: ({ onDecisionCommitted }: { onDecisionCommitted: (summary: string) => void }) => (
    <button onClick={() => onDecisionCommitted('Saved a nominee.')}>Commit real decision</button>
  ),
}))
afterEach(cleanup)
function fixture(continueFilm: boolean) {
  const store = configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: createInitialGameState({ seed: 730 }) },
  })
  const router = createMemoryRouter(
    [
      { path: '/game', element: <div>Returned to ceremony</div> },
      {
        path: '/diary-room',
        element: (
          <RequiredConfessionalSession
            decision={{ type: 'pos_save_target', week: 3, phase: 'pos_ceremony_results' }}
            onReturnToGame={() => {}}
            onCinematicDecisionCommitted={() => {
              if (!continueFilm) return false
              void router.navigate('/game')
              return true
            }}
          />
        ),
      },
    ],
    { initialEntries: ['/game', '/diary-room'] }
  )
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  )
  return router
}
describe('required Confessional cinematic navigation', () => {
  it('does not let Back bypass an uncommitted decision', async () => {
    const router = fixture(true)
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.pathname).toBe('/diary-room')
  })
  it('allows a confirmed consequence to return even when another decision follows', async () => {
    const router = fixture(true)
    await act(async () => {
      fireEvent.click(screen.getByText('Commit real decision'))
    })
    expect(router.state.location.pathname).toBe('/game')
  })
  it('keeps an incomplete Use/target sequence locked after a non-returning confirmation', async () => {
    const router = fixture(false)
    fireEvent.click(screen.getByText('Commit real decision'))
    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.location.pathname).toBe('/diary-room')
  })
})
