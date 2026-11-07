import { expect, readAppState, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'
import { seedsForRepeat } from './season-sim/seeds'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const visibleFromDay = Number.parseInt(process.env.SURVIVAL_DISCOVERY_VISIBLE_FROM_DAY ?? '15', 10)
const setupOnly = process.env.SURVIVAL_DISCOVERY_SETUP_ONLY === '1'
if (!Number.isInteger(visibleFromDay) || visibleFromDay < 1 || visibleFromDay > 15) {
  throw new Error('SURVIVAL_DISCOVERY_VISIBLE_FROM_DAY must be an integer from 1 to 15.')
}
if (setupOnly && visibleFromDay !== 5) {
  throw new Error('SURVIVAL_DISCOVERY_SETUP_ONLY requires a Day 5 visible boundary.')
}

if (process.env.RUN_SURVIVAL_SEED_DISCOVERY === '1') {
  test('records whether a Surveyeval seed survives to Day 15 without recovery', async ({
    page,
  }, testInfo) => {
    test.setTimeout(15 * 60_000)
    const config = defaultSimulationConfig({
      id: 'survival-seed-discovery',
      mode: 'survival',
      maxActions: setupOnly ? 4 : visibleFromDay === 15 ? 2 : 1_200,
      maxDays: 15,
      journeyAcceleration: { fromDay: 1, toDay: visibleFromDay },
      checkpointCaptureDir:
        setupOnly || process.env.SURVIVAL_DISCOVERY_CAPTURE_CHECKPOINTS === '1'
          ? (process.env.SEASON_SIM_CHECKPOINT_DIR ?? '.cache/season-checkpoints')
          : undefined,
      skipCompetitions: true,
      skipOptionalConfessionals: true,
      checkpointEveryActions: 100,
      captureFinalScreenshot: false,
      compactEconomyReport: true,
    })
    const auditor = await runSeasonSimulation(page, testInfo, config)
    const state = await readAppState(page)
    expect(state.game.modeSpecific?.kind).toBe('survival')
    const survivor = state.game.modeSpecific
    if (survivor?.kind !== 'survival') throw new Error('Surveyeval state is missing.')
    const humanStatus = state.game.players.find((player) => player.isUser)?.status ?? 'missing'
    expect(survivor.adContinueCount).toBe(0)
    const outcome = {
      seeds: process.env.SEASON_SIM_BATCH_ID
        ? seedsForRepeat(config.seeds, testInfo.repeatEachIndex)
        : config.seeds,
      day: survivor.currentDay,
      humanStatus,
      status: state.game.status,
      reachedDay15: survivor.currentDay >= 15 && humanStatus === 'active',
    }
    console.log(`SURVIVAL_SEED_RESULT ${JSON.stringify(outcome)}`)
    await testInfo.attach('survival-seed-result.json', {
      body: JSON.stringify(outcome, null, 2),
      contentType: 'application/json',
    })
    await auditor.assertNoErrorsAtEnd()
    await page.goto('about:blank')
  })
}
