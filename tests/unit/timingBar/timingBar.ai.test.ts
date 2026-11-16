import { describe, expect, it } from 'vitest'
import { simulateAiRoundSubmission } from '../../../src/components/TimingBar/timingBarAi'
import { computeRawAccuracy } from '../../../src/components/TimingBar/timingBarLogic'
import type { CompetitionSkillProfile } from '../../../src/ai/competition/types'

const PROFILE: CompetitionSkillProfile = {
  overall: 50,
  physical: 50,
  mental: 50,
  precision: 50,
  nerve: 50,
  consistency: 50,
  clutch: 50,
  chokeRisk: 50,
  luck: 50,
}

function averageLockedAccuracy(roundNumber: number, profile = PROFILE): number {
  const accuracies: number[] = []
  for (let seed = 1; seed <= 1_000; seed += 1) {
    const submission = simulateAiRoundSubmission(profile, 'timing-ai', roundNumber, seed)
    if (!submission.timedOut) accuracies.push(computeRawAccuracy(submission.lockedPosition))
  }
  return accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length
}

describe('Timing Bar AI speed response', () => {
  it('loses accuracy as the bar gets faster across rounds', () => {
    const firstRound = averageLockedAccuracy(1)
    const finalRound = averageLockedAccuracy(5)

    expect(finalRound).toBeLessThan(firstRound - 8)
  })

  it('retains the precision profile advantage at equal bar speed', () => {
    const precise = averageLockedAccuracy(3, { ...PROFILE, precision: 85, chokeRisk: 20 })
    const imprecise = averageLockedAccuracy(3, { ...PROFILE, precision: 25, chokeRisk: 60 })

    expect(precise).toBeGreaterThan(imprecise + 8)
  })
})
