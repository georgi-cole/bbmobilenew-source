import { describe, expect, it } from 'vitest'
import { explainFamousFiguresTies, rankFamousFigures } from './standings'

describe('Famous Figures standings', () => {
  it('puts the 37-point winner above the equally scoring human and explains the draw', () => {
    const scores = { you: 37, Finn: 37, Rae: 34 }
    const rounds = { you: [8, 5, 8, 3, 5, 8], Finn: [5, 8, 8, 3, 8, 5], Rae: [8, 8, 0, 8, 5, 5] }
    const ranked = rankFamousFigures(['you', 'Finn', 'Rae'], scores, rounds, ['Finn', 'you', 'Rae'])
    expect(ranked).toEqual(['Finn', 'you', 'Rae'])
    expect(explainFamousFiguresTies(ranked, scores, rounds, (id) => id)).toEqual([
      'Tied at 37 points and 6 correct answers: the pre-drawn tie-break order is Finn, then you.',
    ])
  })
  it('uses correct-answer count before the draw order', () => {
    const scores = { you: 16, Finn: 16 }
    const rounds = { you: [8, 8, 0], Finn: [8, 5, 3] }
    const ranked = rankFamousFigures(['you', 'Finn'], scores, rounds, ['you', 'Finn'])
    expect(ranked).toEqual(['Finn', 'you'])
    expect(explainFamousFiguresTies(ranked, scores, rounds, (id) => id)[0]).toContain(
      'Finn: 3; you: 2'
    )
  })
})
