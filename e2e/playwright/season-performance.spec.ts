import { expect, E2E_NEW_SEASON_FIXTURE, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'
import type { SeasonPerformanceCheckpoint } from './season-sim/types'

const PERFORMANCE_RUN_ENABLED = process.env.RUN_SEASON_PERFORMANCE === '1'
const INPUT_RESPONSE_P95_LIMIT_MS = 250
const REDUX_ACTION_P95_LIMIT_MS = 250
const FRAME_GAP_P95_LIMIT_MS = 160
const FRAME_GAPS_OVER_100_MS_LIMIT = 16

if (PERFORMANCE_RUN_ENABLED) {
  test.describe('Seeded season progression performance @performance', () => {
    test('tracks responsiveness at early and late progression on a fixed seed', async ({
      page,
    }, testInfo) => {
      test.setTimeout(60 * 60_000)
      const config = defaultSimulationConfig({
        id: 'classic-early-late-performance',
        mode: 'classic',
        seeds: {
          roster: E2E_NEW_SEASON_FIXTURE.rosterSeed,
          season: E2E_NEW_SEASON_FIXTURE.seasonSeed,
          actor: 0x7a11ce42,
        },
        maxActions: 1,
        maxDays: 8,
        competitionSkill: 'thrower',
        captureFinalScreenshot: false,
        compactEconomyReport: true,
        performanceBenchmark: true,
      })
      const auditor = await runSeasonSimulation(page, testInfo, config)
      const early = auditor.performanceCheckpoints.find(({ name }) => name === 'early')
      const late = auditor.performanceCheckpoints.find(({ name }) => name === 'late')
      const finalState = await page.evaluate(() => {
        const host = window as Window & {
          __bbE2EState?: { snapshot: () => unknown }
        }
        return host.__bbE2EState?.snapshot() as
          | { game?: { phase: string; week: number } }
          | undefined
      })

      expect(early, 'the benchmark should capture day 1').toBeDefined()
      expect(late, 'the benchmark should capture day 8').toBeDefined()
      expect(early).toMatchObject({ day: 1, week: 1, phase: 'week_start' })
      expect(late).toMatchObject({ day: 8, week: 8, phase: 'week_start' })
      expect(late?.activePlayerCount).toBeLessThanOrEqual(early?.activePlayerCount ?? -1)
      expect(late?.historyCount).toBeGreaterThan(early?.historyCount ?? -1)
      expect(late?.tvFeedCount).toBeGreaterThan(early?.tvFeedCount ?? -1)
      expect(finalState?.game).toMatchObject({ week: 8, phase: 'week_start' })

      assertCheckpointBudget(early!)
      assertCheckpointBudget(late!)
      assertProgressionBudget(early!, late!)
      await auditor.assertNoErrorsAtEnd()
      await page.goto('about:blank')
    })
  })
}

function assertCheckpointBudget(checkpoint: SeasonPerformanceCheckpoint): void {
  expect(
    checkpoint.sampleCounts.inputResponses,
    `${checkpoint.name} input samples`
  ).toBeGreaterThan(0)
  expect(checkpoint.sampleCounts.reduxActions, `${checkpoint.name} Redux samples`).toBeGreaterThan(
    0
  )
  expect(
    checkpoint.metrics.inputResponseP95Ms,
    `${checkpoint.name} input response p95`
  ).not.toBeNull()
  expect(checkpoint.metrics.reduxActionP95Ms, `${checkpoint.name} Redux action p95`).not.toBeNull()

  expect(checkpoint.metrics.inputResponseP95Ms ?? 0).toBeLessThanOrEqual(
    INPUT_RESPONSE_P95_LIMIT_MS
  )
  expect(checkpoint.metrics.reduxActionP95Ms ?? 0).toBeLessThanOrEqual(REDUX_ACTION_P95_LIMIT_MS)
  expect(checkpoint.metrics.frameGapP95Ms ?? 0).toBeLessThanOrEqual(FRAME_GAP_P95_LIMIT_MS)
  expect(checkpoint.frameGapsOver100Ms).toBeLessThanOrEqual(FRAME_GAPS_OVER_100_MS_LIMIT)
}

function assertProgressionBudget(
  early: SeasonPerformanceCheckpoint,
  late: SeasonPerformanceCheckpoint
): void {
  const regressionLimit = (earlyMetric: number | null, absoluteFloorMs: number): number =>
    Math.max((earlyMetric ?? 0) * 4, absoluteFloorMs)

  expect(late.metrics.inputResponseP95Ms ?? 0).toBeLessThanOrEqual(
    regressionLimit(early.metrics.inputResponseP95Ms, 120)
  )
  expect(late.metrics.reduxActionP95Ms ?? 0).toBeLessThanOrEqual(
    regressionLimit(early.metrics.reduxActionP95Ms, 100)
  )
  expect(late.metrics.frameGapP95Ms ?? 0).toBeLessThanOrEqual(
    regressionLimit(early.metrics.frameGapP95Ms, 100)
  )
}
