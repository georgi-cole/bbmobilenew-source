import { act, cleanup, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, expect, it } from 'vitest'
import { store as baseline, type RootState } from '../../../store/store'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  submitPovSaveTarget,
  setReplacementNominee,
  submitVipSecondUseDecision,
} from '../../../store/gameSlice'
import vipReducer, { setDebugVipUnlocked } from '../../../store/vipSlice'
import { replacementPresentationMiddleware } from '../../../cinematic/ceremonies/replacementPresentationMiddleware'
import { useAppSelector } from '../../../store/hooks'
import { useReplacementSequence } from './useReplacementSequence'
import { useSafetyFlow } from './useSafetyFlow'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('does not replay a finished replacement through the native fallback after Double Trouble is declined', () => {
  const initial = structuredClone(baseline.getState())
  initial.settings.gameUX = {
    ...initial.settings.gameUX,
    animations: true,
    animationMode: 'cinematic',
  }
  const store = configureStore({
    reducer: (state: RootState = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
      vip: vipReducer(state.vip, action),
    }),
    middleware: (get) =>
      get({ serializableCheck: false, immutableCheck: false }).concat(
        replacementPresentationMiddleware
      ),
  })
  const game = createInitialGameState({ seed: 730 })
  const human = game.players.find((p) => p.isUser)!
  const [a, b, c] = game.players.filter((p) => !p.isUser)
  store.dispatch(setDebugVipUnlocked(true))
  store.dispatch(
    hydrateGame({
      ...game,
      gameId: 'decline-fallback',
      week: 3,
      phase: 'pos_ceremony_results',
      lohId: human.id,
      posWinnerId: human.id,
      nomineeIds: [a.id, b.id],
      awaitingPovSaveTarget: true,
      specialVeto: { ...game.specialVeto!, activeType: 'vip', vipUseStage: 0 },
    })
  )
  const { result } = renderHook(
    () => {
      const game = useAppSelector((s) => s.game)
      const sequence = useReplacementSequence(game, true)
      const safety = useSafetyFlow({
        game,
        alivePlayers: game.players,
        humanPlayer: game.players.find((p) => p.isUser),
        humanIsHoH: true,
        activeConfessionalDecision: null,
        getTileRect: () => null,
        dispatch: store.dispatch,
        sequenceHandled: sequence.handled,
        sequenceActive: sequence.active,
      })
      return { sequence, safety }
    },
    { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> }
  )
  act(() => {
    store.dispatch(submitPovSaveTarget(b.id))
    store.dispatch(setReplacementNominee(c.id))
  })
  act(() => result.current.sequence.onDone())
  act(() => result.current.sequence.onDone())
  act(() => store.dispatch(submitVipSecondUseDecision(false)))
  expect(result.current.sequence.active).toBe(false)
  expect(result.current.safety.showAiReplacementAnim).toBe(false)
  expect(result.current.safety.pendingSaveCeremony).toBeNull()
  expect(
    store
      .getState()
      .game.tvFeed.some((event) => /not to use Double Trouble a second time/.test(event.text))
  ).toBe(true)
})
