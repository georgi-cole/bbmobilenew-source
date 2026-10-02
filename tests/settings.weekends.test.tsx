import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import Settings from '../src/screens/Settings/Settings'
import gameReducer, {
  advance,
  createInitialGameState,
  hydrateGame,
  resetGame,
  debugActivateWeekendInterlude,
} from '../src/store/gameSlice'
import settingsReducer, {
  DEFAULT_SETTINGS,
  setGameUX,
  saveSettings,
  loadSettings,
  STORAGE_KEY,
} from '../src/store/settingsSlice'
import { weekendSettingsMiddleware } from '../src/store/weekendSettingsMiddleware'
import socialReducer from '../src/social/socialSlice'
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice'
import weekendDebugPreviewReducer from '../src/store/weekendDebugPreviewSlice'
import { captureWeekendDebugSnapshot } from '../src/features/weekend/weekendDebugActions'

function makeStore(day = 5) {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      social: socialReducer,
      publicOpinion: publicOpinionReducer,
      weekendDebugPreview: weekendDebugPreviewReducer,
    },
    preloadedState: {
      game: { ...createInitialGameState({ seed: 5151 }), week: day, phase: 'week_end' as const },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(weekendSettingsMiddleware),
  })
}

describe('Weekend preference', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY))

  it('provides the toggle in ordinary Settings and persists the preference', () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </Provider>
    )
    const toggle = screen.getByRole('checkbox', { name: /toggle weekends/i })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(store.getState().game.weekendsEnabledForSeason).toBe(false)
    saveSettings(store.getState().settings)
    expect(loadSettings().gameUX.weekendsEnabled).toBe(false)
    fireEvent.click(toggle)
    expect(store.getState().game.weekendsEnabledForSeason).toBe(true)
  })

  it.each([5, 10, 15])('skips the weekend after Day %s when off', (day) => {
    const store = makeStore(day)
    store.dispatch(setGameUX({ weekendsEnabled: false }))
    store.dispatch(advance())
    expect(store.getState().game.weekendInterlude).toBeNull()
    expect(store.getState().game.week).toBe(day + 1)
    expect(store.getState().game.phase).toBe('week_start')
  })

  it.each([5, 10, 15])('activates the weekend after Day %s when switched back on', (day) => {
    const store = makeStore(day)
    store.dispatch(setGameUX({ weekendsEnabled: false }))
    store.dispatch(setGameUX({ weekendsEnabled: true }))
    store.dispatch(advance())
    expect(store.getState().game.weekendInterlude?.afterDay).toBe(day)
  })

  it('closes an active weekend without replaying it when re-enabled', () => {
    const store = makeStore()
    store.dispatch(advance())
    store.dispatch(setGameUX({ weekendsEnabled: false }))
    expect(store.getState().game.weekendInterlude).toBeNull()
    store.dispatch(setGameUX({ weekendsEnabled: true }))
    store.dispatch(advance())
    expect(store.getState().game.week).toBe(6)
    expect(store.getState().game.weekendInterlude).toBeNull()
  })

  it('honours the preference after hydration and a new season reset', () => {
    const store = makeStore()
    store.dispatch(setGameUX({ weekendsEnabled: false }))
    store.dispatch(hydrateGame(createInitialGameState({ seed: 10 })))
    expect(store.getState().game.weekendsEnabledForSeason).toBe(false)
    store.dispatch(resetGame(undefined))
    expect(store.getState().game.weekendsEnabledForSeason).toBe(false)
    store.dispatch(debugActivateWeekendInterlude(10))
    expect(store.getState().game.weekendInterlude).toBeNull()
  })

  it('restores the original run before disabling a debug preview', () => {
    const store = makeStore()
    const original = store.getState()
    store.dispatch(
      captureWeekendDebugSnapshot({
        game: original.game,
        social: original.social,
        publicOpinion: original.publicOpinion,
      })
    )
    store.dispatch(debugActivateWeekendInterlude(10))
    store.dispatch(setGameUX({ weekendsEnabled: false }))
    expect(store.getState().game.week).toBe(original.game.week)
    expect(store.getState().game.phase).toBe(original.game.phase)
    expect(store.getState().game.weekendInterlude).toBeNull()
    expect(store.getState().weekendDebugPreview.snapshot).toBeNull()
    expect(store.getState().game.weekendsEnabledForSeason).toBe(false)
  })

  it('defaults old preferences to the current enabled behaviour', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameUX: { animations: true } }))
    expect(loadSettings().gameUX.weekendsEnabled).toBe(DEFAULT_SETTINGS.gameUX.weekendsEnabled)
  })
})
