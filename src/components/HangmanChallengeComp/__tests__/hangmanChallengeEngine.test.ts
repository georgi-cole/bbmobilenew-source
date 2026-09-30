import { describe, expect, it } from 'vitest'
import {
  FAILURE_PENALTY,
  STARTING_BUDGET,
  buildDisplayTokens,
  buildEliminationPlan,
  calculateRoundScore,
  getWordBank,
  pickRevealPosition,
  pickTournamentWords,
  simulateAiRound,
} from '../hangmanChallengeEngine'

describe('hangmanChallengeEngine V2', () => {
  it('uses a curated Big Eye word bank with progressive hints and a dedicated final pool', () => {
    const words = getWordBank()

    expect(words.length).toBeGreaterThanOrEqual(35)
    expect(words.some((entry) => entry.text === 'nomination')).toBe(true)
    expect(words.some((entry) => entry.text === 'replacement nominee')).toBe(true)
    expect(words.some((entry) => entry.text === 'arcade arena')).toBe(false)
    expect(words.every((entry) => entry.hints.length === 3)).toBe(true)
    expect(words.filter((entry) => entry.finalEligible).length).toBeGreaterThanOrEqual(8)
  })

  it('buys one character position rather than revealing every copy of a letter', () => {
    const word = 'nomination'
    const first = pickRevealPosition(word, [], 'vowel', 0)
    expect(first).not.toBeNull()

    const tokens = buildDisplayTokens(word, first == null ? [] : [first])
    expect(tokens.filter((token) => token !== '•').length).toBe(1)
    expect(tokens.filter((token) => token === '•').length).toBe(word.length - 1)
  })

  it('scores failed boards at zero while applying the separate cumulative failure penalty', () => {
    const failed = calculateRoundScore({
      solved: false,
      budgetRemaining: 96,
      wrongGuesses: 10,
      elapsedSeconds: 70,
      parSeconds: 40,
      hintsUsed: 0,
    })

    expect(failed.roundScore).toBe(0)
    expect(failed.cumulativeDelta).toBe(FAILURE_PENALTY)
    expect(failed.budgetScore).toBe(0)
  })

  it('rewards remaining wallet, clean solving and no-hint play without double-counting purchases', () => {
    const solved = calculateRoundScore({
      solved: true,
      budgetRemaining: 80,
      wrongGuesses: 0,
      elapsedSeconds: 20,
      parSeconds: 40,
      hintsUsed: 0,
    })

    expect(solved.budgetScore).toBe(80)
    expect(solved.bonuses).toContainEqual({ label: 'Lightning solve', value: 10 })
    expect(solved.bonuses).toContainEqual({ label: 'Perfect read', value: 8 })
    expect(solved.bonuses).toContainEqual({ label: 'No-hint bonus', value: 5 })
    expect(solved.roundScore).toBe(103)
  })

  it('keeps the tournament to at most six qualifying rounds while always reaching a final two', () => {
    expect(buildEliminationPlan(4)).toEqual([1, 1])
    expect(buildEliminationPlan(10)).toEqual([2, 2, 1, 1, 1, 1])
    expect(buildEliminationPlan(16)).toEqual([3, 3, 2, 2, 2, 2])

    const plan = buildEliminationPlan(18)
    let remaining = 18
    for (const eliminated of plan) remaining -= eliminated

    expect(plan.length).toBeLessThanOrEqual(6)
    expect(remaining).toBe(2)
  })

  it('reserves a hard curated word for the shared final board', () => {
    const tournament = pickTournamentWords(42, 6)

    expect(tournament.qualifying).toHaveLength(6)
    expect(new Set(tournament.qualifying.map((entry) => entry.text)).size).toBe(6)
    expect(tournament.final.difficulty).toBe(5)
    expect(tournament.final.finalEligible).toBe(true)
    expect(tournament.qualifying.some((entry) => entry.text === tournament.final.text)).toBe(false)
  })

  it('makes AI contestants spend from the same Eyeolean economy instead of manufacturing a score', () => {
    const word = pickTournamentWords(77, 3).qualifying[1]
    const ai = simulateAiRound({
      participantId: 'ai-1',
      participantName: 'Warden',
      word,
      budget: STARTING_BUDGET,
      cumulativeScore: 0,
      seed: 77,
      roundIndex: 1,
    })

    const spent = ai.purchases.reduce((sum, purchase) => sum + purchase.cost, 0)
    expect(ai.result.budgetRemaining).toBe(STARTING_BUDGET - spent)
    expect(ai.result.budgetRemaining).toBeGreaterThanOrEqual(0)
    expect(ai.result.wrongGuesses).toBeLessThanOrEqual(10)
  })
})
