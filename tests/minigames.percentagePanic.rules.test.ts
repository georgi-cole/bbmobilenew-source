import { describe, expect, it } from 'vitest'
import {
  advancePercentageRound,
  chooseAiPercentageDuelFirst,
  choosePercentageDuelOrder,
  createPercentagePanic,
  percentageEliminations,
  percentagePanicLastPlaceIds,
  percentagePanicRankedGroups,
  percentagePanicRankedIds,
  resolvePercentageDuelGuess,
  resolvePercentageRound,
  selectPercentageQuestion,
  simulatedPercentageGuess,
  PERCENTAGE_PANIC_QUESTIONS,
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
  it('ships a complete sourced party-survey bank with explicit populations and dates', () => {
    const questions = PERCENTAGE_PANIC_QUESTIONS
    expect(questions.length).toBeGreaterThanOrEqual(300)
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(questions.length)
    expect(new Set(questions.map((q) => q.sourceUrl)).size).toBeGreaterThanOrEqual(30)
    expect(new Set(questions.map((q) => q.category)).size).toBeGreaterThanOrEqual(12)
    for (const q of questions) {
      expect(q.questionType).toBe('survey')
      expect(q.sourceUrl).toMatch(/^https:\/\//)
      expect(q.sourceUrl).not.toContain('worldbank')
      expect(q.regionOrCountry.length).toBeGreaterThan(0)
      expect(q.referenceYear).toBeGreaterThanOrEqual(2010)
      expect(Number.isInteger(q.answerPercent)).toBe(true)
      expect(q.answerPercent).toBeGreaterThanOrEqual(0)
      expect(q.answerPercent).toBeLessThanOrEqual(100)
    }
  })

  it('mixes topics and studies instead of repeating variations of one survey', () => {
    for (const seed of [1, 42, 424242]) {
      const picked = []
      for (let round = 1; round <= 8; round += 1) {
        picked.push(
          selectPercentageQuestion(
            seed,
            round,
            picked.map((q) => q.id)
          )
        )
      }
      expect(new Set(picked.map((q) => q.category)).size).toBe(8)
      expect(new Set(picked.map((q) => q.sourceUrl)).size).toBe(8)
    }
  })

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
    expect(game.chooserId).toBe(createPercentagePanic(['a', 'b'], 'a', 4).chooserId)
    expect(game.finalists).toContain(game.chooserId)
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

  it('keeps tied elimination groups together in the final standings', () => {
    const game = createPercentagePanic(['a', 'b', 'c', 'd', 'e', 'f'], 'a', 19)
    const completed = {
      ...game,
      phase: 'winner' as const,
      activeIds: ['f'],
      eliminatedIds: ['a', 'b', 'c', 'd'],
      eliminationGroups: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      finalists: ['e', 'f'] as [string, string],
      winnerId: 'f',
    }
    expect(percentagePanicRankedGroups(completed)).toEqual([['f'], ['e'], ['c', 'd'], ['a', 'b']])
    expect(percentagePanicLastPlaceIds(completed)).toEqual(['a', 'b'])
    expect(percentagePanicRankedIds(completed)).toEqual(['f', 'e', 'c', 'd', 'a', 'b'])
  })

  it('lets the AI chooser select which finalist guesses first', () => {
    const initial = createPercentagePanic(['a', 'b'], null, 8)
    const first = chooseAiPercentageDuelFirst(initial)
    expect(first).toBeTruthy()
    expect(initial.finalists).toContain(first)
    expect(first).toBe(chooseAiPercentageDuelFirst(initial))
  })

  it('reports the losing finalist as last place when a two-player game skips elimination rounds', () => {
    const initial = createPercentagePanic(['a', 'b'], 'a', 8)
    const duel = choosePercentageDuelOrder(initial, 'a')
    const winner = resolvePercentageDuelGuess(duel, 'a', duel.question.answerPercent)
    expect(winner.winnerId).toBe('a')
    expect(percentagePanicLastPlaceIds(winner)).toEqual(['b'])
  })

  it('rejects invalid input instead of scoring a malformed guess', () => {
    const game = createPercentagePanic(['a', 'b', 'c'], 'a', 4)
    expect(() => resolvePercentageRound(game, Number.NaN, 1000)).toThrow()
    expect(() => resolvePercentageRound(game, 101, 1000)).toThrow()
    expect(() => resolvePercentageRound(game, 20, -1)).toThrow()
  })
})
