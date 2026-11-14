import { act, cleanup, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, expect, it, vi } from 'vitest'
import { store as baseline, type RootState } from '../../../store/store'
import gameReducer, {
  createInitialGameState,
  hydrateGame,
  submitPovSaveTarget,
  setReplacementNominee,
} from '../../../store/gameSlice'
import vipReducer, { setDebugVipUnlocked } from '../../../store/vipSlice'
import { replacementPresentationMiddleware } from '../../../cinematic/ceremonies/replacementPresentationMiddleware'
import { useAppSelector } from '../../../store/hooks'
import { useReplacementSequence } from './useReplacementSequence'
import { useSafetyFlow } from './useSafetyFlow'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

it('plays the save before the replacement and never schedules the save again in a later phase', () => {
  vi.useFakeTimers()
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
      gameId: 'save-before-replacement',
      status: 'active',
      week: 3,
      phase: 'pos_ceremony_results',
      lohId: human.id,
      posWinnerId: human.id,
      nomineeIds: [a.id, b.id],
      awaitingPovSaveTarget: true,
      specialVeto: { ...game.specialVeto!, activeType: null },
    })
  )
  const useFlow = ({ cinematic }: { cinematic: boolean }) => {
    const game = useAppSelector((s) => s.game)
    const sequence = useReplacementSequence(game, cinematic)
    const safety = useSafetyFlow({
      game,
      alivePlayers: game.players,
      humanPlayer: game.players.find((p) => p.isUser),
      humanIsHoH: true,
      activeConfessionalDecision: null,
      getTileRect: () => new DOMRect(10, 10, 80, 100),
      dispatch: store.dispatch,
      sequenceHandled: sequence.handled,
      sequenceActive: sequence.active,
      saveHandledBySequence: sequence.presentedSaveIds.includes(game.povSavedId ?? ''),
    })
    return { sequence, safety }
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const view = renderHook(useFlow, { wrapper, initialProps: { cinematic: true } })
  act(() => {
    store.dispatch(submitPovSaveTarget(b.id))
    store.dispatch(setReplacementNominee(c.id))
  })
  expect(view.result.current.sequence.playing?.actionHistory.map((a) => a.kind)).toEqual(['save'])
  act(() => view.result.current.sequence.onDone())
  expect(view.result.current.sequence.presentedSaveIds).toContain(b.id)
  expect(view.result.current.sequence.playing?.actionHistory.map((a) => a.kind)).toEqual([
    'replacement',
  ])
  act(() => view.result.current.sequence.onDone())
  view.rerender({ cinematic: false })
  act(() => vi.runOnlyPendingTimers())
  expect(view.result.current.safety.pendingSaveCeremony).toBeNull()
  expect(view.result.current.safety.awaitingSaveCeremony).toBe(false)
  act(() => {
    store.dispatch(hydrateGame({ ...store.getState().game, phase: 'live_vote' }))
    vi.runOnlyPendingTimers()
  })
  expect(view.result.current.safety.pendingSaveCeremony).toBeNull()
  expect(view.result.current.safety.awaitingSaveCeremony).toBe(false)
  view.unmount()
  const restored = renderHook(useFlow, { wrapper, initialProps: { cinematic: false } })
  act(() => vi.runOnlyPendingTimers())
  expect(restored.result.current.safety.pendingSaveCeremony).toBeNull()
})
