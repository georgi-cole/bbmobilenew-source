import { describe, expect, it } from 'vitest'
import { resolveNominationDisclosure } from '../SocialManeuvers'

function decision(overrides: Record<string, unknown> = {}) {
  return {
    week: 3,
    lohId: 'loh',
    nomineeId: 'human',
    stage: 'INITIAL' as const,
    primaryReason: 'STRATEGIC_BUFFER' as const,
    factors: {},
    targetScoreAtDecision: 10,
    eligibleAlternativeIds: [],
    strongerProtectedIds: [],
    forcedChoice: false,
    relationshipTier: 'ORDINARY',
    trustAtDecision: 0,
    lohArchetype: 'strategic_operator',
    lohTemperament: 'adaptable',
    ...overrides,
  }
}

function disclosure(entry: ReturnType<typeof decision>, trust = 0) {
  return resolveNominationDisclosure(
    { week: 3, nominationDecisionReasons: { receipt: entry } },
    'human',
    'loh',
    trust
  )
}

describe('nomination disclosure receipts', () => {
  it('supports truthful, partial, vague, and false outcomes', () => {
    expect(disclosure(decision({ forcedChoice: true })).outcome).toBe('truthful')
    expect(
      disclosure(
        decision({
          primaryReason: 'BACKDOOR_PLAN',
          relationshipTier: 'PRIMARY_ALLIANCE',
          trustAtDecision: 30,
          lohArchetype: 'strategic_operator',
        }),
        30
      ).outcome
    ).toBe('partial')
    expect(
      disclosure(
        decision({
          trustAtDecision: -40,
          lohArchetype: 'double_agent',
          lohTemperament: 'paranoid',
        }),
        -40
      ).outcome
    ).toBe('false')
    expect(
      disclosure(
        decision({
          primaryReason: 'BACKDOOR_PLAN',
          relationshipTier: 'RIDE_OR_DIE',
          trustAtDecision: 0,
          lohArchetype: 'double_agent',
        })
      ).outcome
    ).toBe('vague')
  })

  it('retains close-bond metadata even when the answer is vague', () => {
    const result = disclosure(
      decision({
        primaryReason: 'BACKDOOR_PLAN',
        relationshipTier: 'RIDE_OR_DIE',
        trustAtDecision: 0,
        lohArchetype: 'double_agent',
      })
    )
    expect(result).toMatchObject({ outcome: 'vague', closeBond: true, tier: 'RIDE_OR_DIE' })
  })
})
