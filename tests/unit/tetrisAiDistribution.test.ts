import { describe, expect, it } from 'vitest'
import { simulateTetrisAiScores } from '../../src/ai/competition/tetrisSimulation'
import {
  rankTetrisRound,
  type TetrisRoundPerformance,
} from '../../src/components/TetrisComp/tournament'

const field = Array.from({ length: 6 }, (_, index) => ({
  id: `ai-${index + 1}`,
  baselineScore: 50 + index,
}))

function performance(playerId: string, score: number, tieBreaker: number): TetrisRoundPerformance {
  return { playerId, score, lines: 0, pieces: 0, maxStackHeight: 10, previousScore: 0, tieBreaker }
}

describe('Fit Me In AI distribution', () => {
  it('is deterministic and keeps full fields spread without forcing score gaps', () => {
    const first = simulateTetrisAiScores({
      seed: 42,
      participants: field,
      minScore: 320,
      maxScore: 2_700,
    })
    const second = simulateTetrisAiScores({
      seed: 42,
      participants: field,
      minScore: 320,
      maxScore: 2_700,
    })
    const ordered = Object.values(first).sort((a, b) => b - a)

    expect(second).toEqual(first)
    expect(ordered[0] - ordered[ordered.length - 1]).toBeGreaterThanOrEqual(500)
    expect(ordered.at(-1)).toBeGreaterThan(320)
  })

  it('uses the 0–100 skill rating to set a solo finalist score', () => {
    const low = simulateTetrisAiScores({
      seed: 42,
      participants: [{ id: 'steady-ai', baselineScore: 0 }],
      minScore: 320,
      maxScore: 2_700,
    })
    const high = simulateTetrisAiScores({
      seed: 42,
      participants: [{ id: 'steady-ai', baselineScore: 100 }],
      minScore: 320,
      maxScore: 2_700,
    })

    expect(high['steady-ai']).toBeGreaterThan(low['steady-ai'] + 500)
  })

  it('uses a stable, non-random tie resolution after all visible metrics tie', () => {
    const ranked = rankTetrisRound([
      performance('zeta', 1000, 0.99),
      performance('alpha', 1000, 0.01),
    ])
    expect(ranked.map((entry) => entry.playerId)).toEqual(['alpha', 'zeta'])
  })
})
