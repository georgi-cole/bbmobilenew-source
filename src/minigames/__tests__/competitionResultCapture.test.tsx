import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PressurePlank from '../../components/PressurePlank/PressurePlank'
import MemoryColorsComp from '../../components/MemoryColorsComp/MemoryColorsComp'
import gameReducer, { createInitialGameState } from '../../store/gameSlice'
import memoryColorsReducer, {
  beginInput,
  endRunAfterRoundCleared,
  recordInput,
} from '../../features/memoryColors/memoryColorsSlice'
import { store as baseline, type RootState } from '../../store/store'
import { CompetitionResultContext } from '../competitionResultContext'

vi.mock('../../i18n', () => ({ useTranslate: () => (key: string) => key }))
vi.mock('../../hooks/useSound', () => ({ default: () => ({ play: vi.fn() }) }))
vi.mock('../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}))

function makeStore() {
  const game = createInitialGameState({ seed: 993, seasonArchives: [] })
  game.phase = 'loh_comp'
  game.lohId = null
  game.players = game.players.slice(0, 3)
  const root: RootState = { ...structuredClone(baseline.getState()), game }
  return configureStore({
    reducer: (state: RootState = root, action): RootState => ({
      ...state,
      game: gameReducer(state.game, action),
      memoryColors: memoryColorsReducer(state.memoryColors, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
  })
}
const participantsFor = (store: ReturnType<typeof makeStore>) =>
  store.getState().game.players.map((player, index) => ({
    id: player.id,
    name: player.name,
    isHuman: Boolean(player.isUser),
    precomputedScore: 80 - index * 10,
    previousPR: null,
  }))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('real game result readiness', () => {
  it('checkpoints the actual Pressure Plank winner while its own Continue is still untouched', async () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const store = makeStore()
    const participants = participantsFor(store)
    const checkpoint = vi.fn(async () => true)
    const onFinish = vi.fn()
    const { container } = render(
      <Provider store={store}>
        <CompetitionResultContext.Provider value={checkpoint}>
          <PressurePlank
            autoStart
            participants={participants}
            participantIds={participants.map((player) => player.id)}
            onFinish={onFinish}
          />
        </CompetitionResultContext.Provider>
      </Provider>
    )
    for (let index = 0; index < 3; index++)
      await act(async () => {
        vi.advanceTimersByTime(0)
      })
    expect(frame).toBeDefined()
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    await act(async () => {
      frame!(performance.now())
    })
    expect(checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        rawValue: 120,
        partial: false,
        completion: expect.objectContaining({
          authoritativeWinnerId: participants[0].id,
          rawResults: expect.objectContaining({ [participants[0].id]: 120 }),
        }),
      })
    )
    expect(onFinish).not.toHaveBeenCalled()
    expect(store.getState().game.lohId).toBeNull()
    fireEvent.click(container.querySelector<HTMLButtonElement>('.pp__continue')!)
    expect(onFinish).toHaveBeenCalledWith(
      120,
      undefined,
      expect.objectContaining({ authoritativeWinnerId: participants[0].id })
    )
  })

  it('checkpoints Memory Colors final standings before its Continue and preserves its feature-owned winner', () => {
    const store = makeStore()
    const participants = participantsFor(store)
    const checkpoint = vi.fn(async () => true)
    const onComplete = vi.fn()
    render(
      <Provider store={store}>
        <CompetitionResultContext.Provider value={checkpoint}>
          <MemoryColorsComp
            participants={participants}
            participantIds={participants.map((player) => player.id)}
            seed={99}
            onComplete={onComplete}
          />
        </CompetitionResultContext.Provider>
      </Provider>
    )
    act(() => {
      store.dispatch(beginInput())
      const sequence = store.getState().memoryColors.sequence
      sequence.forEach((colorIndex, index) =>
        store.dispatch(recordInput({ colorIndex, now: 1000 + index * 100 }))
      )
      store.dispatch(endRunAfterRoundCleared())
    })
    const final = store.getState().memoryColors
    expect(final.phase).toBe('complete')
    expect(checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        partial: false,
        completion: expect.objectContaining({
          authoritativeWinnerId: final.winnerId,
          authoritativeLastPlaceId: final.lastPlaceId,
          authoritativeRankedIds: final.finalRanking,
        }),
      })
    )
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
