import { describe, expect, it } from 'vitest'
import {
  CONFESSIONAL_CALIBRATION_SCENARIOS,
  runConfessionalCalibrationScenario,
  runConfessionalCalibrationSuite,
} from '../confessionalCalibration'

describe('Confessional calibration lab', () => {
  it('ships a broad scenario matrix instead of a handful of happy paths', () => {
    expect(CONFESSIONAL_CALIBRATION_SCENARIOS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(CONFESSIONAL_CALIBRATION_SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      CONFESSIONAL_CALIBRATION_SCENARIOS.length
    )

    const categories = new Set(CONFESSIONAL_CALIBRATION_SCENARIOS.map((scenario) => scenario.category))
    expect(categories).toEqual(
      new Set(['understanding', 'knowledge', 'continuity', 'authored', 'character', 'salience'])
    )
  })

  it('keeps contract scenarios green against the production routing engine', () => {
    const failures = runConfessionalCalibrationSuite()
      .filter((result) => result.scenario.tier === 'contract' && !result.passed)
      .map((result) => ({
        id: result.scenario.id,
        failedChecks: result.checks.filter((check) => !check.passed),
      }))

    expect(failures).toEqual([])
  })

  it('runs multi-turn scenarios through evolving state and memory', () => {
    const scenario = CONFESSIONAL_CALIBRATION_SCENARIOS.find(
      (candidate) => candidate.id === 'authored-bored-game'
    )
    expect(scenario).toBeDefined()

    const result = runConfessionalCalibrationScenario(scenario!)
    expect(result.turns).toHaveLength(2)
    expect(result.turns[0].analysis.nextLocalState.lastQuestion).toBe('offer_game')
    expect(result.turns[1].analysis.action).toBe('launch_tic_tac_toe')
    expect(result.passed).toBe(true)
  })

  it('surfaces calibration mismatches as data instead of mutating gameplay', () => {
    const scenario = {
      ...CONFESSIONAL_CALIBRATION_SCENARIOS[0],
      id: 'intentional-calibration-mismatch',
      tier: 'calibration' as const,
      turns: [
        {
          text: 'hello',
          expected: { semanticIntent: 'betrayal' as const },
        },
      ],
    }

    const result = runConfessionalCalibrationScenario(scenario)
    expect(result.passed).toBe(false)
    expect(result.checks.some((check) => !check.passed)).toBe(true)
    expect(result.turns[0].analysis.action).toBeUndefined()
  })
})
