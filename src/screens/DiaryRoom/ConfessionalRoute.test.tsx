import { configureStore, type Middleware } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  createInitialGameState,
  debugActivateWeekendInterlude,
  hydrateGame,
  openWeekendTribunalStream,
} from '../../store/gameSlice'
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { missionPowerMiddleware } from '../../store/missionPowerMiddleware'
import { selectAdvanceEnabled } from '../../store/selectors'
import settingsReducer from '../../store/settingsSlice'
import socialReducer from '../../social/socialSlice'
import uiReducer from '../../store/uiSlice'
import { useSafetyFlow } from '../GameScreen/flows/useSafetyFlow'
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

function SafetyHub() {
  const game = useAppSelector((state) => state.game)
  const decision = useAppSelector(selectActiveConfessionalDecision)
  const canAdvance = useAppSelector(selectAdvanceEnabled)
  const dispatch = useAppDispatch()
  const { showPovSaveModal } = useSafetyFlow({
    game,
    alivePlayers: game.players,
    humanPlayer: game.players.find((player) => player.isUser),
    humanIsHoH: true,
    activeConfessionalDecision: decision,
    getTileRect: () => null,
    dispatch,
  })
  return (
    <>
      {showPovSaveModal && <p>Choose a save target in the Hub</p>}
      <button disabled={!canAdvance} onClick={() => dispatch(advance())}>
        Continue ceremony
      </button>
    </>
  )
}

it('returns to the standard ceremony after sealing a Safety target and applies that save once', () => {
  const initial = createInitialGameState({ seed: 730 })
  const holder = initial.players.find((player) => player.isUser)!
  const [nominee, otherNominee] = initial.players.filter((player) => !player.isUser)
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      social: socialReducer,
      ui: uiReducer,
    },
    middleware: (getDefault) => getDefault().concat(missionPowerMiddleware as Middleware),
  })
  store.dispatch(
    hydrateGame({
      ...initial,
      week: 3,
      phase: 'pos_ceremony_results',
      status: 'active',
      lohId: holder.id,
      posWinnerId: holder.id,
      nomineeIds: [nominee.id, otherNominee.id],
      awaitingPovSaveTarget: true,
      secretMission: undefined,
      specialVeto: { ...initial.specialVeto!, activeType: null },
    })
  )
  const router = createMemoryRouter(
    [
      { path: '/game', element: <SafetyHub /> },
      { path: '/diary-room', element: <ConfessionalRoute /> },
    ],
    { initialEntries: ['/diary-room'] }
  )
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  )

  expect(screen.queryByRole('button', { name: 'Return to the Hub' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: nominee.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save target' }))

  expect(store.getState().game.missionPowers?.safetyIntent?.targetId).toBe(nominee.id)
  expect(store.getState().game.nomineeIds).toContain(nominee.id)
  expect(screen.getByText(`Intends to save ${nominee.name}.`)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return to the Hub' }))

  expect(screen.queryByText('Choose a save target in the Hub')).not.toBeInTheDocument()
  const continueCeremony = screen.getByRole('button', { name: 'Continue ceremony' })
  expect(continueCeremony).toBeEnabled()
  fireEvent.click(continueCeremony)

  expect(store.getState().game.missionPowers?.safetyIntent).toBeUndefined()
  expect(store.getState().game.nomineeIds).toEqual([otherNominee.id])
  expect(store.getState().game.povSavedId).toBe(nominee.id)
  expect(continueCeremony).toBeDisabled()
})
