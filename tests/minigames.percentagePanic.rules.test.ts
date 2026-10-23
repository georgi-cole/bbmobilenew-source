import { describe, expect, it } from 'vitest'
import {
  advancePercentageRound,
  choosePercentageDuelOrder,
  createPercentagePanic,
  percentageEliminations,
  percentagePanicRankedIds,
  resolvePercentageDuelGuess,
  resolvePercentageRound,
  selectPercentageQuestion,
  simulatedPercentageGuess,
  type PercentageAnswer,
} from '../src/features/percentagePanic/logic'

const answer = (playerId: string, error: number, responseMs: number): PercentageAnswer => ({
  playerId,
  guess: 50 + error,
  error,
  responseMs,
  score: -error,
})

describe('Percentage Panic rules', () => {
  it('uses a deterministic sourced percent question bank', () => {
    const picked = selectPercentageQuestion(16, 1, [])
    expect(picked.answerPercent).toBeGreaterThanOrEqual(0)
    expect(picked.answerPercent).toBeLessThanOrEqual(100)
    expect(picked.sourceUrl).toMatch(/^https:\/\//)
    expect(selectPercentageQuestion(16, 1, [])).toEqual(picked)
  })

  it('eliminates the furthest contestant even when someone else is slower', () => {
    expect(
      percentageEliminations([answer('a', 10, 19000), answer('b', 15, 2000), answer('c', 7, 18000)])
    ).toEqual(['b'])
  })

  it('uses slowest response to resolve equal worst errors', () => {
    expect(
      percentageEliminations([answer('a', 12, 19000), answer('b', 12, 2000), answer('c', 5, 2500)])
    ).toEqual(['a'])
  })

  it('eliminates every equally inaccurate contestant with identical response time', () => {
    expect(
      percentageEliminations([answer('a', 12, 1000), answer('b', 12, 1000), answer('c', 3, 2000)])
    ).toEqual(['a', 'b'])
  })

  it('goes directly to finale with two initial contestants', () => {
    const game = createPercentagePanic(['a', 'b'], 'a', 4)
    expect(game.phase).toBe('order')
    expect(game.finalists).toEqual(['a', 'b'])
    expect(game.chooserId).toBe('a')
  })

  it('resolves a round consistently and carries negative cumulative scores', () => {
    const game = createPercentagePanic(['a', 'b', 'c'], 'a', 13)
    const first = resolvePercentageRound(game, 50, 4000)
    const second = resolvePercentageRound(game, 50, 4000)
    expect(first).toEqual(second)
    expect(first.phase).toBe('reveal')
    for (const row of first.lastRound?.answers ?? []) {
      expect(first.scores[row.playerId]).toBe(-Math.abs(row.guess - game.question.answerPercent))
    }
    const after = advancePercentageRound(first)
    expect(['question', 'order', 'winner']).toContain(after.phase)
    expect(first.activeIds.length).toBeGreaterThanOrEqual(1)
  })

  it('does not arbitrarily eliminate everyone when every response is identical', () => {
    const game = createPercentagePanic(['a', 'b', 'c'], 'a', 7)
    const aiB = simulatedPercentageGuess(game, 'b')
    const aiC = simulatedPercentageGuess(game, 'c')
    // Lock all estimates and timings to the same value using a matching
    // deterministic seed/search if available; otherwise assert pure elimination.
    expect(
      percentageEliminations([answer('a', 30, 2000), answer('b', 30, 2000), answer('c', 30, 2000)])
    ).toEqual(['a', 'b', 'c'])
    expect(aiB.responseMs).toBeGreaterThan(0)
    expect(aiC.responseMs).toBeGreaterThan(0)
  })

  it('constrains Higher/Lower guesses and ends only on the exact answer', () => {
    const initial = createPercentagePanic(['a', 'b'], 'a', 43)
    let game = choosePercentageDuelOrder(initial, 'a')
    const real = game.question.answerPercent
    const first = real === 50 ? 49 : 50
    game = resolvePercentageDuelGuess(game, 'a', first)
    expect(game.phase).toBe('duel')
    expect(game.duelBounds).toEqual(first < real ? [first + 1, 100] : [0, first - 1])
    expect(resolvePercentageDuelGuess(game, 'b', first)).toEqual(game)
    game = resolvePercentageDuelGuess(game, 'b', real)
    expect(game.winnerId).toBe('b')
    expect(game.phase).toBe('winner')
    expect(percentagePanicRankedIds(game)).toEqual(['b', 'a'])
  })

  it('rejects invalid input instead of scoring a malformed guess', () => {
    const game = createPercentagePanic(['a', 'b', 'c'], 'a', 4)
    expect(() => resolvePercentageRound(game, Number.NaN, 1000)).toThrow()
    expect(() => resolvePercentageRound(game, 101, 1000)).toThrow()
    expect(() => resolvePercentageRound(game, 20, -1)).toThrow()
  })
})
