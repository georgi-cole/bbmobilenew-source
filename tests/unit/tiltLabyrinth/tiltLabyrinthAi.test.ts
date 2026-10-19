import { describe, expect, it } from 'vitest'
import { getDefaultCompetitionProfile } from '../../../src/ai/competition'
import { mulberry32 } from '../../../src/store/rng'
import { simulateTiltLabyrinthAiRun } from '../../../src/components/TiltLabyrinthComp/tiltLabyrinthAi'
import type { CompetitionSkillProfile } from '../../../src/ai/competition/types'

function withSkill(value: number): CompetitionSkillProfile {
  return {
    physical: value,
    mental: value,
    precision: value,
    nerve: value,
    consistency: value,
    clutch: value,
    chokeRisk: 100 - value,
    luck: value,
  }
}

describe('Tilt Labyrinth AI pacing', () => {
  it('gives a three-minute human a competitive chance against average AIs', () => {
    const average = getDefaultCompetitionProfile()
    const seedCount = 1_000
    const humanTimeMs = 180_000
    let humanWins = 0
    let totalAiTimeMs = 0

    for (let seed = 1; seed <= seedCount; seed += 1) {
      const aiTimes = [1, 2, 3].map((player) => {
        const rng = mulberry32((seed ^ Math.imul(player, 0x9e3779b9)) >>> 0)
        const run = simulateTiltLabyrinthAiRun(average, 75, rng)
        totalAiTimeMs += run.adjustedTimeMs
        return run.adjustedTimeMs
      })
      if (aiTimes.every((time) => humanTimeMs < time)) humanWins += 1
    }

    const winRate = humanWins / seedCount
    const averageAiMinutes = totalAiTimeMs / (seedCount * 3 * 60_000)
    expect(winRate).toBeGreaterThanOrEqual(0.15)
    expect(winRate).toBeLessThanOrEqual(0.55)
    expect(averageAiMinutes).toBeGreaterThanOrEqual(2.4)
    expect(averageAiMinutes).toBeLessThanOrEqual(4.1)
  })

  it('rewards stronger navigation and consistency profiles', () => {
    const seedCount = 400
    let averageTime = 0
    let strongTime = 0
    let weakTime = 0

    for (let seed = 1; seed <= seedCount; seed += 1) {
      averageTime += simulateTiltLabyrinthAiRun(
        getDefaultCompetitionProfile(),
        75,
        mulberry32(seed)
      ).adjustedTimeMs
      strongTime += simulateTiltLabyrinthAiRun(withSkill(82), 75, mulberry32(seed)).adjustedTimeMs
      weakTime += simulateTiltLabyrinthAiRun(withSkill(25), 75, mulberry32(seed)).adjustedTimeMs
    }

    expect(strongTime / seedCount).toBeLessThan(averageTime / seedCount - 25_000)
    expect(weakTime / seedCount).toBeGreaterThan(averageTime / seedCount + 25_000)
  })
})
