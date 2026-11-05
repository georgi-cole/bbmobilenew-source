import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, {
  createInitialGameState,
  openFavoritePlayerVoting,
  startFavoritePlayerPhase,
} from '../../../store/gameSlice'
import { useAppSelector } from '../../../store/hooks'
import { store as baseline, type RootState } from '../../../store/store'
import { useTwistFlow } from './useTwistFlow'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

function mountFlow(voting: 'new' | 'announced' | 'open' | 'complete' = 'new') {
  const game = createInitialGameState({ seed: 973, seasonArchives: [] })
  game.gameId = 'favorite-handoff'
  game.phase = 'jury'
  game.week = 10
  game.seasonFinale = {
    phase: 'publicFavoriteFlow',
    winnerId: game.players[0].id,
    publicFavoriteEnabled: true,
    interviewIndex: 0,
    goodbyeIndex: 0,
    isChatOpen: false,
    isLightsOffAnimating: false,
  }
  const candidates = game.players.map((player) => player.id)
  const initialized =
    voting === 'new'
      ? game
      : gameReducer(game, startFavoritePlayerPhase({ candidates, awardAmount: 25000 }))
  const initial: RootState = {
    ...structuredClone(baseline.getState()),
    game: {
      ...initialized,
      favoritePlayer: initialized.favoritePlayer
        ? {
            ...initialized.favoritePlayer,
            active: voting !== 'complete',
            votingStarted: voting === 'open' || voting === 'complete',
          }
        : undefined,
    },
  }
  const actions: UnknownAction[] = []
  const record: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction)
    return next(action)
  }
  const store = configureStore({
    reducer: (state: RootState = initial, action) => ({
      ...state,
      game: gameReducer(state.game, action),
    }),
    middleware: (get) => get({ serializableCheck: false, immutableCheck: false }).concat(record),
  })
  const hook = renderHook(
    () => {
      const current = useAppSelector((state) => state.game)
      return useTwistFlow({
        game: current,
        alivePlayers: current.players.filter((player) => player.status === 'active'),
        humanPlayer: current.players.find((player) => player.isUser),
        publicOpinionProfiles: {},
        dispatch: store.dispatch,
      })
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    }
  )
  return { ...hook, store, actions, candidates }
}

describe('Public Favorite handoff', () => {
  it('opens immediately after the host introduction without advancing a timer', () => {
    const { store, result, actions, candidates } = mountFlow()
    expect(result.current.showFavoriteVoting).toBe(false)
    act(() => store.dispatch(startFavoritePlayerPhase({ candidates, awardAmount: 25000 })))

    expect(result.current.showFavoriteVoting).toBe(true)
    expect(store.getState().game.favoritePlayer?.votingStarted).toBe(true)
    expect(actions.filter(openFavoritePlayerVoting.match)).toHaveLength(1)
  })

  it('recovers the old pending-announcement save without its five-second wait', () => {
    const { store, result, actions, rerender } = mountFlow('announced')
    expect(result.current.showFavoriteVoting).toBe(true)
    expect(store.getState().game.favoritePlayer?.votingStarted).toBe(true)
    rerender()
    act(() => vi.advanceTimersByTime(10000))
    expect(actions.filter(openFavoritePlayerVoting.match)).toHaveLength(1)
  })

  it('resumes an already-open vote without reopening it', () => {
    const { result, actions } = mountFlow('open')
    expect(result.current.showFavoriteVoting).toBe(true)
    expect(actions.filter(openFavoritePlayerVoting.match)).toHaveLength(0)
  })

  it('hands the completed vote to goodbyes without a delayed reopen', () => {
    const { store, result, actions, candidates } = mountFlow('open')
    act(() => result.current.handleFavoriteComplete(candidates[1]))
    act(() => vi.advanceTimersByTime(10000))

    expect(result.current.showFavoriteVoting).toBe(false)
    expect(store.getState().game.favoritePlayer?.winnerId).toBe(candidates[1])
    expect(store.getState().game.seasonFinale?.phase).toBe('goodbyeSequence')
    expect(actions.filter(openFavoritePlayerVoting.match)).toHaveLength(0)
  })

  it('does not reopen a finished vote loaded from a save', () => {
    const { result, actions } = mountFlow('complete')
    act(() => vi.advanceTimersByTime(10000))
    expect(result.current.showFavoriteVoting).toBe(false)
    expect(actions.filter(openFavoritePlayerVoting.match)).toHaveLength(0)
  })
})
