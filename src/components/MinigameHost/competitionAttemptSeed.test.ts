import { describe, expect, it } from 'vitest'
import { competitionAttemptSeed } from './competitionAttemptSeed'

describe('competitionAttemptSeed', () => {
  it('preserves the initial competition draw', () => {
    expect(competitionAttemptSeed(424242, 0)).toBe(424242)
  })
  it('uses a stable different draw for every retry, including a zero base seed', () => {
    for (const seed of [0, 424242, 0xffffffff]) {
      const draws = Array.from({ length: 20 }, (_, i) => competitionAttemptSeed(seed, i))
      expect(new Set(draws).size).toBe(20)
      expect(competitionAttemptSeed(seed, 1)).toBe(draws[1])
    }
  })
})
