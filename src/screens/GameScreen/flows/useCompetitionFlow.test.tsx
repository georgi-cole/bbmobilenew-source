import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import { store as baseline } from '../../../store/store'
import gameReducer, { createInitialGameState } from '../../../store/gameSlice'
import challengeReducer from '../../../store/challengeSlice'
import { getGame } from '../../../minigames/registry'
import type { RootState } from '../../../store/store'
import { useCompetitionFlow } from './useCompetitionFlow'

describe('competition result ceremony handoff', () => {
  it.each([
    { prizeType: 'LOH' as const, partial: true },
    { prizeType: 'POS' as const, partial: true },
    { prizeType: 'LOH' as const, partial: false },
    { prizeType: 'POS' as const, partial: false },
  ])(
    'shows $prizeType winner after Continue (partial=$partial) and commits only after the ceremony',
    ({ prizeType, partial }) => {
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
        }),
        middleware: (get) => get({ serializableCheck: false, immutableCheck: false }),
      })
      const { result } = renderHook(
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
      act(() => result.current.handleWinnerCeremonyDone())
      expect(
        prizeType === 'LOH' ? store.getState().game.lohId : store.getState().game.posWinnerId
      ).toBe(players[1].id)
      expect(result.current.pendingWinnerCeremony).toBeNull()
    }
  )
})
