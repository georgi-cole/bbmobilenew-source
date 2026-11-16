import { describe, expect, it } from 'vitest'
import {
  getHintLeftBreakChance,
  inferSafeSideFromHint,
} from '../../../src/features/glassBridge/glassBridgeHints'

describe('GlassBridge public hint interpretation', () => {
  it.each([
    ['left', 1, 35],
    ['right', 1, 65],
    ['left', 2, 10],
    ['right', 2, 90],
    ['left', 3, 1],
    ['right', 3, 99],
  ] as const)(
    'keeps the displayed clue and safe side aligned (%s, hint %i)',
    (safeSide, count, chance) => {
      const leftBreakChance = getHintLeftBreakChance(safeSide, count)
      expect(leftBreakChance).toBe(chance)
      expect(inferSafeSideFromHint(leftBreakChance)).toBe(safeSide)
    }
  )
})
