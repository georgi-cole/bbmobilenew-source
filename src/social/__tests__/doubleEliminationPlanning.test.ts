import { describe, expect, it } from 'vitest'
import gameReducer from '../../store/gameSlice'
import socialReducer from '../socialSlice'
import { formatLohSafetyConsultation } from '../lohSafetyConsultation'
import { buildAllianceConsultationPlan, buildLohConsultationSummary } from '../reality/humanFlow'
import { createInitialRealityDomainState, createRealityAlliance } from '../reality'
import type { RootState } from '../../store/store'
import type { LohNominationPlan } from '../../store/lohNominationPlanning'

const cast = [
  { id: 'human', name: 'Human', status: 'active' as const, isUser: true },
  { id: 'ally', name: 'Ally', status: 'active' as const },
  { id: 'loh', name: 'Quinn', status: 'loh' as const },
  { id: 'nominee-a', name: 'Vee', status: 'nominated' as const },
  { id: 'nominee-b', name: 'Echo', status: 'nominated' as const },
  { id: 'nominee-c', name: 'Ash', status: 'nominated' as const },
  { id: 'safety', name: 'Safety', status: 'active' as const },
]

const doublePlan: LohNominationPlan = {
  week: 4,
  lohId: 'loh',
  isDoubleElimination: true,
  targetId: 'nominee-a',
  backupTargetId: 'nominee-b',
  pawnIds: ['nominee-b', 'nominee-c'],
  initialNomineeIds: ['nominee-a', 'nominee-b', 'nominee-c'],
  eliminationPriorityIds: ['nominee-a', 'nominee-b'],
  preferredSurvivorId: 'nominee-c',
  replacementTargetId: 'nominee-b',
  strategy: 'direct',
  status: 'initial_block_set',
  selectionBasis: 'strategy',
  targetScore: 50,
  backdoorChance: 0,
}

describe('double-elimination social planning', () => {
  it('gives alliance consultations two elimination priorities during the block strategy phase', () => {
    const initialGame = gameReducer(undefined, { type: '@@test/init' })
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'alliance',
      founderIds: ['human', 'ally'],
      memberIds: [],
      purpose: 'Coordinate the block',
      at: { day: 4, phase: 'pos_results' },
    })
    alliance.status = 'ACTIVE'

    const state = {
      game: {
        ...initialGame,
        players: cast,
        week: 4,
        phase: 'pos_results',
        lohId: 'loh',
        posWinnerId: 'safety',
        nomineeIds: ['nominee-a', 'nominee-b', 'nominee-c'],
        doubleEviction: { ...initialGame.doubleEviction!, weekActive: true },
      },
      social: { ...socialReducer(undefined, { type: '@@test/init' }), reality },
    } as unknown as RootState

    const plan = buildAllianceConsultationPlan(state, alliance, 'human')

    expect(plan?.agenda).toBe('block_strategy')
    expect(plan?.targetIds).toHaveLength(2)
    expect(plan?.summary).toContain('Double elimination strategy')
    expect(plan?.summary).toContain('2 of 2 exit spots planned')
    expect(plan?.memberPlanBeliefs.human).toHaveLength(2)
  })

  it('states both planned exits and the preferred survivor in a truthful locked-block read', () => {
    const game = {
      week: 4,
      phase: 'social_2',
      lohId: 'loh',
      players: cast,
      nomineeIds: ['nominee-a', 'nominee-b', 'nominee-c'],
      doubleEviction: { weekActive: true },
      lohNominationPlan: doublePlan,
      lohSocialPlan: {
        week: 4,
        lohId: 'loh',
        currentTargetId: 'nominee-a',
        backupTargetId: 'nominee-b',
        askCountsByPlayerId: { human: 1 },
        disclosedTargetByPlayerId: { human: 'nominee-a' },
        disclosureOutcomeByPlayerId: { human: 'truthful' as const },
      },
    }

    const summary = buildLohConsultationSummary(
      { game } as unknown as RootState,
      { actorId: 'human', targetId: 'loh', actionId: 'ask_loh_target' },
      'Vee is my current target.'
    )

    expect(summary).toContain('Vee and Echo')
    expect(summary).toContain('two elimination priorities')
    expect(summary).toContain('Ash to stay')
    expect(summary).toContain('which two nominees leave')
  })

  it('includes both intended exits when the Safety holder asks the LOH for advice', () => {
    const summary = formatLohSafetyConsultation(
      {
        week: 4,
        phase: 'pos_results',
        lohId: 'loh',
        posWinnerId: 'safety',
        players: cast,
        nomineeIds: ['nominee-a', 'nominee-b', 'nominee-c'],
        doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
        lohNominationPlan: doublePlan,
      },
      'safety'
    )

    expect(summary).toContain('Vee and Echo')
    expect(summary).toContain('Ash to stay')
  })
})
