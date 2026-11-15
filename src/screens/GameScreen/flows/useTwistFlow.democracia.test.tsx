import type { ReactNode } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState } from '../../../store/gameSlice'
import { store as baseline, type RootState } from '../../../store/store'
import { useTwistFlow } from './useTwistFlow'

afterEach(cleanup)

describe('Democracia ballot options', () => {
  it('offers the human candidate on their own ballot and keeps non-candidates excluded', () => {
    const game = createInitialGameState({ seed: 6124, seasonArchives: [] })
    const human = game.players.find((player) => player.isUser)!
    const candidate = game.players.find((player) => !player.isUser)!
    game.phase = 'democracia_vote'
    game.democracia = {
      usedThisSeason: true,
      active: true,
      activatedDay: game.week,
      round: 1,
      candidateIds: [human.id, candidate.id],
      eligibleVoterIds: game.players.map((player) => player.id),
      votesByVoterId: {},
      awaitingHumanVote: true,
      awaitingPublicBreaker: false,
      resultDisplay: null,
    }
    const initial: RootState = { ...structuredClone(baseline.getState()), game }
    const store = configureStore({
      reducer: (state: RootState = initial, action) => ({
        ...state,
        game: gameReducer(state.game, action),
      }),
    })
    const { result } = renderHook(
      () =>
        useTwistFlow({
          game,
          alivePlayers: game.players,
          humanPlayer: human,
          publicOpinionProfiles: {},
          dispatch: store.dispatch,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      }
    )
    expect(result.current.showDemocraciaVoteModal).toBe(true)
    expect(result.current.democraciaVoteOptions.map((player) => player.id)).toEqual([
      human.id,
      candidate.id,
    ])
  })
})
