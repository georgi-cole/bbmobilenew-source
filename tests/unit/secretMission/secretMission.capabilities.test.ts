import { describe, expect, it } from 'vitest'
import {
  buildMissionTasks,
  createSecretMissionState,
  MISSION_TEMPLATES,
  type MissionTemplate,
} from '../../../src/bb/secretMission'
import gameReducer, { acceptSecretMission } from '../../../src/store/gameSlice'

const PUBLIC_ONLY_TEMPLATE: MissionTemplate = {
  id: 'capability-public-only',
  title: 'Capability Test',
  description: 'Forces the public objective when it is eligible.',
  daySpan: 3,
  requirementWeights: {
    competition_placement: 0,
    avoid_last_place: 0,
    public_approval_gain: 1,
    social_energy_empty_streak: 0,
    social_action_count: 0,
    easter_egg_discovery: 0,
    incoming_response_streak: 0,
    target_nominated: 0,
  },
}

function acceptSeededPublicOperatorMission(publicModeEnabled: boolean, seed = 341) {
  const baseState = gameReducer(undefined, { type: '@@INIT' })
  // Pin the theme and the season seed so the public objective is selected in
  // the enabled case and filtered from the disabled case.
  const secretMission = createSecretMissionState(7, {
    missionNumber: 1,
    templateId: 'public_operator',
  })
  secretMission.status = 'offered'

  return gameReducer(
    {
      ...baseState,
      seed,
      publicModeEnabled,
      secretMission,
      secretMissionTaskSetHistory: [],
    },
    acceptSecretMission()
  ).secretMission
}

describe('secret mission capability eligibility', () => {
  it('filters Public Meter objectives when Public Mode is unavailable', () => {
    const tasks = buildMissionTasks(PUBLIC_ONLY_TEMPLATE, 5, {
      missionNumber: 1,
      capabilities: { publicModeEnabled: false },
    })

    expect(tasks).toHaveLength(5)
    expect(tasks.some((task) => task.type === 'public_approval_gain')).toBe(false)
  })

  it('keeps Public Meter objectives eligible when Public Mode is active', () => {
    const tasks = buildMissionTasks(PUBLIC_ONLY_TEMPLATE, 5, {
      missionNumber: 1,
      capabilities: { publicModeEnabled: true },
    })

    expect(tasks).toHaveLength(5)
    expect(tasks.some((task) => task.type === 'public_approval_gain')).toBe(true)
  })

  it('uses the season runtime Public Mode flag when accepting a mission', () => {
    const publicOperator = MISSION_TEMPLATES.find((template) => template.id === 'public_operator')!
    const selectedSeed = Array.from({ length: 1000 }, (_, seed) => seed).find((seed) =>
      buildMissionTasks(publicOperator, 7, {
        seed,
        missionNumber: 1,
        capabilities: {
          publicModeEnabled: true,
          gameMode: 'classic',
          nominationTargetCount: 10,
        },
      }).some((task) => task.type === 'public_approval_gain')
    )
    expect(selectedSeed).toBeDefined()

    const seed = selectedSeed ?? 341
    const disabledMission = acceptSeededPublicOperatorMission(false, seed)
    const enabledMission = acceptSeededPublicOperatorMission(true, seed)

    expect(disabledMission?.tasks).toHaveLength(5)
    expect(disabledMission?.tasks.some((task) => task.type === 'public_approval_gain')).toBe(false)
    expect(enabledMission?.tasks.some((task) => task.type === 'public_approval_gain')).toBe(true)
  })

  it('replaces the LOH nomination objective with a Vox ballot objective', () => {
    const template: MissionTemplate = {
      ...MISSION_TEMPLATES[0],
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 0,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 100,
      },
    }
    const tasks = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
      capabilities: { publicModeEnabled: false, gameMode: 'vox_populi' },
    })

    expect(tasks.some((task) => task.type === 'vox_ballot_cast')).toBe(true)
    expect(tasks.some((task) => task.type === 'target_nominated')).toBe(false)
    expect(tasks.find((task) => task.type === 'vox_ballot_cast')?.description).toMatch(
      /secret nomination ballot/i
    )
    expect(tasks.some((task) => task.type === 'public_approval_gain')).toBe(false)
  })

  it('gives classic nomination goals two named targets so a refused pitch can be retried', () => {
    const template: MissionTemplate = {
      ...MISSION_TEMPLATES[0],
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 0,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 100,
      },
    }
    const tasks = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
      targetCandidateNamesById: { alpha: 'Ari', beta: 'Blair', gamma: 'Casey' },
      capabilities: {
        publicModeEnabled: false,
        gameMode: 'classic',
        nominationTargetCount: 3,
      },
    })
    const targetTask = tasks.find((task) => task.type === 'target_nominated')

    expect(targetTask?.targetPlayerIds).toHaveLength(2)
    expect(targetTask?.description).toMatch(/Ari|Blair|Casey/)
    expect(targetTask?.description).toContain(' or ')
  })

  it('omits a classic nomination task when the game cannot supply two eligible targets', () => {
    const template: MissionTemplate = {
      ...MISSION_TEMPLATES[0],
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 0,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 100,
      },
    }
    const tasks = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha'],
      capabilities: {
        publicModeEnabled: false,
        gameMode: 'classic',
        nominationTargetCount: 1,
      },
    })

    expect(tasks.some((task) => task.type === 'target_nominated')).toBe(false)
  })
})
