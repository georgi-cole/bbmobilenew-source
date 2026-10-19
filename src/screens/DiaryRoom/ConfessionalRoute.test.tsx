import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  debugActivateWeekendInterlude,
  openWeekendTribunalStream,
} from '../../store/gameSlice'
import ConfessionalRoute from './ConfessionalRoute'

describe('ConfessionalRoute finale stream', () => {
  it('opens the Tribunal stream and returns to the Final Power Battle beat', () => {
    const store = configureStore({ reducer: { game: gameReducer } })
    store.dispatch(debugActivateWeekendInterlude('tribunal'))
    store.dispatch(openWeekendTribunalStream())
    const router = createMemoryRouter(
      [
        { path: '/game', element: <div>Ready for the Final Power Battle</div> },
        { path: '/diary-room', element: <ConfessionalRoute /> },
      ],
      {
        initialEntries: [
          '/game',
          {
            pathname: '/diary-room',
            search: '?stream=finale-tribunal',
            state: { returnTo: '/game?debug=1&qa=1' },
          },
        ],
      }
    )
    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    )

    expect(screen.getByRole('heading', { name: 'Tribunal Sequester' })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: 'Tribunal conversation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Return to the game' }))
    expect(screen.getByText('Ready for the Final Power Battle')).toBeInTheDocument()
    expect(store.getState().game.weekendInterlude?.stage).toBe('finale_battle_ready')
  })
})
