import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseStrategicEliminationCandidates,
  createInitialGameState,
  getNominationTargetScore,
  submitDoubleEvictionTieBreak,
} from '../gameSlice'
import type { GameState, Player } from '../../types'
import { getCurrentLohEliminationPriorityIds } from '../../social/lohEliminationPriority'
import { formatLohSafetyConsultation } from '../../social/lohSafetyConsultation'

function prepareDecisionState(): {
  state: GameState
  decider: Player
  target: Player
  neutral: Player
  protectedPlayer: Player
} {
  const state = createInitialGameState({ seed: 812 })
  state.week = 6
  state.dramaSocialMode = false
  state.strategicAlliances = undefined
  const decider = state.players.find((player) => !player.isUser)!
  const [target, neutral, protectedPlayer] = state.players
    .filter((player) => player.id !== decider.id)
    .slice(0, 3)
  if (!target || !neutral || !protectedPlayer) throw new Error('Expected three candidates')

  for (const player of state.players) {
    player.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    player.competitionProfile = undefined
  }
  state.strategicRelationships = {
    [decider.id]: {
      [target.id]: { affinity: -35, tags: ['target'] },
      [neutral.id]: { affinity: 0, tags: [] },
      [protectedPlayer.id]: { affinity: 55, tags: ['alliance'] },
    },
  }
  return { state, decider, target, neutral, protectedPlayer }
}

describe('shared strategic elimination decisions', () => {
  it('prefers the strongest strategic target and reserves seeded variation for close scores', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    const candidateIds = [target.id, protectedPlayer.id]

    for (const seed of [1, 17, 1001]) {
      const decision = chooseStrategicEliminationCandidates(
        state,
        decider.id,
        candidateIds,
        1,
        'ordinary_tie',
        seed
      )
      expect(decision.selectedIds).toEqual([target.id])
    }
  })

  it('lets an active protection promise outweigh an ordinary target preference', () => {
    const { state, decider, target, neutral } = prepareDecisionState()
    state.strategicRelationships![decider.id][target.id] = {
      affinity: -25,
      tags: ['target', 'safety_promise'],
    }

    const decision = chooseStrategicEliminationCandidates(
      state,
      decider.id,
      [target.id, neutral.id],
      1,
      'ordinary_tie',
      22
    )

    expect(decision.selectedIds).toEqual([neutral.id])
    expect(
      decision.rankedCandidates.find((candidate) => candidate.id === target.id)?.factors
    ).toMatchObject({ promiseProtection: -92 })
  })

  it.each(['legacy', 'executed', 'failed', 'compromised'] as const)(
    'keeps the hold-Safety target meaningful with a %s nomination plan',
    (planStatus) => {
      const { state, decider, target, neutral, protectedPlayer } = prepareDecisionState()
      state.lohId = decider.id
      state.phase = 'pos_results'
      state.posWinnerId = protectedPlayer.id
      state.nomineeIds = [neutral.id, target.id]
      state.lohSocialPlan = {
        week: state.week,
        lohId: decider.id,
        currentTargetId: target.id,
        backupTargetId: null,
        askCountsByPlayerId: {},
      }
      if (planStatus !== 'legacy') {
        state.lohNominationPlan = {
          week: state.week,
          lohId: decider.id,
          targetId: planStatus === 'executed' ? target.id : state.posWinnerId,
          backupTargetId: null,
          pawnIds: [neutral.id],
          initialNomineeIds: [...state.nomineeIds],
          strategy: 'backdoor',
          status: planStatus,
          selectionBasis: 'strategy',
          targetScore: 1,
          backdoorChance: 1,
        }
      }
      decider.aiGameIdentity = undefined
      target.aiGameIdentity = undefined
      neutral.aiGameIdentity = undefined
      state.strategicRelationships![decider.id][target.id] = { affinity: 0, tags: [] }
      state.strategicRelationships![decider.id][neutral.id] = { affinity: 0, tags: [] }
      // Give the other nominee a three-point lead after the saved target's
      // preference. A seed must not reverse the freshly stated hold-Safety plan.
      state.strategicRelationships![decider.id][neutral.id].affinity =
        getNominationTargetScore(state, decider.id, neutral) -
        getNominationTargetScore(state, decider.id, target) -
        51

      expect(formatLohSafetyConsultation(state, state.posWinnerId)).toContain(
        `${target.name} as the target`
      )
      for (const seed of [1, 2, 17, 28, 1001, 9001]) {
        const decision = chooseStrategicEliminationCandidates(
          state,
          decider.id,
          [...state.nomineeIds],
          1,
          'ordinary_tie',
          seed
        )
        expect(decision.selectedIds).toEqual([target.id])
        const targetScore = decision.rankedCandidates.find((entry) => entry.id === target.id)!
        const neutralScore = decision.rankedCandidates.find((entry) => entry.id === neutral.id)!
        expect(targetScore.factors.currentPlanContribution).toBe(48)
        expect(neutralScore.total - targetScore.total).toBeCloseTo(3)
      }
    }
  )

  it('lets a substantial new betrayal outweigh the saved LOH target', () => {
    const { state, decider, target, neutral } = prepareDecisionState()
    state.lohId = decider.id
    state.lohSocialPlan = {
      week: state.week,
      lohId: decider.id,
      currentTargetId: target.id,
      backupTargetId: null,
      askCountsByPlayerId: {},
    }
    state.strategicRelationships![decider.id][target.id] = { affinity: 0, tags: [] }
    state.strategicRelationships![decider.id][neutral.id] = {
      affinity: -30,
      tags: ['betrayal'],
    }

    const decision = chooseStrategicEliminationCandidates(
      state,
      decider.id,
      [target.id, neutral.id],
      1,
      'ordinary_tie',
      1
    )

    expect(decision.selectedIds).toEqual([neutral.id])
  })

  it('ignores stale LOH targets, listener cover stories, and targets outside the live choice', () => {
    const { state, decider, target, neutral } = prepareDecisionState()
    state.lohId = decider.id
    state.lohSocialPlan = {
      week: state.week,
      lohId: decider.id,
      currentTargetId: target.id,
      backupTargetId: null,
      askCountsByPlayerId: {},
      disclosedTargetByPlayerId: { [neutral.id]: neutral.id },
      disclosureOutcomeByPlayerId: { [neutral.id]: 'false' },
    }

    expect(getCurrentLohEliminationPriorityIds(state, decider.id, [target.id, neutral.id])).toEqual(
      [target.id]
    )
    expect(getCurrentLohEliminationPriorityIds(state, decider.id, [neutral.id])).toEqual([])
    expect(getCurrentLohEliminationPriorityIds(state, neutral.id, [target.id])).toEqual([])
    state.lohSocialPlan.week -= 1
    expect(getCurrentLohEliminationPriorityIds(state, decider.id, [target.id])).toEqual([])
  })

  it('includes learned jealousy weight and its evidence in the decision record', () => {
    const { state, decider, target, neutral, protectedPlayer } = prepareDecisionState()
    state.dramaSocialMode = true
    state.strategicRelationships![decider.id][target.id] = {
      affinity: 0,
      tags: [],
      knownRomanticRival: {
        partnerId: protectedPlayer.id,
        evidenceDay: 5,
        confidence: 0.72,
        source: 'witnessed',
      },
    }

    const decision = chooseStrategicEliminationCandidates(
      state,
      decider.id,
      [target.id, neutral.id],
      1,
      'ordinary_tie',
      28
    )
    const rivalDecision = decision.rankedCandidates.find((candidate) => candidate.id === target.id)

    expect(rivalDecision?.factors).toMatchObject({
      knownRomanticRivalJealousy: 32,
      jealousyPartnerId: protectedPlayer.id,
      jealousyEvidenceDay: 5,
      jealousyEvidenceConfidence: 0.72,
      jealousyEvidenceSource: 'witnessed',
    })
  })

  it('uses the shared model when an AI Leader breaks an ordinary vote tie', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    decider.status = 'loh'
    state.lohId = decider.id
    state.phase = 'live_vote'
    state.nomineeIds = [target.id, protectedPlayer.id]
    target.status = 'nominated'
    protectedPlayer.status = 'nominated'
    const voters = state.players.filter(
      (player) =>
        player.id !== decider.id &&
        !state.nomineeIds.includes(player.id) &&
        player.status !== 'evicted' &&
        player.status !== 'jury'
    )
    voters.slice(0, 4).forEach((voter, index) => {
      state.votes![voter.id] = index % 2 === 0 ? target.id : protectedPlayer.id
    })

    const result = gameReducer(state, advance())

    expect(result.phase).toBe('eviction_results')
    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.pendingEviction?.evictionMessage).toContain('breaks the tie')
  })

  it('resolves an AI double tie using the strategic ranking rather than the submitted UI order', () => {
    const { state, decider, target, neutral, protectedPlayer } = prepareDecisionState()
    decider.status = 'loh'
    state.lohId = decider.id
    state.phase = 'eviction_results'
    state.nomineeIds = [target.id, neutral.id, protectedPlayer.id]
    state.tiedNomineeIds = [...state.nomineeIds]
    state.awaitingTieBreak = true
    state.doubleEviction = {
      usedCount: 1,
      weekActive: true,
      pendingSecondEviction: null,
    }
    for (const nominee of [target, neutral, protectedPlayer]) nominee.status = 'nominated'

    const result = gameReducer(
      state,
      submitDoubleEvictionTieBreak([protectedPlayer.id, neutral.id])
    )

    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.doubleEviction?.pendingSecondEviction?.evicteeId).toBe(neutral.id)
    expect(result.awaitingTieBreak).toBe(false)
  })

  it('uses the same strategic ranking for an AI Safety holder’s Final Four sole vote', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    decider.status = 'active'
    state.posWinnerId = decider.id
    state.lohId = null
    state.phase = 'final4_eviction'
    state.nomineeIds = [target.id, protectedPlayer.id]
    target.status = 'nominated'
    protectedPlayer.status = 'nominated'

    const result = gameReducer(state, advance())

    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.pendingEviction?.evictionMessage).toContain('chosen to eliminate')
  })
})
