import { act, cleanup, render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, { hydrateGame } from '../../store/gameSlice'
import WeatherRosterReveal from '../WeatherRosterReveal'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../../services/presentation/presentationOwnership'

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }))
vi.mock('../../hooks/useSound', () => ({ default: () => ({ play: playSound }) }))
vi.mock('../../broadcasting/dailyMoodSystem', async (original) => ({
  ...(await original<typeof import('../../broadcasting/dailyMoodSystem')>()),
  getDailyAtmosphere: () => 'stormy',
}))

let roster: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  playSound.mockClear()
  roster = document.createElement('div')
  roster.dataset.houseguestRoster = 'true'
  document.body.append(roster)
})
afterEach(async () => {
  cleanup()
  roster.remove()
  document.body.classList.remove('no-animations', 'reduce-motion')
  await Promise.resolve()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function fixture() {
  const initial = gameReducer(undefined, { type: '@@INIT' })
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...initial, gameId: 'weather-run', phase: 'week_start' as const } },
  })
}
const weather = () => roster.querySelector('[data-weather-detail]')

describe('weather presentation lifetime', () => {
  it('pauses covered weather and its cue clock, aborts its playing sound, and resumes without replay', async () => {
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(400))
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      expect(weather()).toHaveAttribute('data-presentation-suspended', 'true')
      act(() => vi.advanceTimersByTime(30_000))
      expect(playSound).not.toHaveBeenCalled()
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(439))
      expect(playSound).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(playSound).toHaveBeenCalledTimes(1)
      const signal = playSound.mock.calls[0][1].signal as AbortSignal
      expect(signal.aborted).toBe(false)
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      expect(signal.aborted).toBe(true)
      act(() => vi.advanceTimersByTime(30_000))
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(3459))
      expect(weather()).not.toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(weather()).toBeNull()
      expect(playSound).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
  })

  it('discards an exited route instead of replaying its old weather on return', () => {
    const store = fixture()
    const { rerender } = render(
      <Provider store={store}>
        <WeatherRosterReveal active />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(400))
    expect(weather()).not.toBeNull()
    rerender(
      <Provider store={store}>
        <WeatherRosterReveal active={false} />
      </Provider>
    )
    expect(weather()).toBeNull()
    act(() => vi.advanceTimersByTime(30_000))
    expect(playSound).not.toHaveBeenCalled()
    rerender(
      <Provider store={store}>
        <WeatherRosterReveal active />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(5000))
    expect(weather()).toBeNull()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('cancels an obsolete phase and allows the next genuine daily reveal', () => {
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(400))
    act(() => {
      store.dispatch(hydrateGame({ ...store.getState().game, phase: 'loh_comp' }))
    })
    act(() => vi.advanceTimersByTime(5000))
    expect(weather()).toBeNull()
    expect(playSound).not.toHaveBeenCalled()
    act(() => {
      store.dispatch(hydrateGame({ ...store.getState().game, phase: 'week_end' }))
    })
    act(() => vi.advanceTimersByTime(840))
    expect(weather()).not.toBeNull()
    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('does not prepare hidden weather and completes reduced motion without a late replay', async () => {
    document.body.classList.add('no-animations')
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(0))
    expect(weather()).toBeNull()
    expect(playSound).not.toHaveBeenCalled()
    await act(async () => {
      document.body.classList.remove('no-animations')
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(5000))
    expect(weather()).toBeNull()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('stops an old run during coverage and never resumes its consumed cue on a new run', async () => {
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(840))
    const oldSignal = playSound.mock.calls[0][1].signal as AbortSignal
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      act(() => {
        store.dispatch(hydrateGame({ ...store.getState().game, gameId: 'new-weather-run' }))
      })
      act(() => vi.advanceTimersByTime(30_000))
      expect(oldSignal.aborted).toBe(true)
      expect(playSound).toHaveBeenCalledTimes(1)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(840))
      expect(playSound).toHaveBeenCalledTimes(2)
      expect(playSound.mock.calls[1][1].signal).not.toBe(oldSignal)
    } finally {
      release()
    }
  })

  it('finishes an already-started effect when motion is disabled mid-scene', async () => {
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(1000))
    const signal = playSound.mock.calls[0][1].signal as AbortSignal
    await act(async () => {
      document.body.classList.add('reduce-motion')
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(0))
    expect(weather()).toBeNull()
    expect(signal.aborted).toBe(true)
    await act(async () => {
      document.body.classList.remove('reduce-motion')
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(5000))
    expect(weather()).toBeNull()
    expect(playSound).toHaveBeenCalledTimes(1)
  })

  it('cancels old profile work even if the profiles share the same saved game id', () => {
    const profiles = createSlice({
      name: 'testProfiles',
      initialState: { activeProfileId: 'first', isGuest: false },
      reducers: {
        switchProfile(state, action: PayloadAction<string>) {
          state.activeProfileId = action.payload
        },
      },
    })
    const game = fixture().getState().game
    const store = configureStore({
      reducer: { game: gameReducer, profiles: profiles.reducer },
      preloadedState: { game },
    })
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(840))
    const oldSignal = playSound.mock.calls[0][1].signal as AbortSignal
    act(() => {
      store.dispatch(profiles.actions.switchProfile('second'))
    })
    expect(oldSignal.aborted).toBe(true)
    expect(store.getState().game.gameId).toBe(game.gameId)
    act(() => vi.advanceTimersByTime(840))
    expect(playSound).toHaveBeenCalledTimes(2)
    expect(playSound.mock.calls[1][1].signal).not.toBe(oldSignal)
  })

  it('releases scene visibility subscriptions after completion and accepts a new season', () => {
    const subscribe = vi.spyOn(document, 'addEventListener')
    const unsubscribe = vi.spyOn(document, 'removeEventListener')
    const store = fixture()
    render(
      <Provider store={store}>
        <WeatherRosterReveal />
      </Provider>
    )
    act(() => vi.advanceTimersByTime(4300))
    expect(weather()).toBeNull()
    expect(subscribe.mock.calls.filter(([name]) => name === 'visibilitychange')).toHaveLength(1)
    expect(unsubscribe.mock.calls.filter(([name]) => name === 'visibilitychange')).toHaveLength(1)
    const game = store.getState().game
    act(() => {
      store.dispatch(hydrateGame({ ...game, season: game.season + 1 }))
    })
    act(() => vi.advanceTimersByTime(840))
    expect(weather()).not.toBeNull()
    expect(playSound).toHaveBeenCalledTimes(2)
  })
})
