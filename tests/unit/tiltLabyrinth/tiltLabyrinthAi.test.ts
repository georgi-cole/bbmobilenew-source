import { describe, expect, it } from 'vitest'
import { getDefaultCompetitionProfile } from '../../../src/ai/competition'
import { mulberry32 } from '../../../src/store/rng'
import { simulateTiltLabyrinthAiRun } from '../../../src/components/TiltLabyrinthComp/tiltLabyrinthAi'
import type { CompetitionSkillProfile } from '../../../src/ai/competition/types'

const REPRESENTATIVE_ROUTE_CELLS = 260

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
    const seedCount = 100
    const humanTimeMs = 180_000
    let humanWins = 0
    let totalAiTimeMs = 0

    for (let seed = 1; seed <= seedCount; seed += 1) {
      const aiTimes = [1, 2, 3].map((player) => {
        const rng = mulberry32((seed ^ Math.imul(player, 0x9e3779b9)) >>> 0)
        const run = simulateTiltLabyrinthAiRun(average, REPRESENTATIVE_ROUTE_CELLS, rng)
        totalAiTimeMs += run.adjustedTimeMs
        return run.adjustedTimeMs
      })
      if (aiTimes.every((time) => humanTimeMs < time)) humanWins += 1
    }

    const winRate = humanWins / seedCount
    const averageAiMinutes = totalAiTimeMs / (seedCount * 3 * 60_000)
    expect(winRate).toBeGreaterThanOrEqual(0.1)
    expect(winRate).toBeLessThanOrEqual(0.75)
    expect(averageAiMinutes).toBeGreaterThanOrEqual(1.5)
    expect(averageAiMinutes).toBeLessThanOrEqual(5.5)
  })

  it('rewards stronger navigation and consistency profiles', () => {
    const seedCount = 80
    let averageTime = 0
    let strongTime = 0
    let weakTime = 0

    for (let seed = 1; seed <= seedCount; seed += 1) {
      averageTime += simulateTiltLabyrinthAiRun(
        getDefaultCompetitionProfile(),
        REPRESENTATIVE_ROUTE_CELLS,
        mulberry32(seed)
      ).adjustedTimeMs
      strongTime += simulateTiltLabyrinthAiRun(
        withSkill(82),
        REPRESENTATIVE_ROUTE_CELLS,
        mulberry32(seed)
      ).adjustedTimeMs
      weakTime += simulateTiltLabyrinthAiRun(
        withSkill(25),
        REPRESENTATIVE_ROUTE_CELLS,
        mulberry32(seed)
      ).adjustedTimeMs
    }

    expect(strongTime / seedCount).toBeLessThan(averageTime / seedCount - 8_000)
    expect(weakTime / seedCount).toBeGreaterThan(averageTime / seedCount + 8_000)
  })

  it('scales AI time with the length of the generated route', () => {
    const shorterRoute = simulateTiltLabyrinthAiRun(
      getDefaultCompetitionProfile(),
      120,
      mulberry32(7)
    )
    const longerRoute = simulateTiltLabyrinthAiRun(
      getDefaultCompetitionProfile(),
      240,
      mulberry32(7)
    )

    expect(longerRoute.adjustedTimeMs).toBeGreaterThan(shorterRoute.adjustedTimeMs)
  })
})
