import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, hydrateGame } from '../../../src/store/gameSlice'
import { secretMissionMiddleware } from '../../../src/store/secretMissionMiddleware'
import { createSecretMissionState, type MissionTask } from '../../../src/bb/secretMission'
import famousFiguresReducer from '../../../src/features/famousFigures/famousFiguresSlice'
import { resolveFamousFiguresOutcome } from '../../../src/features/famousFigures/thunks'
import type { AppDispatch, RootState } from '../../../src/store/store'

function fixture() {
  const base = createInitialGameState({ seed: 125 })
  const players = base.players
    .slice(0, 8)
    .map((player) => ({ ...player, status: 'active' as const }))
  const human = players.find((player) => player.isUser)!
  const [finn, rae] = players.filter((player) => !player.isUser)
  const mission = createSecretMissionState(3, { templateId: 'silent_witness' })
  const tasks: MissionTask[] = [
    {
      id: 'top-two',
      type: 'competition_placement',
      description: 'Finish in the top 2',
      current: 0,
      target: 1,
      completed: false,
      startDay: 3,
      endDay: 8,
      placementThreshold: 2,
    },
    {
      id: 'not-last',
      type: 'avoid_last_place',
      description: 'Avoid last twice',
      current: 0,
      target: 2,
      completed: false,
      startDay: 3,
      endDay: 8,
    },
  ]
  mission.status = 'accepted'
  mission.endDay = 8
  mission.tasks = tasks
  const game = {
    ...base,
    players,
    week: 4,
    phase: 'loh_comp' as const,
    lohId: null,
    secretMission: mission,
  }
  const ff = famousFiguresReducer(undefined, { type: 'init' })
  const roundScores = {
    [human.id]: [8, 5, 8, 3, 5, 8],
    [finn.id]: [5, 8, 8, 3, 8, 5],
    [rae.id]: [8, 8, 0, 8, 5, 5],
  }
  const store = configureStore({
    reducer: { game: gameReducer, famousFigures: famousFiguresReducer },
    preloadedState: {
      game,
      famousFigures: {
        ...ff,
        status: 'complete' as const,
        competitionType: 'LOH' as const,
        winnerId: finn.id,
        playerScores: { [human.id]: 37, [finn.id]: 37, [rae.id]: 34 },
        playerRoundScores: roundScores,
        playerPersonalRoundScores: roundScores,
        tieBreakOrder: [finn.id, human.id, rae.id],
      },
    },
    middleware: (get) => get().concat(secretMissionMiddleware),
  })
  const receipt = {
    runId: 'famous-figures-day-4',
    status: 'completed' as const,
    gameKey: 'famousFigures',
    gameId: game.gameId,
    week: 4,
    participants: [human.id, finn.id, rae.id],
    placements: [finn.id, human.id, rae.id],
    humanId: human.id,
    winnerId: finn.id,
    lastPlaceId: rae.id,
  }
  return { store, human, finn, rae, receipt }
}

describe('competition mission receipts', () => {
  it('credits the screenshot tie as second place through the real Famous Figures outcome thunk', () => {
    const { store, human, finn } = fixture()
    resolveFamousFiguresOutcome()(
      store.dispatch as AppDispatch,
      () => store.getState() as RootState
    )
    const game = store.getState().game
    expect(game.lohId).toBe(finn.id)
    expect(game.lastCompetitionResolution?.placements?.slice(0, 2)).toEqual([finn.id, human.id])
    expect(game.secretMission?.tasks[0]).toMatchObject({ current: 1, completed: true })
    expect(game.secretMission?.tasks[1].current).toBe(1)
  })

  it('repairs a restored result even when the original completion action was missed', () => {
    const { store, receipt } = fixture()
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        phase: 'loh_results',
        lastCompetitionResolution: receipt,
      })
    )
    expect(store.getState().game.secretMission?.tasks[0].completed).toBe(true)
    expect(store.getState().game.secretMission?.tasks[1].current).toBe(1)
    for (let i = 0; i < 4; i += 1) store.dispatch({ type: 'unrelated/player-navigation' })
    expect(store.getState().game.secretMission?.tasks[1].current).toBe(1)
  })

  it.each(['quit', 'skipped', 'interrupted'] as const)('does not credit a %s receipt', (status) => {
    const { store, receipt } = fixture()
    store.dispatch(
      hydrateGame({ ...store.getState().game, lastCompetitionResolution: { ...receipt, status } })
    )
    expect(store.getState().game.secretMission?.tasks.map((task) => task.current)).toEqual([0, 0])
  })

  it.each([2, 9])('rejects a result outside the mission window on Day %s', (week) => {
    const { store, receipt } = fixture()
    store.dispatch(
      hydrateGame({ ...store.getState().game, lastCompetitionResolution: { ...receipt, week } })
    )
    expect(store.getState().game.secretMission?.tasks.map((task) => task.current)).toEqual([0, 0])
  })

  it('rejects a result belonging to another season', () => {
    const { store, receipt } = fixture()
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        lastCompetitionResolution: { ...receipt, gameId: 'older-season' },
      })
    )
    expect(store.getState().game.secretMission?.tasks[0].current).toBe(0)
  })

  it('recovers an explicit human win without guessing the other placements', () => {
    const { store, receipt, human } = fixture()
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        lastCompetitionResolution: { ...receipt, placements: undefined, winnerId: human.id },
      })
    )
    expect(store.getState().game.secretMission?.tasks[0].completed).toBe(true)
  })
})
