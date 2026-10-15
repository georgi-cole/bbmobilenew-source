import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { completeMinigame, launchMinigame } from '../src/store/gameSlice'
import settingsReducer from '../src/store/settingsSlice'
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice'
import type { GameState, Player } from '../src/types'

function makePlayers(): Player[] {
  return [
    { id: 'human', name: 'You', avatar: '🧑', status: 'active', isUser: true },
    { id: 'rae', name: 'Rae', avatar: '🤖', status: 'active', isUser: false },
    { id: 'ali', name: 'Ali', avatar: '🤖', status: 'active', isUser: false },
    { id: 'bea', name: 'Bea', avatar: '🤖', status: 'active', isUser: false },
  ]
}

describe('Timing Bar completion standings', () => {
  it('keeps the round winner first and uses displayed raw accuracy values', () => {
    const base = {
      season: 1,
      week: 2,
      phase: 'loh_comp' as const,
      seed: 42,
      lohId: null,
      prevHohId: null,
      nomineeIds: [],
      publicModeEnabled: true,
      posWinnerId: null,
      replacementNeeded: false,
      povSavedId: null,
      awaitingNominations: false,
      pendingNominee1Id: null,
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      lastHohCompFinisherId: null,
      publicSavedNomineeId: null,
      nominationContext: null,
      awaitingPublicSave: false,
      votes: {},
      awaitingHumanVote: false,
      awaitingTieBreak: false,
      tiedNomineeIds: null,
      awaitingFinal3Eviction: false,
      awaitingFinal3Plea: false,
      f3Part1WinnerId: null,
      f3Part2WinnerId: null,
      players: makePlayers(),
      tvFeed: [],
      isLive: false,
    }
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
        publicOpinion: publicOpinionReducer,
      },
      preloadedState: { game: base as GameState },
    })

    store.dispatch(
      launchMinigame({
        key: 'timingBar',
        participants: ['human', 'rae', 'ali', 'bea'],
        seed: 42,
        options: { timeLimit: 0 },
        aiScores: { rae: 49, ali: 48, bea: 37 },
        hybridResolveOnComplete: true,
      })
    )
    store.dispatch(
      completeMinigame({
        humanScore: 90,
        winnerId: 'human',
        lastPlaceId: 'bea',
        authoritativeRankedIds: ['human', 'rae', 'ali', 'bea'],
        rawResults: { human: 90, rae: 49, ali: 48, bea: 37 },
      })
    )

    expect(store.getState().game.lastCompetitionResolution).toMatchObject({
      winnerId: 'human',
      lastPlaceId: 'bea',
      placements: ['human', 'rae', 'ali', 'bea'],
    })
  })
})
