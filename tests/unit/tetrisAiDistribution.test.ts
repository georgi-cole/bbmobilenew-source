import { describe, expect, it } from 'vitest'
import { simulateTetrisAiRun } from '../../src/ai/competition/tetrisSimulation'
import {
  splitTetrisRound,
  type TetrisRoundPerformance,
} from '../../src/components/TetrisComp/tournament'

const openingRound = {
  durationMs: 60_000,
  speedMultiplier: 0.94,
  tensionLevel: 1,
}

describe('Fit Me In gameplay AI', () => {
  it('replays the same board decisions for the same player and seed', () => {
    const input = { ...openingRound, id: 'medium-ai', baselineScore: 50, seed: 42 }
    expect(simulateTetrisAiRun(input)).toEqual(simulateTetrisAiRun(input))
  })

  it('keeps a 912-point player competitive against four medium-rated opponents', () => {
    let humanAdvances = 0
    const simulations = 250

    for (let seed = 1; seed <= simulations; seed += 1) {
      const roundSeed = (seed ^ Math.imul(1, 0x9e3779b1)) >>> 0
      const aiPerformances: TetrisRoundPerformance[] = Array.from({ length: 4 }, (_, index) => {
        const playerId = `medium-${index + 1}`
        return {
          playerId,
          ...simulateTetrisAiRun({
            ...openingRound,
            id: playerId,
            baselineScore: 50,
            seed: roundSeed,
          }),
          previousScore: 0,
          tieBreaker: 0,
        }
      })
      const humanPerformance: TetrisRoundPerformance = {
        playerId: 'human',
        score: 912,
        lines: 0,
        pieces: 20,
        maxStackHeight: 12,
        previousScore: 0,
        tieBreaker: 0,
      }
      const standings = splitTetrisRound([...aiPerformances, humanPerformance], 4)
      if (standings.survivorIds.includes('human')) {
        humanAdvances += 1
      }
    }

    expect(humanAdvances).toBeGreaterThan(simulations * 0.3)
    expect(humanAdvances).toBeLessThan(simulations * 0.7)
  })

  it('uses the competition rating to improve play without guaranteeing a result', () => {
    const lowSkillScores = Array.from(
      { length: 80 },
      (_, index) =>
        simulateTetrisAiRun({
          ...openingRound,
          id: 'rated-ai',
          baselineScore: 25,
          seed: index + 1,
        }).score
    )
    const highSkillScores = Array.from(
      { length: 80 },
      (_, index) =>
        simulateTetrisAiRun({
          ...openingRound,
          id: 'rated-ai',
          baselineScore: 75,
          seed: index + 1,
        }).score
    )
    const average = (scores: number[]) =>
      scores.reduce((sum, score) => sum + score, 0) / scores.length

    expect(average(highSkillScores)).toBeGreaterThan(average(lowSkillScores))
    expect(lowSkillScores.some((score) => score > 912)).toBe(true)
    expect(highSkillScores.some((score) => score < 912)).toBe(true)
  })
})
