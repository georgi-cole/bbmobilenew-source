import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import gameReducer, { setTribunalViewingMode } from '../../store/gameSlice'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import TribunalHighlightsChip from './TribunalHighlightsChip'
import TvZone from '../ui/TvZone'

beforeEach(() => window.history.replaceState(null, '', '/?tribunalHighlights=1'))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

function renderChip({ liveHeader = false, animations = true, battleBack = false } = {}) {
  const game = createTribunalScenario()
  game.tribunalViewingMode = 'full'
  if (battleBack) game.battleBack = { ...game.battleBack!, active: true }
  const state = baseline.getState()
  const initial = {
    ...state,
    game,
    settings: {
      ...state.settings,
      gameUX: { ...state.settings.gameUX, animations },
    },
  }
  const store = configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
    }),
  })
  render(
    <Provider store={store}>
      <MemoryRouter>{liveHeader ? <TvZone /> : <TribunalHighlightsChip />}</MemoryRouter>
    </Provider>
  )
  return store
}

it('places the scales next to Music outside the TV viewport', () => {
  renderChip({ liveHeader: true })
  const chip = screen.getByRole('button', { name: 'Tribunal highlights' })
  const music = screen.getByRole('button', { name: 'Music' })
  expect(chip.parentElement).toBe(music.parentElement)
  expect(chip.nextElementSibling).toBe(music)
  expect(chip.closest('.tv-zone__viewport')).toBeNull()
  expect(chip.querySelector('.top-utility-btn__glyph')).toHaveAttribute(
    'src',
    expect.stringContaining('tribunal_badge.svg')
  )
})

it('glimmers once per season and returns to highlights without advancing the season', () => {
  vi.useFakeTimers()
  const store = renderChip()
  expect(screen.getByRole('button', { name: 'Tribunal highlights' })).toHaveClass(
    'tribunal-highlights-chip--discover'
  )
  act(() => vi.advanceTimersByTime(1500))
  expect(store.getState().game.tribunalHighlightsShortcutSeen).toBe(true)
  expect(screen.getByRole('button', { name: 'Tribunal highlights' })).not.toHaveClass(
    'tribunal-highlights-chip--discover'
  )
  const before = store.getState().game
  fireEvent.click(screen.getByRole('button', { name: 'Tribunal highlights' }))
  expect(store.getState().game).toEqual({ ...before, tribunalViewingMode: 'highlights' })
  expect(screen.queryByRole('button', { name: 'Tribunal highlights' })).not.toBeInTheDocument()
  act(() => {
    store.dispatch(setTribunalViewingMode('full'))
  })
  expect(screen.getByRole('button', { name: 'Tribunal highlights' })).not.toHaveClass(
    'tribunal-highlights-chip--discover'
  )
})

it('does not animate when animations are disabled', () => {
  const store = renderChip({ animations: false })
  expect(screen.getByRole('button', { name: 'Tribunal highlights' })).not.toHaveClass(
    'tribunal-highlights-chip--discover'
  )
  expect(store.getState().game.tribunalHighlightsShortcutSeen).toBe(true)
})

it('cannot leave a live Battle Back opportunity through the shortcut', () => {
  const store = renderChip({ battleBack: true })
  expect(screen.queryByRole('button', { name: 'Tribunal highlights' })).not.toBeInTheDocument()
  expect(store.getState().game.tribunalHighlightsShortcutSeen).not.toBe(true)
})
