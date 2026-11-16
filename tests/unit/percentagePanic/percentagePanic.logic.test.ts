import { describe, expect, it } from 'vitest'
import { createPercentagePanic, pickAiDuelGuess } from '../../../src/features/percentagePanic/logic'

describe('Percentage Panic finale AI', () => {
  it('uses only the public interval and ignores the hidden survey answer', () => {
    const base = createPercentagePanic(['human', 'ai'], 'human', 42)
    const publicState = {
      ...base,
      phase: 'duel' as const,
      finalists: ['human', 'ai'] as [string, string],
      duelTurnId: 'ai',
      duelBounds: [25, 75] as [number, number],
    }

    const guesses = Array.from({ length: 101 }, (_unused, answerPercent) =>
      pickAiDuelGuess({
        ...publicState,
        question: { ...publicState.question, answerPercent },
      })
    )

    expect(new Set(guesses)).toEqual(new Set([50]))
  })
})
