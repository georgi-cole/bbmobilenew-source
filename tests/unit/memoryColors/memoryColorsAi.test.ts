import { describe, expect, it } from 'vitest'
import {
  INITIAL_SEQUENCE_LENGTH,
  MAX_MISTAKES,
  NUM_COLORS,
  simulateAiResult,
} from '../../../src/features/memoryColors/memoryColorsSlice'

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

describe('Memory Colors AI', () => {
  it('replays the same seeded run and uses the same five-mistake stop rule', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const result = simulateAiResult(seed, 'ai-contestant')

      expect(result).toEqual(simulateAiResult(seed, 'ai-contestant'))
      expect(result.mistakesUsed).toBe(MAX_MISTAKES)
      expect(result.roundsCleared).toBe(result.furthestRoundReached! - 1)
      expect(result.failedAtStep).toBeLessThan(
        Math.min(NUM_COLORS, INITIAL_SEQUENCE_LENGTH + result.furthestRoundReached! - 1)
      )
    }
  })

  it('keeps AI difficulty responsive to capability within a plausible sequence range', () => {
    const resultsFor = (capability: number) =>
      Array.from({ length: 500 }, (_, index) =>
        simulateAiResult(index + 1, 'ai-contestant', capability)
      )
    const lowerCapability = resultsFor(0.4)
    const higherCapability = resultsFor(1)
    const boostedCapability = resultsFor(1.2)
    const lowerAverageRound = average(lowerCapability.map((result) => result.furthestRoundReached!))
    const higherAverageRound = average(
      higherCapability.map((result) => result.furthestRoundReached!)
    )
    const boostedAverageRound = average(
      boostedCapability.map((result) => result.furthestRoundReached!)
    )
    const higherThirteenPlusRate =
      higherCapability.filter((result) => result.furthestRoundReached! >= 13).length /
      higherCapability.length

    expect(lowerAverageRound).toBeGreaterThan(5)
    expect(lowerAverageRound).toBeLessThan(8)
    expect(higherAverageRound).toBeGreaterThan(lowerAverageRound + 1.5)
    expect(higherAverageRound).toBeLessThan(11)
    expect(boostedAverageRound).toBeGreaterThan(higherAverageRound)
    expect(higherThirteenPlusRate).toBeGreaterThan(0.01)
    expect(higherThirteenPlusRate).toBeLessThan(0.07)
  })
})
