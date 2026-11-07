import { readFileSync } from 'node:fs'
import { expect, E2E_NEW_SEASON_FIXTURE, readAppState, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'
import { attachJuryDiagnostics } from './season-sim/juryDiagnostics'
import type { ProgressionPerformanceCheckpoint } from './season-sim/types'

const LATE_GAME_PERFORMANCE_ENABLED = process.env.RUN_LATE_GAME_PERFORMANCE === '1'
const CHECKPOINT_DAYS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const
const REPLAY_CHECKPOINT = process.env.SEASON_SIM_RESUME_CHECKPOINT
const REPLAY_METADATA = REPLAY_CHECKPOINT
  ? (JSON.parse(readFileSync(REPLAY_CHECKPOINT, 'utf8')) as {
      mode: 'voxPopuli' | 'cupidArrow' | 'survival'
      seeds: { roster: number; season: number; actor: number }
    })
  : null
const CAPTURE_ON_REPLAY = process.env.SEASON_SIM_CAPTURE_ON_REPLAY === '1'
const CHECKPOINT_DIRECTORY = process.env.SEASON_SIM_CHECKPOINT_DIR ?? '.cache/season-checkpoints'
const REPLAY_MAX_DAYS = Number.parseInt(process.env.SEASON_SIM_REPLAY_MAX_DAYS ?? '20', 10)
const REPLAY_ACCELERATE_TO_DAY = process.env.SEASON_SIM_REPLAY_ACCELERATE_TO_DAY
  ? Number.parseInt(process.env.SEASON_SIM_REPLAY_ACCELERATE_TO_DAY, 10)
  : null
if (!Number.isInteger(REPLAY_MAX_DAYS) || REPLAY_MAX_DAYS < 5) {
  throw new Error('SEASON_SIM_REPLAY_MAX_DAYS must be an integer of at least 5.')
}
if (
  REPLAY_ACCELERATE_TO_DAY !== null &&
  (!Number.isInteger(REPLAY_ACCELERATE_TO_DAY) || REPLAY_ACCELERATE_TO_DAY < 6)
) {
  throw new Error('SEASON_SIM_REPLAY_ACCELERATE_TO_DAY must be an integer after Day 5.')
}

// A full season produces enough action to overwhelm Playwright's default trace.
// Keep the structured auditor report while leaving large media artifacts off.
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await attachJuryDiagnostics(page, testInfo)
  }
})

if (LATE_GAME_PERFORMANCE_ENABLED) {
  test.describe('Seeded late-game performance @performance', () => {
    for (const mode of ['voxPopuli', 'cupidArrow', 'survival'] as const) {
      if (REPLAY_METADATA && REPLAY_METADATA.mode !== mode) continue
      test(`${mode} samples progression latency on Days 5–15`, async ({ page }, testInfo) => {
        test.setTimeout(REPLAY_CHECKPOINT?.endsWith('-finale.json') ? 6 * 60_000 : 30 * 60_000)
        const auditor = await runSeasonSimulation(
          page,
          testInfo,
          defaultSimulationConfig({
            id: `${mode}-late-game-performance`,
            mode,
            seeds: REPLAY_METADATA?.seeds ?? {
              roster: E2E_NEW_SEASON_FIXTURE.rosterSeed,
              season: E2E_NEW_SEASON_FIXTURE.seasonSeed,
              actor: Number(process.env.SEASON_SIM_ACTOR_SEED ?? 0x7a11ce42) >>> 0,
            },
            maxActions: 1_800,
            maxDays: REPLAY_CHECKPOINT ? REPLAY_MAX_DAYS : mode === 'survival' ? 15 : 20,
            skipCompetitions: true,
            skipOptionalConfessionals: true,
            continueToSeasonComplete: mode !== 'survival',
            saveResumeAtDay: REPLAY_CHECKPOINT ? undefined : 1,
            // Save/resume stays a normal UI journey at the guaranteed opening
            // boundary, then visible QA controls seed the late-game window.
            journeyAcceleration: REPLAY_CHECKPOINT
              ? REPLAY_ACCELERATE_TO_DAY
                ? { fromDay: 5, toDay: REPLAY_ACCELERATE_TO_DAY }
                : undefined
              : { fromDay: 1, toDay: 5 },
            captureSaveResumePerformance: !REPLAY_CHECKPOINT,
            checkpointCaptureDir:
              REPLAY_CHECKPOINT && !CAPTURE_ON_REPLAY ? undefined : CHECKPOINT_DIRECTORY,
            assistedCheckpoint: REPLAY_CHECKPOINT,
            progressionPerformanceDays: CHECKPOINT_DAYS,
            checkpointEveryActions: 30,
            captureFinalScreenshot: false,
            compactEconomyReport: true,
          })
        )

        if (REPLAY_CHECKPOINT?.endsWith('-finale.json')) {
          expect((await readAppState(page)).game.seasonFinale?.phase).toBe('seasonComplete')
          await expect(page.getByRole('heading', { name: 'Season Complete' })).toBeVisible()
        } else {
          expect(auditor.progressionPerformanceCheckpoints.length).toBeGreaterThan(0)
          expect(
            auditor.progressionPerformanceCheckpoints.some(({ day }) => day >= 5),
            'the journey should reach the late-game measurement window'
          ).toBe(true)
        }
        if (!REPLAY_CHECKPOINT) {
          expect(
            auditor.saveResumePerformanceCheckpoints.some(({ day }) => day === 1),
            'the journey should save and resume at the opening boundary'
          ).toBe(true)
        }
        for (const checkpoint of auditor.progressionPerformanceCheckpoints) {
          assertProgressionCheckpoint(checkpoint, mode)
        }
        if (!REPLAY_CHECKPOINT?.endsWith('-finale.json')) {
          expect(
            auditor.progressionPerformanceCheckpoints.some(
              ({ sampleCounts }) => sampleCounts.reduxActions > 0
            ),
            'the journey should include gameplay actions after its initial checkpoint'
          ).toBe(true)
          expect(
            auditor.progressionPerformanceCheckpoints.some(
              ({ sampleCounts }) => sampleCounts.inputResponses > 0
            ),
            'the journey should include visible input after its initial checkpoint'
          ).toBe(true)
        }
        if (mode === 'survival') {
          const state = await readAppState(page)
          expect(state.game.modeSpecific?.kind).toBe('survival')
          if (state.game.modeSpecific?.kind === 'survival') {
            expect(state.game.modeSpecific.adContinueCount).toBe(0)
          }
          if (!REPLAY_CHECKPOINT) {
            const sampledDays = auditor.progressionPerformanceCheckpoints.map(({ day }) => day)
            expect(sampledDays).toEqual(expect.arrayContaining([5, 10]))
            expect(Math.max(...sampledDays)).toBeGreaterThanOrEqual(12)
          }
        }
        await auditor.assertNoErrorsAtEnd()
        await page.goto('about:blank')
      })
    }
  })
}

function assertProgressionCheckpoint(
  checkpoint: ProgressionPerformanceCheckpoint,
  mode: ProgressionPerformanceCheckpoint['mode']
): void {
  expect(checkpoint.mode).toBe(mode)
  expect(CHECKPOINT_DAYS).toContain(checkpoint.day)
  expect(checkpoint.snapshot.totalBytes).toBeGreaterThan(0)
  expect(checkpoint.persistence).not.toBeNull()
  expect(checkpoint.persistence?.lastSnapshotBytes).toBeGreaterThan(0)
  expect(checkpoint.persistence?.blockedReason).toBeNull()
  if (checkpoint.sampleCounts.inputResponses > 0) {
    expect(checkpoint.metrics.inputResponseP95Ms).not.toBeNull()
  }
  if (checkpoint.sampleCounts.reduxActions > 0) {
    expect(checkpoint.metrics.reduxActionP95Ms).not.toBeNull()
  }
}
