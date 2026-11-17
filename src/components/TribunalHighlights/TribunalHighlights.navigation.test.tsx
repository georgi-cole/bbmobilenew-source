import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { useEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { store as baseline } from '../../store/store'
import gameReducer from '../../store/gameSlice'
import uiReducer from '../../store/uiSlice'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import { buildTribunalHighlight } from '../../features/tribunal/tribunalHighlights'
import { stepTribunalHighlights } from '../../features/tribunal/tribunalHighlightsProgression'
import TribunalHighlights from './TribunalHighlights'
import type { GameState } from '../../types'
import { setTutorialReplayEnabled } from '../../onboarding/tutorialGuidePreference'

vi.mock('../../features/tribunal/tribunalHighlightsProgression', () => ({
  stepTribunalHighlights: vi.fn(() => () => 'stopped'),
}))
vi.mock('./TribunalCeremonyExcerpt', () => ({
  TRIBUNAL_EXCERPT_MS: 3000,
  TRIBUNAL_POWERS_MS: 4000,
  default: function Excerpt({ onReady }: { onReady: (available: boolean) => void }) {
    useEffect(() => onReady(true), [onReady])
    return null
  },
}))

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains('tribunal-highlights__screen'))
      return DOMRect.fromRect({ x: 20, y: 100, width: 350, height: 300 })
    if (this.dataset.onboardingTarget === 'play')
      return DOMRect.fromRect({ x: 170, y: 730, width: 52, height: 52 })
    if (this.classList.contains('game-control-dock__presentation-action--left'))
      return DOMRect.fromRect({ x: 20, y: 730, width: 130, height: 60 })
    if (this.classList.contains('game-control-dock__presentation-action--right'))
      return DOMRect.fromRect({ x: 240, y: 730, width: 130, height: 60 })
    return DOMRect.fromRect({ x: 20, y: 400, width: 320, height: 188 })
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
  window.sessionStorage.clear()
})

function renderFlow(finalists = false, keepGuide = false, savedGame?: GameState) {
  const game = savedGame ?? createTribunalScenario(finalists ? 'finalists' : 'double')
  if (!finalists && !savedGame)
    game.tribunalHighlights = [buildTribunalHighlight(game, [game.pendingEviction!.evicteeId])]
  const initial = { ...baseline.getState(), game }
  const store = configureStore({
    reducer: (state = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
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
  if (!keepGuide && screen.queryByRole('button', { name: 'Skip tour' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
  return store
}

it('uses only the three presentation dock actions and advances scenes before the season', async () => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/?recapStyle=cinematic')
  const store = renderFlow()
  const originalGame = store.getState().game
  const dock = screen.getByRole('toolbar', { name: 'Game actions' })
  expect(
    within(dock)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
  ).toEqual(['Go to final vote', 'Play', 'Watch full season'])
  expect(screen.getAllByRole('button', { name: 'Go to final vote' })).toHaveLength(1)
  fireEvent.click(within(dock).getByRole('button', { name: 'Play' }))
  expect(screen.getByLabelText('Recap moment 2 of 3')).toBeInTheDocument()
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
  fireEvent.click(within(dock).getByRole('button', { name: 'Play' }))
  expect(screen.getByLabelText('Recap moment 3 of 3')).toBeInTheDocument()
  expect(store.getState().game).toBe(originalGame)
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(within(dock).getByRole('button', { name: 'Play' }))
  })
  expect(stepTribunalHighlights).toHaveBeenCalledOnce()
})

it('hands Play back to the live Tribunal at Final Two', () => {
  const store = renderFlow(true)
  expect(screen.queryByText(/in the Tribunal/)).not.toBeInTheDocument()
  expect(screen.queryByText('Your vote will help choose the winner.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  expect(store.getState().game.tribunalViewingMode).toBe('full')
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
})

it('routes the two dock shortcuts to final-vote progression and full-season viewing', async () => {
  const store = renderFlow()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Go to final vote' }))
  })
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
  const confirmation = screen.getByRole('dialog', { name: 'Skip to the final vote?' })
  await act(async () => {
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Go to final vote' }))
  })
  expect(stepTribunalHighlights).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Watch full season' }))
  expect(store.getState().game.tribunalViewingMode).toBe('full')
})

it('introduces the three controls, blocks background input and pauses recaps during the guide', () => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/?recapStyle=cinematic')
  const store = renderFlow(false, true)
  const originalGame = store.getState().game
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Welcome to sequester/)
  expect(document.querySelector('.season-tutorial__input-shield')).toBeInTheDocument()
  expect(document.querySelector('.season-tutorial__spotlight')).toHaveStyle({
    left: '17px',
    top: '97px',
    width: '356px',
    height: '306px',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Go to final vote' }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Welcome to sequester')
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Skip tour' })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: 'Next' })).toHaveFocus()
  act(() => vi.advanceTimersByTime(20000))
  expect(screen.getByLabelText('Recap moment 1 of 3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Play at your pace/)
  expect(document.querySelector('.season-tutorial__spotlight')).toHaveStyle({
    left: '167px',
    top: '727px',
    width: '58px',
    height: '58px',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Go to final vote/)
  expect(screen.getByRole('dialog')).toHaveTextContent('asked to confirm first')
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Play at your pace/)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Watch full season/)
  fireEvent.click(screen.getByRole('button', { name: 'Continue watching' }))
  act(() => vi.advanceTimersByTime(520))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.querySelector('.tribunal-highlights__shell')).not.toHaveAttribute('inert')
  expect(store.getState().game).toEqual({ ...originalGame, tribunalSequesterGuideSeen: true })
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Guide' })).not.toBeInTheDocument()
})

it('keeps cancellation and Escape from skipping any part of the season', () => {
  const store = renderFlow()
  const originalGame = store.getState().game
  fireEvent.click(screen.getByRole('button', { name: 'Go to final vote' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep watching' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Go to final vote' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(store.getState().game).toBe(originalGame)
  expect(stepTribunalHighlights).not.toHaveBeenCalled()
})

it('keeps the handled arrival guide closed when returning from full-season viewing', () => {
  const store = renderFlow()
  cleanup()
  renderFlow(false, true, store.getState().game)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guide' })).not.toBeInTheDocument()
})

it('starts automatically for a new sequester stay even when profile tutorials were handled', () => {
  const { activeProfileId, isGuest } = baseline.getState().profiles
  setTutorialReplayEnabled(activeProfileId, isGuest, false)
  renderFlow(false, true)
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Welcome to sequester/)
  expect(screen.queryByRole('button', { name: 'Guide' })).not.toBeInTheDocument()
})
