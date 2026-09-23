import { describe, expect, it } from 'vitest'
import type { GameState, Player, StrategicAllianceSnapshot } from '../../types'
import gameReducer, {
  getStrategicReplacementNomineeBreakdown,
  pickStrategicReplacementNominee,
} from '../../store/gameSlice'
import { evaluateSocialActionEligibility } from '../socialActionEligibility'
import { validateSocialExecution } from '../socialExecutionGuard'
import { SOCIAL_ACTIONS } from '../socialActions'
import {
  captureRealityReentryProfile,
  createInitialRealityDomainState,
  createRealityAlliance,
  findRealityAllianceForConsultation,
  reconcileRealityBattleBackReturn,
  refreshRealityAllianceDynamics,
  removeRealityAllianceMember,
} from '../reality'
import { resolveLohPlanDisclosure } from '../SocialManeuvers'
import {
  getSuggestedReplacementAcceptanceChance,
  processHumanSocialStrategyAction,
} from '../socialStrategyActions'
import { seededUnit, type StrategyState } from '../socialStrategyShared'
import type { SocialActionDefinition } from '../socialActions'

function socialAction(id: string): SocialActionDefinition {
  const value = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
  if (!value) throw new Error(`Missing action ${id}`)
  return value
}

function makeReentryState() {
  const state = createInitialRealityDomainState()
  const alliance = createRealityAlliance(state, {
    id: 'returning-pact',
    founderIds: ['returner', 'survivor'],
    memberIds: [],
    purpose: 'Protect one another',
    at: { day: 4, phase: 'eviction_results' },
  })
  alliance.status = 'ACTIVE'
  alliance.memberCommitment.returner = 0.9
  alliance.memberCommitment.survivor = 0.9
  refreshRealityAllianceDynamics(alliance)
  captureRealityReentryProfile(state, 'returner', { day: 4, phase: 'eviction_results' })
  removeRealityAllianceMember(state, {
    allianceId: alliance.id,
    memberId: 'returner',
    actorId: 'returner',
    kind: 'EVICTED',
    at: { day: 4, phase: 'eviction_results' },
    sourceEventId: 'test-eviction',
  })
  return state
}

describe('Battle Back alliance reconciliation', () => {
  it.each([
    [4, 'ACTIVE'],
    [5, 'ACTIVE'],
    [6, 'PROBATIONARY'],
    [7, 'FORMER'],
  ] as const)(
    'reassesses a %i-day return as %s instead of replaying the old pact',
    (day, expected) => {
      const state = makeReentryState()
      const outcome = reconcileRealityBattleBackReturn(state, {
        playerId: 'returner',
        at: { day, phase: 'social_1' },
        activeActorIds: ['returner', 'survivor'],
      })

      if (expected === 'ACTIVE') {
        expect(outcome.restoredAllianceIds).toEqual(['returning-pact'])
        expect(findRealityAllianceForConsultation(state, 'returner', 'survivor')?.status).toBe(
          'ACTIVE'
        )
      } else if (expected === 'PROBATIONARY') {
        expect(outcome.probationaryAllianceIds).toEqual(['returning-pact'])
        expect(findRealityAllianceForConsultation(state, 'returner', 'survivor')?.status).toBe(
          'PROBATIONARY'
        )
      } else {
        expect(outcome.formerAllianceIds).toEqual(['returning-pact'])
        expect(findRealityAllianceForConsultation(state, 'returner', 'survivor')).toBeNull()
      }
      expect(state.reentryProfiles.returner).toBeUndefined()
    }
  )

  it('downgrades an otherwise prompt return when survivors formed a stronger pact', () => {
    const state = makeReentryState()
    const replacementPact = createRealityAlliance(state, {
      id: 'new-core',
      founderIds: ['survivor', 'new-ally'],
      memberIds: [],
      purpose: 'New final two',
      at: { day: 5, phase: 'social_1' },
    })
    replacementPact.status = 'ACTIVE'
    replacementPact.memberCommitment.survivor = 0.99
    replacementPact.memberCommitment['new-ally'] = 0.99
    refreshRealityAllianceDynamics(replacementPact)

    const outcome = reconcileRealityBattleBackReturn(state, {
      playerId: 'returner',
      at: { day: 5, phase: 'social_1' },
      activeActorIds: ['returner', 'survivor', 'new-ally'],
    })

    expect(outcome.probationaryAllianceIds).toEqual(['returning-pact'])
  })
})

describe('canonical social-action eligibility', () => {
  const players = [
    { id: 'user', status: 'active' as const },
    { id: 'ally', status: 'active' as const },
  ]

  it('never advertises Consult Alliance from a stale legacy tag that execution cannot consult', () => {
    const reality = createInitialRealityDomainState()
    const relationships = {
      user: { ally: { affinity: 55, tags: ['alliance'] } },
      ally: { user: { affinity: 55, tags: ['alliance'] } },
    }
    const availability = evaluateSocialActionEligibility({
      action: socialAction('consult_alliance'),
      actorId: 'user',
      targetIds: ['ally'],
      players,
      relationships,
      reality,
      dramaMode: true,
      requireCompleteSelection: true,
    })

    expect(availability.eligible).toBe(false)
    expect(findRealityAllianceForConsultation(reality, 'user', 'ally')).toBeNull()
  })

  it('keeps the shown Consult Alliance action executable under the same unchanged state', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'live-pact',
      founderIds: ['user', 'ally'],
      memberIds: [],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    const state = {
      game: { phase: 'social_1', players },
      settings: { gameUX: { dramaMode: true } },
      social: { relationships: {}, reality },
    }
    const selection = {
      action: socialAction('consult_alliance'),
      actorId: 'user',
      targetIds: ['ally'],
      requireCompleteSelection: true,
    }

    expect(
      evaluateSocialActionEligibility({
        ...selection,
        phase: 'social_1',
        players,
        relationships: {},
        reality,
        dramaMode: true,
      })
    ).toEqual({ eligible: true, reason: '' })
    expect(validateSocialExecution(state, selection).eligible).toBe(true)
    expect(findRealityAllianceForConsultation(reality, 'user', 'ally')).not.toBeNull()
  })

  it('uses the same repairable relationship truth for Private Truce after betrayal', () => {
    const reality = createInitialRealityDomainState()
    const privateTruce = socialAction('repair_bond')
    expect(
      evaluateSocialActionEligibility({
        action: privateTruce,
        actorId: 'user',
        targetIds: ['ally'],
        players,
        relationships: { user: { ally: { affinity: -45, tags: ['betrayal'] } } },
        reality,
        dramaMode: true,
        requireCompleteSelection: true,
      }).eligible
    ).toBe(true)
  })
})

function player(id: string, threat = 1): Player {
  return {
    id,
    name: id,
    status: 'active',
    isUser: id === 'human',
    stats: { lohWins: threat, posWins: threat, timesNominated: 0 },
  } as Player
}

function alliance(memberIds: string[]): StrategicAllianceSnapshot {
  return {
    id: 'core-pact',
    memberIds,
    leaderIds: ['loh'],
    status: 'ACTIVE',
    cohesion: 0.9,
    fractureRisk: 0.05,
    currentTargetIds: [],
    fallbackTargetIds: [],
    memberCommitment: Object.fromEntries(memberIds.map((id) => [id, 0.9])),
    memberPerceivedStatus: Object.fromEntries(memberIds.map((id) => [id, 'CORE' as const])),
    memberPlanBeliefs: Object.fromEntries(memberIds.map((id) => [id, []])),
    infiltratorIds: [],
  }
}

describe('strategic replacement intent', () => {
  it('protects a core ally while honoring a canonical backup plan and bounded variation', () => {
    const loh = player('loh')
    const ally = player('ally', 8)
    const backup = player('backup', 2)
    const state = {
      week: 5,
      phase: 'pos_ceremony',
      seed: 11,
      lohId: loh.id,
      players: [loh, ally, backup],
      dramaSocialMode: true,
      strategicRelationships: {
        loh: {
          ally: { affinity: 70, tags: ['alliance', 'protection'] },
          backup: { affinity: -10, tags: ['target'] },
        },
      },
      strategicAlliances: [alliance(['loh', 'ally'])],
      lohSocialPlan: {
        week: 5,
        lohId: loh.id,
        currentTargetId: null,
        backupTargetId: backup.id,
        askCountsByPlayerId: {},
      },
    } as unknown as GameState

    expect(
      getStrategicReplacementNomineeBreakdown(state, loh.id, backup, 0.3).factors
    ).toMatchObject({
      canonicalBackupPressure: 78,
    })
    expect(pickStrategicReplacementNominee(state, loh.id, [ally, backup], () => 0.4)?.id).toBe(
      backup.id
    )
  })
})

describe('replacement-plan conversations and suggestions', () => {
  it('distinguishes truthful, vague, and ambush-decoy replacement answers', () => {
    const game = {
      players: [
        { id: 'loh', status: 'loh' },
        { id: 'ally', status: 'active' },
        { id: 'asker', status: 'active' },
        { id: 'target', status: 'active' },
        { id: 'decoy', status: 'nominated' },
      ],
    }
    const truth = resolveLohPlanDisclosure({
      game,
      relationships: { loh: { ally: { affinity: 45, tags: ['alliance'] } } },
      lohId: 'loh',
      askerId: 'ally',
      actualTargetId: 'target',
      priorAsks: 0,
      ambushIntent: false,
      random: () => 0,
    })
    const vague = resolveLohPlanDisclosure({
      game,
      relationships: { loh: { asker: { affinity: -30, tags: [] } } },
      lohId: 'loh',
      askerId: 'asker',
      actualTargetId: 'target',
      priorAsks: 0,
      ambushIntent: false,
      random: () => 0.9,
    })
    const falseAnswer = resolveLohPlanDisclosure({
      game,
      relationships: { loh: { asker: { affinity: -30, tags: [] } } },
      lohId: 'loh',
      askerId: 'asker',
      actualTargetId: 'target',
      priorAsks: 0,
      ambushIntent: true,
      random: () => 0,
    })

    expect(truth).toEqual({ outcome: 'truthful', statedTargetId: 'target' })
    expect(vague).toEqual({ outcome: 'vague', statedTargetId: null })
    expect(falseAnswer.outcome).toBe('false')
    expect(falseAnswer.statedTargetId).not.toBe('target')
    expect(falseAnswer.statedTargetId).not.toBe('asker')
  })

  it('allows a trusted human suggestion to update the canonical replacement target', () => {
    const game = {
      week: 5,
      seed: 19,
      lohId: 'loh',
      posWinnerId: null,
      nomineeIds: ['pawn-a', 'pawn-b'],
      povProtectedIds: [],
      players: [
        player('human'),
        player('loh'),
        player('pawn-a'),
        player('pawn-b'),
        player('suggested'),
      ],
      lohNominationPlan: {
        week: 5,
        lohId: 'loh',
        targetId: 'target',
        backupTargetId: 'old-backup',
        pawnIds: ['pawn-a', 'pawn-b'],
        initialNomineeIds: ['pawn-a', 'pawn-b'],
        strategy: 'direct' as const,
        status: 'initial_block_set' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 1,
        backdoorChance: 0,
      },
      lohSocialPlan: {
        week: 5,
        lohId: 'loh',
        currentTargetId: 'target',
        backupTargetId: 'old-backup',
        askCountsByPlayerId: {},
      },
    } as unknown as GameState
    const state = {
      game,
      social: {
        influenceBank: { human: 5 },
        relationships: { loh: { human: { affinity: 95, tags: ['alliance', 'protection'] } } },
      },
    } as unknown as StrategyState
    const entry = {
      actionId: 'suggest_replacement',
      actorId: 'human',
      targetId: 'loh',
      subjectId: 'suggested',
      outcome: 'success' as const,
      timestamp: 1,
    } as import('../types').SocialActionLogEntry
    const chance = getSuggestedReplacementAcceptanceChance(state, entry)
    let timestamp = 1
    while (
      timestamp < 100 &&
      seededUnit(game.seed, `replacement-suggestion:${timestamp}:human:suggested`) > chance
    ) {
      timestamp += 1
    }
    expect(
      seededUnit(game.seed, `replacement-suggestion:${timestamp}:human:suggested`)
    ).toBeLessThanOrEqual(chance)
    entry.timestamp = timestamp
    const actions: unknown[] = []
    processHumanSocialStrategyAction(
      {
        dispatch: ((action: unknown) => {
          actions.push(action)
          return action
        }) as import('../socialStrategyShared').StrategyApi['dispatch'],
      },
      state,
      entry
    )

    expect(actions).toContainEqual({
      type: 'game/adoptSuggestedReplacementTarget',
      payload: { lohId: 'loh', targetId: 'suggested', suggestedById: 'human' },
    })
    const adoption = actions.find(
      (
        action
      ): action is {
        type: string
        payload: { lohId: string; targetId: string; suggestedById: string }
      } =>
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        (action as { type?: string }).type === 'game/adoptSuggestedReplacementTarget'
    )
    if (!adoption) throw new Error('Expected the suggestion to be accepted')
    const updated = gameReducer(game, adoption)
    expect(updated.lohNominationPlan?.replacementTargetOverrideId).toBe('suggested')
    expect(updated.lohSocialPlan?.backupTargetId).toBe('suggested')
  })
})
