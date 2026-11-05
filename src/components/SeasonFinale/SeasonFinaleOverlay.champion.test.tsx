import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'
import gameReducer, { createInitialGameState } from '../../store/gameSlice'
import settingsReducer from '../../store/settingsSlice'
import uiReducer from '../../store/uiSlice'
import type { GameState } from '../../types'
import SeasonFinaleOverlay from './SeasonFinaleOverlay'

vi.mock('../ChatOverlay/ChatOverlay', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => <div role="dialog" aria-label={ariaLabel} />,
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderCoronation(vox: boolean) {
  const base = createInitialGameState({ seed: 418 })
  const winner = base.players[0]
  const runnerUp = base.players[1]
  const state: GameState = {
    ...base,
    players: base.players.map((player) => ({
      ...player,
      isWinner: player.id === winner.id,
      finalRank: player.id === winner.id ? 1 : player.id === runnerUp.id ? 2 : undefined,
    })),
    seasonFinale: {
      phase: 'winnerCinematic',
      winnerId: winner.id,
      interviewIndex: 0,
      goodbyeIndex: 0,
      isChatOpen: false,
      isLightsOffAnimating: false,
      publicFavoriteEnabled: false,
    },
    voxPopuli: vox
      ? {
          ...createInitialVoxPopuliState(base.season),
          status: 'complete',
          winnerId: winner.id,
        }
      : undefined,
  }
  const store = configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, ui: uiReducer },
    preloadedState: {
      game: state,
      settings: settingsReducer(undefined, { type: '@@INIT' }),
      ui: uiReducer(undefined, { type: '@@INIT' }),
    },
  })
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SeasonFinaleOverlay />
      </MemoryRouter>
    </Provider>
  )
  return { store, winner, runnerUp }
}

describe('season finale winner-to-interview handoff', () => {
  it.each([false, true])(
    'gives %s mode its suspense cue, a single-winner celebration and uninterrupted interview handoff',
    (vox) => {
      const { store, winner, runnerUp } = renderCoronation(vox)
      const root = screen.getByRole('dialog', { name: /champion coronation/ })
      expect(root).toHaveAttribute('data-champion-revealed', 'false')
      expect(root.querySelector('.season-finale__champion-cutout')).not.toBeVisible()
      expect(root.querySelector('.f3-venue__monitor')).toBeNull()
      expect(screen.queryByText(winner.name)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Continue to winner interview' })).toBeNull()

      act(() => vi.advanceTimersByTime(1499))
      expect(root).toHaveAttribute('data-champion-revealed', 'false')
      act(() => vi.advanceTimersByTime(1))

      expect(root).toHaveAttribute('data-champion-revealed', 'true')
      expect(root).toHaveAttribute('data-final-vote', vox ? 'audience' : 'tribunal')
      expect(root).toHaveAttribute('data-winner-id', winner.id)
      expect(screen.getByRole('heading', { name: winner.name })).toBeTruthy()
      expect(screen.queryByText(`Runner-up · ${runnerUp.name}`)).toBeNull()
      expect(root.querySelectorAll('.season-finale__champion-cutout')).toHaveLength(1)

      fireEvent.click(screen.getByRole('button', { name: 'Continue to winner interview' }))
      expect(store.getState().game.seasonFinale?.phase).toBe('winnerInterview')
      expect(store.getState().game.seasonFinale?.isChatOpen).toBe(true)
      expect(screen.getByRole('dialog', { name: 'Winner interview' })).toBeTruthy()
    }
  )
})
