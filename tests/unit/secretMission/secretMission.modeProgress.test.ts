import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import { commitNominees, createInitialGameState, hydrateGame } from '../../../src/store/gameSlice'
import gameReducer from '../../../src/store/gameSlice'
import { secretMissionMiddleware } from '../../../src/store/secretMissionMiddleware'
import { createSecretMissionState, type MissionTask } from '../../../src/bb/secretMission'

function makeVoxMissionStore() {
  const base = createInitialGameState({ seed: 125, seasonArchives: [] })
  const players = base.players
    .slice(0, 8)
    .map((player) => ({ ...player, status: 'active' as const }))
  const human = players.find((player) => player.isUser)!
  const candidates = players.filter((player) => player.id !== human.id)
  const mission = createSecretMissionState(3, { templateId: 'silent_witness' })
  const task: MissionTask = {
    id: 'vox-ballot',
    type: 'vox_ballot_cast',
    description: 'Cast a valid ballot',
    current: 0,
    target: 1,
    completed: false,
    startDay: 3,
    endDay: 6,
    targetDay: 6,
    completedBallotDays: [],
  }
  mission.status = 'accepted'
  mission.tasks = [task]

  const state = {
    ...base,
    week: 3,
    phase: 'nomination_results' as const,
    players,
    secretMission: mission,
    lohId: null,
    nomineeIds: [],
    awaitingNominations: true,
    voxPopuli: {
      ...base.voxPopuli!,
      status: 'active' as const,
      nominationBallots: {},
      nominationVoteCounts: {},
      autoNomineeId: null,
      immunityWinnerId: null,
    },
  }

  const store = configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: state },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(secretMissionMiddleware),
  })

  return { store, human, candidates }
}

function makeClassicTargetMissionStore() {
  const base = createInitialGameState({ seed: 215, seasonArchives: [] })
  const players = base.players
    .slice(0, 8)
    .map((player) => ({ ...player, status: 'active' as const }))
  const human = players.find((player) => player.isUser)!
  const candidates = players.filter((player) => player.id !== human.id)
  const targetIds = candidates.slice(0, 2).map((player) => player.id)
  const targetPoolIds = candidates.slice(0, 3).map((player) => player.id)
  const targetNamesById = Object.fromEntries(
    candidates.slice(0, 3).map((player) => [player.id, player.name])
  )
  const mission = createSecretMissionState(3, { templateId: 'silent_witness' })
  const task: MissionTask = {
    id: 'target-nominated',
    type: 'target_nominated',
    description: `Get one of these two marked houseguests nominated before Day 6: ${targetNamesById[targetIds[0]]} or ${targetNamesById[targetIds[1]]}`,
    current: 0,
    target: 1,
    completed: false,
    startDay: 3,
    endDay: 6,
    targetDay: 6,
    targetPlayerId: targetIds[0],
    targetPlayerIds: targetIds,
    targetCandidatePoolIds: targetPoolIds,
    targetCandidateNamesById: targetNamesById,
    completedTargetPlayerIds: [],
  }
  mission.status = 'accepted'
  mission.tasks = [task]

  const state = {
    ...base,
    week: 3,
    phase: 'nomination_results' as const,
    players,
    secretMission: mission,
    lohId: human.id,
    nomineeIds: [],
    awaitingNominations: true,
    publicModeEnabled: false,
  }
  const store = configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: state },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(secretMissionMiddleware),
  })

  return { store, human, candidates, targetIds, targetPoolIds }
}

describe('mode-specific mission progress', () => {
  it('loads recent mission themes from the previous season archive', () => {
    const initial = createInitialGameState({
      seed: 125,
      seasonArchives: [
        {
          seasonIndex: 1,
          seasonId: 'season-1',
          playerSummaries: [],
          secretMissionTemplateIds: ['silent_witness', 'social_engine'],
        },
      ],
    })

    expect(initial.season).toBe(2)
    expect(initial.secretMissionTemplateHistory).toEqual(['silent_witness', 'social_engine'])
  })

  it('credits a valid Vox secret ballot without depending on the house-wide nomination result', () => {
    const { store, human, candidates } = makeVoxMissionStore()
    store.dispatch(commitNominees(candidates.slice(0, 2).map((player) => player.id)))

    const task = store.getState().game.secretMission?.tasks[0]
    expect(store.getState().game.voxPopuli?.nominationBallots[human.id]).toHaveLength(2)
    expect(task?.type).toBe('vox_ballot_cast')
    expect(task?.completed).toBe(true)
    expect(task?.completedBallotDays).toEqual([3])
  })

  it('lets either marked classic target satisfy the nomination objective', () => {
    const { store, candidates, targetIds } = makeClassicTargetMissionStore()
    const secondTargetId = targetIds[1]
    const secondOtherChoice = candidates.find((player) => !targetIds.includes(player.id))!.id
    store.dispatch(commitNominees([secondTargetId, secondOtherChoice]))

    const task = store.getState().game.secretMission?.tasks[0]
    expect(task?.completed).toBe(true)
    expect(task?.completedTargetPlayerIds).toEqual([secondTargetId])
  })

  it('replaces an evicted marked target while preserving another nomination attempt', () => {
    const { store, candidates, targetIds, targetPoolIds } = makeClassicTargetMissionStore()
    const current = store.getState().game
    const unavailableId = targetIds[0]
    const players = current.players.map((player) =>
      player.id === unavailableId ? { ...player, status: 'evicted' as const } : player
    )
    store.dispatch(hydrateGame({ ...current, players }))

    const task = store.getState().game.secretMission?.tasks[0]
    expect(task?.targetPlayerIds).toHaveLength(2)
    expect(task?.targetPlayerIds).not.toContain(unavailableId)
    expect(task?.targetPlayerIds).toContain(targetPoolIds[2])
    expect(task?.completed).toBe(false)
    expect(candidates.some((player) => task?.targetPlayerIds?.includes(player.id))).toBe(true)
  })
})
