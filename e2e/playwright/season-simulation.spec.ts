import { expect, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'

test.describe('Human-like season simulation @season-sim', () => {
  test('strategic player starts Day 1 through the visible UI and reports coverage @smoke @mobile', async ({
    page,
  }, testInfo) => {
    const configuredActions = Number(process.env.SEASON_SIM_MAX_ACTIONS ?? 4)
    test.setTimeout(configuredActions > 50 ? 60 * 60_000 : 180_000)
    const config = defaultSimulationConfig()
    const auditor = await runSeasonSimulation(page, testInfo, config)
    expect(
      auditor.timeline,
      'the smoke run should progress through visible Day 1 controls'
    ).not.toHaveLength(0)
    await auditor.assertNoErrorsAtEnd()
    // Close the page explicitly so long-lived game timers do not delay context teardown.
    await page.close({ runBeforeUnload: false })
  })
})
