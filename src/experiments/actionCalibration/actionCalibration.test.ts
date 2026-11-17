import { describe, expect, it } from 'vitest'
import {
  actionCalibrationMarkdown,
  distribution,
  runActionCalibration,
  replayCalibrationTrace,
} from './actionCalibration'

describe('action calibration diagnostics', () => {
  it('keeps tail and median metrics distinct and rejects unusable samples', () => {
    expect(distribution([90, 20, 10, 80, 30, 70, 40, 60, 50, 100, 0])).toEqual({
      p10: 10,
      median: 50,
      p90: 90,
    })
    expect(() => distribution([])).toThrow()
    expect(() => distribution([Number.NaN])).toThrow()
  })

  it('verifies native replays and exposes whole-field and roster effects without win quotas', () => {
    const report = runActionCalibration({ seeds: [42, 101, 901], rosters: [2, 6, 16] })
    expect(report.parityFailures).toEqual([])
    expect(report.verifiedReplays).toBeGreaterThan(report.simulatedOpponents)
    expect(report.examples.every((example) => example.actions.length > 0)).toBe(true)
    for (const game of ['quickTapVipRace', 'quickTapVipSeasons', 'pressurePlank']) {
      const medians = report.fields
        .filter((field) => field.game === game)
        .map((field) => field.scores.median)
      expect(medians[0]).toBeLessThan(medians[1])
      expect(medians[1]).toBeLessThan(medians[2])
    }
    for (const example of report.examples)
      expect(replayCalibrationTrace(JSON.parse(JSON.stringify(example))).score).toBe(example.score)
    const headsUp = report.rows.filter((row) => row.roster === 2)
    for (const row of headsUp) {
      const fullField = report.rows.find(
        (other) =>
          other.game === row.game &&
          other.profile === row.profile &&
          other.version === row.version &&
          other.reference === row.reference &&
          other.roster === 16
      )!
      expect(fullField.strictWinRate).toBeLessThanOrEqual(row.strictWinRate)
      expect(fullField.bestOpponentScore.median).toBeGreaterThanOrEqual(
        row.bestOpponentScore.median
      )
    }
    const markdown = actionCalibrationMarkdown(report)
    expect(markdown).toContain('0 parity failures')
    expect(markdown).toContain('observed 97.780s')
    expect(markdown).toContain('Other minigames')
  })
})
