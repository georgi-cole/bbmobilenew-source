import { expect, E2E_NEW_SEASON_FIXTURE, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'
import type { SaveResumePerformanceCheckpoint } from './season-sim/types'

const SAVE_RESUME_PERFORMANCE_ENABLED = process.env.RUN_SAVE_RESUME_PERFORMANCE === '1'

if (SAVE_RESUME_PERFORMANCE_ENABLED) {
  test.describe('Seeded save and resume performance @performance', () => {
    for (const mode of ['voxPopuli', 'cupidArrow', 'survival'] as const) {
      test(`${mode} records save size and resume timing`, async ({ page }, testInfo) => {
        test.setTimeout(15 * 60_000)
        const auditor = await runSeasonSimulation(
          page,
          testInfo,
          defaultSimulationConfig({
            id: `${mode}-save-resume-performance`,
            mode,
            seeds: {
              roster: E2E_NEW_SEASON_FIXTURE.rosterSeed,
              season: 0x6d2b79f5,
              actor: 0x7a11ce42,
            },
            maxActions: 240,
            maxDays: 2,
            skipCompetitions: true,
            skipOptionalConfessionals: true,
            saveResumeAtDay: 2,
            captureSaveResumePerformance: true,
            captureFinalScreenshot: false,
            compactEconomyReport: true,
          })
        )

        expect(auditor.timeline.some(({ module }) => module === 'persistence')).toBe(true)
        expect(auditor.saveResumePerformanceCheckpoints).toHaveLength(1)
        const checkpoint = auditor.saveResumePerformanceCheckpoints[0]!
        assertMeasuredCheckpoint(checkpoint, mode)
        await auditor.assertNoErrorsAtEnd()
        await page.goto('about:blank')
      })
    }
  })
}

function assertMeasuredCheckpoint(
  checkpoint: SaveResumePerformanceCheckpoint,
  mode: SaveResumePerformanceCheckpoint['mode']
): void {
  expect(checkpoint.mode).toBe(mode)
  expect(checkpoint.day).toBeGreaterThanOrEqual(2)
  expect(checkpoint.snapshot.totalBytes).toBeGreaterThan(0)
  expect(checkpoint.snapshot.sections.game).toBeGreaterThan(0)
  expect(checkpoint.snapshot.sections.social).toBeGreaterThan(0)
  expect(checkpoint.snapshot.sections.socialReality).toBeGreaterThan(0)
  expect(checkpoint.persistence).not.toBeNull()
  expect(
    Math.abs((checkpoint.persistence?.lastSnapshotBytes ?? 0) - checkpoint.snapshot.totalBytes)
  ).toBeLessThanOrEqual(2)
  expect(checkpoint.persistence?.blockedReason).toBeNull()
  expect(checkpoint.timing.saveAndHomeMs).toBeGreaterThan(0)
  expect(checkpoint.timing.reloadToHomeMs).toBeGreaterThan(0)
  expect(checkpoint.timing.resumeToGameMs).toBeGreaterThan(0)
  expect(checkpoint.timing.reloadAndResumeMs).toBeGreaterThanOrEqual(
    checkpoint.timing.reloadToHomeMs
  )
}
