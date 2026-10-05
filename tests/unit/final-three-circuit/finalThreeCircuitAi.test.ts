import { describe, expect, it } from 'vitest'
import {
  normalizeCircuitAiAbility,
  simulateAiCircuitScores,
} from '../../../src/components/FinalThreeCircuit/finalThreeCircuitAi'

describe('Final Three Circuit AI calibration', () => {
  it('interprets both lab 0-100 input and native circuit-range input as ability signals', () => {
    expect(normalizeCircuitAiAbility(0)).toBe(0)
    expect(normalizeCircuitAiAbility(100)).toBe(1)
    expect(normalizeCircuitAiAbility(150)).toBe(0)
    expect(normalizeCircuitAiAbility(285)).toBe(1)
  })

  it('is deterministic for the same seed and player', () => {
    const first = simulateAiCircuitScores(78, 424242, 'ai-1')
    expect(simulateAiCircuitScores(78, 424242, 'ai-1')).toEqual(first)
  })

  it('keeps each discipline inside a realistic human range rather than producing automatic near-perfect scores', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const [signal, sequence, risk] = simulateAiCircuitScores(100, seed, 'elite')
      expect(signal).toBeGreaterThanOrEqual(28)
      expect(signal).toBeLessThanOrEqual(95)
      expect(sequence).toBeGreaterThanOrEqual(20)
      expect(sequence).toBeLessThanOrEqual(96)
      expect(risk).toBeGreaterThanOrEqual(18)
      expect(risk).toBeLessThanOrEqual(94)
    }
  })

  it('preserves the upstream expected total while allowing stronger skills and varied stages', () => {
    const averageTotal = (ability: number) => {
      let total = 0
      for (let seed = 1; seed <= 500; seed += 1) {
        total += simulateAiCircuitScores(ability, seed, `player-${seed}`).reduce(
          (sum, score) => sum + score,
          0
        )
      }
      return total / 500
    }

    expect(averageTotal(218)).toBeGreaterThan(214)
    expect(averageTotal(218)).toBeLessThan(222)
    expect(averageTotal(258)).toBeGreaterThan(averageTotal(218))
    expect(averageTotal(95)).toBeLessThan(285)

    const scores = Array.from({ length: 30 }, (_unused, index) =>
      simulateAiCircuitScores(218, index + 1, 'same-finalist')
    )
    expect(new Set(scores.map((stages) => stages.join(','))).size).toBeGreaterThan(20)
    expect(
      simulateAiCircuitScores(218, 1, 'same-finalist', 2).reduce((a, b) => a + b, 0)
    ).toBeLessThan(simulateAiCircuitScores(218, 1, 'same-finalist', 1).reduce((a, b) => a + b, 0))
  })
})
