import { describe, expect, it } from 'vitest'
import { simulateQuickTapAiScore } from '../../../src/ai/competition/quickTapSimulation'
import { simulateSeasonsAiScore } from '../../../src/experiments/quickTapSeasons/quickTapSeasons'
import { simulateQuickTapVipAiRace } from '../../../src/minigames/quickTapRace/vip/quickTapVipLogic'
import {
  CURRENT_QUICK_TAP_AI_TUNING,
  LEGACY_QUICK_TAP_AI_TUNING,
  type QuickTapAiTuningVersion,
} from '../../../src/ai/competition/quickTapAiTuning'

type RaceArgs = { seed: number; playerId: string; tuning: QuickTapAiTuningVersion }
const variants = [
  { name: 'Standard Race', simulate: simulateQuickTapAiScore },
  { name: 'Standard Seasons', simulate: simulateSeasonsAiScore },
  { name: 'Premium Race', simulate: (args: RaceArgs) => simulateQuickTapVipAiRace(args).score },
  {
    name: 'Premium Seasons',
    simulate: (args: RaceArgs) => simulateQuickTapVipAiRace({ ...args, mode: 'seasons' }).score,
  },
]

describe('Quick Tap AI calibration', () => {
  it.each(variants)('strengthens the $name field across a shared seed sample', ({ simulate }) => {
    let before = 0
    let after = 0
    for (let run = 0; run < 2_000; run += 1) {
      const input = { seed: Math.floor(run / 10) + 1, playerId: `audit-${run % 10}` }
      before += simulate({ ...input, tuning: LEGACY_QUICK_TAP_AI_TUNING })
      after += simulate({ ...input, tuning: CURRENT_QUICK_TAP_AI_TUNING })
    }
    // Box decisions, fatigue and seasonal modifiers can amplify or trim the
    // uplift in final points, so compare the field, not an individual result.
    expect(after / before).toBeGreaterThan(1.06)
    expect(after / before).toBeLessThan(1.14)
  })
})
