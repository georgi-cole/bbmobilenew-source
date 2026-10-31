import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { store as baseline } from '../../../store/store'
import gameReducer, { createInitialGameState, hydrateGame } from '../../../store/gameSlice'
import profilesReducer, { createProfile } from '../../../store/profilesSlice'
import challengeReducer, { setPendingChallenge } from '../../../store/challengeSlice'
import { getGame } from '../../../minigames/registry'
import type { RootState } from '../../../store/store'
import { useCompetitionFlow } from './useCompetitionFlow'

describe('competition result ceremony handoff', () => {
  it.each([
    ...(['LOH', 'POS'] as const).flatMap((prizeType) =>
      [true, false].flatMap((partial) =>
        [true, false].map((leave) => ({ prizeType, partial, leave, invalidate: '' }))
      )
    ),
    { prizeType: 'LOH' as const, partial: true, leave: false, invalidate: 'run' },
    { prizeType: 'POS' as const, partial: false, leave: false, invalidate: 'day' },
    { prizeType: 'LOH' as const, partial: false, leave: false, invalidate: 'profile' },
    { prizeType: 'LOH' as const, partial: false, leave: false, invalidate: 'late-callback' },
  ])(
    'shows $prizeType winner after Continue (partial=$partial, leave=$leave) and commits exactly once',
    ({ prizeType, partial, leave, invalidate }) => {
      const fixture = structuredClone(baseline.getState())
      const game = createInitialGameState({ seed: 42, seasonArchives: [] })
      const players = game.players
        .slice(0, 3)
        .map((p, i) => ({ ...p, isUser: i === 0, status: 'active' as const }))
      Object.assign(game, {
        players,
        phase: prizeType === 'LOH' ? 'loh_comp' : 'pos_comp',
        lohId: null,
        posWinnerId: null,
      })
      const pending = {
        id: 'exit-regression',
        game: getGame('quickTap')!,
        seed: 42,
        participants: players.map((p) => p.id),
        phase: 'results' as const,
        aiScores: { [players[1].id]: 100, [players[2].id]: 50 },
        prizeType,
      }
      const initial: RootState = { ...fixture, game, challenge: { ...fixture.challenge, pending } }
      const store = configureStore({
        reducer: (state = initial, action) => ({
          ...state,
          game: gameReducer(state.game, action),
          challenge: challengeReducer(state.challenge, action),
          profiles: profilesReducer(state.profiles, action),
        }),
        middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
      })
      const commitSpy = vi.spyOn(store, 'dispatch')
      const { result, unmount } = renderHook(
        () =>
          useCompetitionFlow({
            game: store.getState().game,
            humanPlayer: players[0],
            aliveIds: players.map((p) => p.id),
            hohCompParticipants: players.map((p) => p.id),
            humanIsOutgoingHoh: false,
            spectatorReactEnabled: false,
            spectatorMode: false,
            dispatch: store.dispatch,
          }),
        {
          wrapper: ({ children }: { children: React.ReactNode }) => (
            <Provider store={store}>{children}</Provider>
          ),
        }
      )
      act(() => result.current.handleChallengeDone(0, partial))
      expect(result.current.pendingWinnerCeremony?.winnerId).toBe(players[1].id)
      expect(
        prizeType === 'LOH' ? store.getState().game.lohId : store.getState().game.posWinnerId
      ).toBeNull()
      if (invalidate === 'late-callback') {
        const oldDone = result.current.handleWinnerCeremonyDone
        act(() => oldDone())
        act(() => {
          store.dispatch(
            hydrateGame({ ...store.getState().game, phase: 'pos_comp', posWinnerId: null })
          )
          store.dispatch(
            setPendingChallenge({ ...pending, id: 'second-receipt', prizeType: 'POS' })
          )
        })
        act(() => result.current.handleChallengeDone(0, false))
        expect(result.current.pendingWinnerCeremony).not.toBeNull()
        act(() => oldDone())
        expect(result.current.pendingWinnerCeremony).not.toBeNull()
        expect(store.getState().game.posWinnerId).toBeNull()
        act(() => result.current.handleWinnerCeremonyDone())
        expect(store.getState().game.posWinnerId).toBe(players[1].id)
        unmount()
        return
      }
      if (invalidate) {
        const next = {
          ...game,
          gameId: invalidate === 'run' ? 'different-run' : game.gameId,
          week: invalidate === 'day' ? game.week + 1 : game.week,
          phase: 'week_start' as const,
          lohId: null,
          posWinnerId: null,
        }
        act(() => {
          if (invalidate === 'profile')
            store.dispatch(createProfile({ name: 'Other profile', avatar: 'test-avatar' }))
          else store.dispatch(hydrateGame(next))
        })
        expect(result.current.pendingWinnerCeremony).toBeNull()
        act(() => result.current.handleWinnerCeremonyDone())
        unmount()
        expect(
          prizeType === 'LOH' ? store.getState().game.lohId : store.getState().game.posWinnerId
        ).toBeNull()
        expect(
          commitSpy.mock.calls.filter(
            ([action]) => typeof action !== 'function' && action.type === 'game/applyMinigameWinner'
          )
        ).toHaveLength(0)
        return
      }
      if (leave) unmount()
      else act(() => result.current.handleWinnerCeremonyDone())
      expect(
        prizeType === 'LOH' ? store.getState().game.lohId : store.getState().game.posWinnerId
      ).toBe(players[1].id)
      if (!leave) expect(result.current.pendingWinnerCeremony).toBeNull()
      act(() => result.current.handleWinnerCeremonyDone())
      expect(
        commitSpy.mock.calls.filter(
          ([action]) => typeof action !== 'function' && action.type === 'game/applyMinigameWinner'
        )
      ).toHaveLength(1)
    }
  )
})
