import { describe, expect, it } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  acceptSecretMission,
  claimMissionReward,
  completeMission,
  declineSecretMission,
  offerSecretMission,
  triggerSecretMission,
  tryActivateSecretMission,
  hydrateGame,
} from '../../../src/store/gameSlice'
import settingsReducer, { setSim } from '../../../src/store/settingsSlice'
import {
  buildMissionTasks,
  checkSecretMissionTrigger,
  createSecretMissionState,
  getSecretMissionBoxRewards,
  getMissionTaskSetSignature,
  getFirstSecretMissionScheduledDay,
  findSecretMissionTaskReference,
  getSecretMissionTaskHint,
  getSecretMissionTriggerChance,
  isSecretMissionSuccessful,
  MISSION_TEMPLATES,
  pickMissionTemplate,
  SECOND_SECRET_MISSION_CHANCE,
  type SecretMissionTriggerContext,
  type MissionTemplate,
} from '../../../src/bb/secretMission'
import { SOCIAL_ACTIONS } from '../../../src/social/socialActions'

function makeStore() {
  return configureStore({
    reducer: {
      game: (
        state: Parameters<typeof gameReducer>[0],
        action: Parameters<typeof gameReducer>[1]
      ) => {
        const next = gameReducer(state, action)
        return action.type === 'game/triggerSecretMission' && next.secretMission
          ? { ...next, secretMission: { ...next.secretMission, rewardVersion: undefined } }
          : next
      },
      settings: settingsReducer,
    },
  })
}

const alwaysReturn = (value: number) => () => value
const makeTriggerContext = (
  overrides: Partial<SecretMissionTriggerContext> = {}
): SecretMissionTriggerContext => ({
  day: 3,
  aliveCount: 8,
  seasonMissionCount: 0,
  secondMissionRollResolved: false,
  ...overrides,
})

describe('getSecretMissionTriggerChance', () => {
  it('guarantees the first mission from the first eligible day', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 2 }))).toBe(0)
    expect(
      getSecretMissionTriggerChance(makeTriggerContext({ day: 3, seasonMissionCount: 0 }))
    ).toBe(1)
  })

  it('returns 0 when aliveCount is final-5-or-fewer', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 5 }))).toBe(0)
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 4 }))).toBe(0)
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 6 }))).toBe(1)
  })

  it('uses a flat 50% chance for the second mission before the roll is resolved', () => {
    expect(
      getSecretMissionTriggerChance(
        makeTriggerContext({
          day: 7,
          seasonMissionCount: 1,
          secondMissionRollResolved: false,
        })
      )
    ).toBe(SECOND_SECRET_MISSION_CHANCE)
    expect(
      getSecretMissionTriggerChance(
        makeTriggerContext({
          day: 7,
          seasonMissionCount: 1,
          secondMissionRollResolved: true,
        })
      )
    ).toBe(0)
  })

  it('uses the debug override when provided', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 100 }))).toBe(1)
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 0 }))).toBe(0)
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 35 }))).toBe(0.35)
  })
})

describe('checkSecretMissionTrigger', () => {
  it('never fires before day 3', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 2 }), alwaysReturn(0))).toBe(false)
  })

  it('fires on day 3 for the guaranteed first mission boundary', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 3 }), alwaysReturn(0.99))).toBe(true)
  })

  it('respects alive-count gating', () => {
    expect(
      checkSecretMissionTrigger(makeTriggerContext({ day: 7, aliveCount: 5 }), alwaysReturn(0))
    ).toBe(false)
    expect(
      checkSecretMissionTrigger(makeTriggerContext({ day: 7, aliveCount: 6 }), alwaysReturn(0))
    ).toBe(true)
  })

  it('uses the computed probability threshold', () => {
    expect(
      checkSecretMissionTrigger(
        makeTriggerContext({
          day: 5,
          seasonMissionCount: 1,
          secondMissionRollResolved: false,
        }),
        alwaysReturn(0.25)
      )
    ).toBe(true)
    expect(
      checkSecretMissionTrigger(
        makeTriggerContext({
          day: 5,
          seasonMissionCount: 1,
          secondMissionRollResolved: false,
        }),
        alwaysReturn(0.75)
      )
    ).toBe(false)
  })
})

describe('mission generation', () => {
  it('keeps five templates and spreads first-mission timing across Days 3–5', () => {
    expect(MISSION_TEMPLATES).toHaveLength(5)
    expect(new Set(MISSION_TEMPLATES.map((template) => template.id)).size).toBe(5)
    expect(
      new Set(Array.from({ length: 50 }, (_, seed) => getFirstSecretMissionScheduledDay(seed, 1)))
    ).toEqual(new Set([3, 4, 5]))
  })

  it('selects themes deterministically and avoids recent mission themes', () => {
    const first = pickMissionTemplate(5, undefined, { seed: 341, season: 4 })
    const repeated = pickMissionTemplate(5, undefined, { seed: 341, season: 4 })
    const next = pickMissionTemplate(5, undefined, {
      seed: 341,
      season: 5,
      previousTemplateIds: [first.id],
    })

    expect(repeated.id).toBe(first.id)
    expect(next.id).not.toBe(first.id)
  })

  it('persists each selected theme and avoids reusing it for the next mission', () => {
    const initial = gameReducer(undefined, { type: '@@INIT' })
    const previousTheme = MISSION_TEMPLATES[0].id
    const withHistory = {
      ...initial,
      season: 4,
      seed: 187,
      secretMissionTemplateHistory: [previousTheme],
    }
    const next = gameReducer(withHistory, triggerSecretMission(5))

    expect(next.secretMission?.templateId).not.toBe(previousTheme)
    expect(next.secretMissionTemplateHistory?.at(-1)).toBe(next.secretMission?.templateId)
  })

  it('creates mission state with explicit mission window metadata', () => {
    const mission = createSecretMissionState(4)
    expect(mission.status).toBe('available')
    expect(mission.startDay).toBe(4)
    expect(mission.endDay).toBeGreaterThan(4)
    expect(mission.targetDeadlineDay).toBe(mission.endDay)
  })

  it('limits template selection to those that fit before final 5 when a max day span is provided', () => {
    const mission = createSecretMissionState(8, { maxDaySpan: 3, missionNumber: 2 })
    expect(mission.endDay - mission.startDay).toBeLessThanOrEqual(3)
    expect(mission.missionNumber).toBe(2)
  })

  it('shuffles mystery-box rewards deterministically per mission', () => {
    const mission = createSecretMissionState(5, { missionNumber: 1 })
    const laterMission = createSecretMissionState(8, { missionNumber: 2 })
    const firstOrder = getSecretMissionBoxRewards(mission)
    const secondOrder = getSecretMissionBoxRewards(mission)
    const laterOrder = getSecretMissionBoxRewards(laterMission)
    expect(secondOrder).toEqual(firstOrder)
    expect(new Set(firstOrder)).toEqual(
      new Set(['resourceCache', 'doubleVote', 'voteDeduction', 'immunity'])
    )
    expect(laterOrder).not.toEqual(firstOrder)
  })

  it('builds exactly five distinct requirement types and always includes survive_days', () => {
    const template = pickMissionTemplate(5)
    const tasks = buildMissionTasks(template, 5, {
      targetCandidateIds: ['p1', 'p2', 'p3'],
    })
    expect(tasks).toHaveLength(5)
    const taskTypes = tasks.map((task) => task.type)
    expect(taskTypes).toContain('survive_days')
    expect(new Set(taskTypes).size).toBe(5)
  })

  it('keeps missions multi-module and replaces leader strategy with a Vox ballot objective', () => {
    const template = MISSION_TEMPLATES[0]
    const common = {
      seed: 292,
      targetCandidateIds: ['p1', 'p2', 'p3', 'p4'],
      capabilities: { publicModeEnabled: false, nominationTargetCount: 4 },
    }
    const classicTasks = buildMissionTasks(template, 4, {
      ...common,
      capabilities: { ...common.capabilities, gameMode: 'classic' },
    })
    const voxTasks = buildMissionTasks(template, 4, {
      ...common,
      capabilities: { ...common.capabilities, gameMode: 'vox_populi' },
    })

    expect(
      classicTasks.some(
        (task) => task.type === 'competition_placement' || task.type === 'avoid_last_place'
      )
    ).toBe(true)
    expect(
      classicTasks.some(
        (task) => task.type === 'social_action_count' || task.type === 'social_energy_empty_streak'
      )
    ).toBe(true)
    expect(
      voxTasks.some(
        (task) => task.type === 'competition_placement' || task.type === 'avoid_last_place'
      )
    ).toBe(true)
    expect(
      voxTasks.some(
        (task) => task.type === 'social_action_count' || task.type === 'social_energy_empty_streak'
      )
    ).toBe(true)
    expect(voxTasks.some((task) => task.type === 'vox_ballot_cast')).toBe(true)
    expect(voxTasks.some((task) => task.type === 'target_nominated')).toBe(false)
    expect(voxTasks.map((task) => task.description).join(' ')).not.toMatch(
      /\bLOH\b|Leader of the House/i
    )
  })

  it('generates a different checklist when the prior task-set signature is excluded', () => {
    const template = pickMissionTemplate(5)
    const first = buildMissionTasks(template, 5, { missionNumber: 1 })
    const firstSignature = getMissionTaskSetSignature(first)
    const second = buildMissionTasks(template, 5, {
      missionNumber: 2,
      excludedTaskSetSignatures: [firstSignature],
    })

    expect(getMissionTaskSetSignature(second)).not.toBe(firstSignature)
  })

  it('recognizes numeric and ordinal task references and gives actionable energy hints', () => {
    const tasks = buildMissionTasks(pickMissionTemplate(5), 5, { missionNumber: 1 })
    const energyTask = {
      ...tasks[0],
      type: 'social_energy_empty_streak' as const,
    }
    const hintTasks = [tasks[0], tasks[1], energyTask, tasks[3], tasks[4]]

    expect(findSecretMissionTaskReference('How do I complete task 3?', hintTasks)?.task).toBe(
      energyTask
    )
    expect(
      findSecretMissionTaskReference('Give me more info on the third task', hintTasks)?.task
    ).toBe(energyTask)
    expect(getSecretMissionTaskHint(energyTask, 3)).toMatch(/Social Energy badge \(⚡\).*0/i)
  })

  it('builds target-nominated tasks with a concrete target when selected', () => {
    const template = MISSION_TEMPLATES.find((entry) => entry.id === 'big_eye_gambit')!
    const tasks = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
    })
    const targetTask = tasks.find((task) => task.type === 'target_nominated')
    if (targetTask) {
      expect(['alpha', 'beta', 'gamma']).toContain(targetTask.targetPlayerId)
      expect(targetTask.targetDay).toBeGreaterThanOrEqual(6)
    }
  })

  it('formats generated social action labels without underscores in user-facing task text', () => {
    for (const template of MISSION_TEMPLATES) {
      const tasks = buildMissionTasks(template, 6, {
        targetCandidateIds: ['alpha', 'beta', 'gamma'],
      })
      for (const task of tasks) {
        expect(task.description).not.toContain('group_chat')
      }
    }
  })

  it('builds concrete social tasks instead of generic random interaction counts', () => {
    const template: MissionTemplate = {
      id: 'social-proof',
      title: 'Social Proof',
      description: 'Forces social task generation in the deterministic test path.',
      daySpan: 3,
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 10,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 0,
      },
    }
    const socialTask = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
    }).find((task) => task.type === 'social_action_count')

    expect(socialTask).toBeDefined()
    expect(socialTask?.description).not.toContain('Complete 3 social interactions')
    expect(
      /Form an alliance|Start a fight|Complete this social set|Build your social position|Work the room/.test(
        socialTask?.description ?? ''
      )
    ).toBe(true)
  })

  it('treats the easter egg task as optional once all other tasks are done', () => {
    const tasks = [
      { id: '1', type: 'survive_days', description: '', current: 1, target: 1, completed: true },
      {
        id: '2',
        type: 'competition_placement',
        description: '',
        current: 1,
        target: 1,
        completed: true,
      },
      {
        id: '3',
        type: 'avoid_last_place',
        description: '',
        current: 2,
        target: 2,
        completed: true,
      },
      {
        id: '4',
        type: 'public_approval_gain',
        description: '',
        current: 5,
        target: 5,
        completed: true,
      },
      {
        id: '5',
        type: 'easter_egg_discovery',
        description: '',
        current: 0,
        target: 1,
        completed: false,
        optional: true,
      },
    ] as const

    expect(isSecretMissionSuccessful(tasks)).toBe(true)
  })

  it('lets a completed easter egg task substitute for one incomplete required task', () => {
    const tasks = [
      { id: '1', type: 'survive_days', description: '', current: 1, target: 1, completed: true },
      {
        id: '2',
        type: 'competition_placement',
        description: '',
        current: 0,
        target: 1,
        completed: false,
      },
      {
        id: '3',
        type: 'avoid_last_place',
        description: '',
        current: 2,
        target: 2,
        completed: true,
      },
      {
        id: '4',
        type: 'public_approval_gain',
        description: '',
        current: 5,
        target: 5,
        completed: true,
      },
      {
        id: '5',
        type: 'easter_egg_discovery',
        description: '',
        current: 1,
        target: 1,
        completed: true,
        optional: true,
      },
    ] as const

    expect(isSecretMissionSuccessful(tasks)).toBe(true)
  })

  it('does not let a new optional Big Eye discovery replace an unfinished objective', () => {
    const tasks = [
      { id: '1', type: 'survive_days', description: '', current: 1, target: 1, completed: true },
      {
        id: '2',
        type: 'competition_placement',
        description: '',
        current: 0,
        target: 1,
        completed: false,
      },
      {
        id: '3',
        type: 'avoid_last_place',
        description: '',
        current: 2,
        target: 2,
        completed: true,
      },
      {
        id: '4',
        type: 'public_approval_gain',
        description: '',
        current: 5,
        target: 5,
        completed: true,
      },
      {
        id: '5',
        type: 'easter_egg_discovery',
        description: '',
        current: 1,
        target: 1,
        completed: true,
        optional: true,
        waivesOneIncompleteTask: false,
      },
    ] as const

    expect(isSecretMissionSuccessful(tasks)).toBe(false)
  })

  it('does not let the easter egg cover more than one incomplete required task', () => {
    const tasks = [
      { id: '1', type: 'survive_days', description: '', current: 0, target: 1, completed: false },
      {
        id: '2',
        type: 'competition_placement',
        description: '',
        current: 0,
        target: 1,
        completed: false,
      },
      {
        id: '3',
        type: 'avoid_last_place',
        description: '',
        current: 2,
        target: 2,
        completed: true,
      },
      {
        id: '4',
        type: 'public_approval_gain',
        description: '',
        current: 5,
        target: 5,
        completed: true,
      },
      {
        id: '5',
        type: 'easter_egg_discovery',
        description: '',
        current: 1,
        target: 1,
        completed: true,
        optional: true,
      },
    ] as const

    expect(isSecretMissionSuccessful(tasks)).toBe(false)
  })
})

describe('game slice mission flow', () => {
  it('accepts a triggered mission and creates a five-task checklist', () => {
    const store = makeStore()
    store.dispatch(triggerSecretMission(5))
    store.dispatch(offerSecretMission(5))
    store.dispatch(acceptSecretMission())
    const mission = store.getState().game.secretMission!
    expect(mission.status).toBe('accepted')
    expect(mission.tasks).toHaveLength(5)
  })

  it('declines an offered mission and records the decline day', () => {
    const store = makeStore()
    store.dispatch(triggerSecretMission(5))
    store.dispatch(offerSecretMission(5))
    store.dispatch(declineSecretMission(5))
    const mission = store.getState().game.secretMission!
    expect(mission.status).toBe('declined')
    expect(mission.declinedDay).toBe(5)
  })

  it('completes the checklist and claims an immunity reward', () => {
    const store = makeStore()
    store.dispatch(triggerSecretMission(5))
    store.dispatch(offerSecretMission(5))
    store.dispatch(acceptSecretMission())
    store.dispatch(completeMission())
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }))
    const mission = store.getState().game.secretMission!
    expect(mission.status).toBe('rewardClaimed')
    expect(mission.reward?.type).toBe('immunity')
    expect(mission.reward?.durationDays).toBe(2)
    expect(mission.reward?.activeUntilDay).toBe(6)
  })

  it('preserves the seasonal mission cap for legacy saves that only retain missionNumber', () => {
    const store = makeStore()
    const current = store.getState().game
    store.dispatch(
      hydrateGame({
        ...current,
        secretMissionCount: undefined,
        secretMission: {
          ...createSecretMissionState(6, { missionNumber: 2 }),
          status: 'expired',
        },
      })
    )

    store.dispatch(triggerSecretMission(8))
    expect(store.getState().game.secretMission?.triggeredDay).toBe(6)
    expect(store.getState().game.secretMissionCount).toBeUndefined()
  })
})

describe('tryActivateSecretMission', () => {
  function setWeek(store: ReturnType<typeof makeStore>, week: number, aliveCount = 12) {
    const current = store.getState().game
    const players = current.players.map((player, index) => ({
      ...player,
      status: index < aliveCount ? 'active' : 'evicted',
    }))
    players[0] = { ...players[0], isUser: true, status: 'active' }
    store.dispatch(
      hydrateGame({
        ...current,
        week,
        phase: 'week_start',
        players,
      })
    )
  }

  it('waits until its seeded Day 3–5 reveal date before triggering the first mission', () => {
    const store = makeStore()
    const current = store.getState().game
    const scheduledDay = getFirstSecretMissionScheduledDay(current.seed, current.season)
    if (scheduledDay > 3) {
      setWeek(store, scheduledDay - 1, 6)
      expect(store.dispatch(tryActivateSecretMission())).toBe(false)
    }
    setWeek(store, scheduledDay, 6)
    expect(store.dispatch(tryActivateSecretMission())).toBe(true)
  })

  it('can trigger a second mission after the first one is resolved', () => {
    const store = makeStore()
    const initial = store.getState().game
    setWeek(store, getFirstSecretMissionScheduledDay(initial.seed, initial.season), 9)
    expect(store.dispatch(tryActivateSecretMission())).toBe(true)

    const current = store.getState().game
    store.dispatch(
      hydrateGame({
        ...current,
        week: 10,
        phase: 'week_start',
        secretMissionCount: 1,
        secretMissionSecondChanceResolved: false,
        secretMissionLastResolvedDay: 6,
        secretMission: {
          ...current.secretMission!,
          status: 'expired',
        },
      })
    )
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }))
    expect(store.dispatch(tryActivateSecretMission())).toBe(true)
    expect(store.getState().game.secretMissionCount).toBe(2)
    expect(store.getState().game.secretMission?.missionNumber).toBe(2)
  })

  it('does not start a second mission if there is not enough runway before final 5', () => {
    const store = makeStore()
    setWeek(store, 7, 7)
    const current = store.getState().game
    store.dispatch(
      hydrateGame({
        ...current,
        secretMissionCount: 1,
        secretMissionSecondChanceResolved: false,
        secretMission: {
          ...createSecretMissionState(3),
          status: 'expired',
        },
      })
    )

    expect(store.dispatch(tryActivateSecretMission())).toBe(false)
    expect(store.getState().game.secretMissionCount).toBe(1)
    expect(store.getState().game.secretMissionSecondChanceResolved).toBe(true)
  })

  it('only generates social requirements the human player can use in every mode', () => {
    const template: MissionTemplate = {
      id: 'social-achievability',
      title: 'Social Achievability',
      description: 'Exercises each deterministic social-set variant.',
      daySpan: 3,
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 10,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 0,
      },
    }

    for (let missionNumber = 1; missionNumber <= 20; missionNumber += 1) {
      const socialTask = buildMissionTasks(template, 6, { missionNumber }).find(
        (task) => task.type === 'social_action_count'
      )
      expect(socialTask).toBeDefined()
      for (const actionId of socialTask?.requiredActionIds ?? []) {
        const action = SOCIAL_ACTIONS.find((candidate) => candidate.id === actionId)
        expect(action).toBeDefined()
        expect(action?.aiOnly).not.toBe(true)
        expect(action?.realityExclusive).not.toBe(true)
        expect(action?.dramaOnly).not.toBe(true)
        expect(action?.voxOnly).not.toBe(true)
        expect(action?.unavailableInVox).not.toBe(true)
        expect(action?.allowedPhases).toBeUndefined()
        expect(action?.requiredActorStatus).toBeUndefined()
        expect(action?.requiredTargetStatus).toBeUndefined()
      }
    }
  })

  it('keeps the second-mission roll available but blocks it during the three-day cooldown', () => {
    const store = makeStore()
    setWeek(store, 7, 9)
    const current = store.getState().game
    store.dispatch(
      hydrateGame({
        ...current,
        secretMissionCount: 1,
        secretMissionSecondChanceResolved: false,
        secretMissionLastResolvedDay: 5,
        secretMission: {
          ...createSecretMissionState(3),
          status: 'expired',
        },
      })
    )
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }))

    expect(store.dispatch(tryActivateSecretMission())).toBe(false)
    expect(store.getState().game.secretMissionCount).toBe(1)
    expect(store.getState().game.secretMissionSecondChanceResolved).toBe(false)
  })

  it('allows a second mission exactly three days before Final 5 once its cooldown passed', () => {
    const store = makeStore()
    setWeek(store, 9, 8)
    const current = store.getState().game
    store.dispatch(
      hydrateGame({
        ...current,
        secretMissionCount: 1,
        secretMissionSecondChanceResolved: false,
        secretMissionLastResolvedDay: 5,
        secretMission: {
          ...createSecretMissionState(3),
          status: 'expired',
        },
      })
    )
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }))

    expect(store.dispatch(tryActivateSecretMission())).toBe(true)
    expect(store.getState().game.secretMission?.missionNumber).toBe(2)
  })

  it('blocks activation once the game reaches final 5', () => {
    const store = makeStore()
    setWeek(store, 7, 5)
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }))
    expect(store.dispatch(tryActivateSecretMission())).toBe(false)
    expect(store.getState().game.secretMission).toBeUndefined()
  })
})
