import { expect, readAppState, test } from './support/test'
import { defaultSimulationConfig, runSeasonSimulation } from './season-sim/runner'

// Long journeys are better diagnosed through the structured auditor report
// than through a multi-hundred-megabyte trace.
test.use({ trace: 'off' })

test.describe('Human-like season simulation @season-sim', () => {
  for (const mode of ['voxPopuli', 'cupidArrow', 'survival'] as const) {
    test(`mode journey: ${mode} @mode-regression`, async ({ page }, testInfo) => {
      test.setTimeout(360_000)
      const auditor = await runSeasonSimulation(
        page,
        testInfo,
        defaultSimulationConfig({
          mode,
          maxActions: 45,
          maxDays: 1,
          skipCompetitions: true,
          skipOptionalConfessionals: true,
        })
      )
      expect(auditor.timeline.length).toBeGreaterThan(4)
      await auditor.assertNoErrorsAtEnd()
      await page.goto('about:blank')
    })
  }

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
    // Leave the active React tree before the fixture closes its browser context.
    // This is equivalent to a player leaving the app and lets phase-level
    // animation work clean up before Playwright teardown begins.
    await page.goto('about:blank')
  })
})

test.describe('Extended mode journeys @extended-mode', () => {
  for (const mode of ['voxPopuli', 'cupidArrow'] as const) {
    test(`${mode} reaches its season finale after a saved run is resumed @long-run`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60 * 60_000)
      const auditor = await runSeasonSimulation(
        page,
        testInfo,
        defaultSimulationConfig({
          mode,
          // Keep the Cupid full-season player socially active so the run can
          // reach the spell break and finale instead of ending at an early vote.
          ...(mode === 'cupidArrow'
            ? {
                personaId: 'social-butterfly',
                seeds: { roster: 1, season: 2, actor: 3 },
              }
            : {}),
          maxActions: 2_200,
          maxDays: 60,
          skipCompetitions: true,
          skipOptionalConfessionals: true,
          continueToSeasonComplete: true,
          saveResumeAtDay: 1,
          captureFinalScreenshot: false,
          // Long runs still collect every action and browser error; sample the
          // heavier layout/state audit less often to keep late-game checks fast.
          checkpointEveryActions: 15,
        })
      )
      const state = await readAppState(page)
      expect(state.game.seasonFinale?.phase).toBe('seasonComplete')
      expect(
        auditor.timeline.some((entry) => entry.module === 'persistence'),
        'the season should survive a visible save, browser reload, and resume'
      ).toBe(true)
      if (mode === 'voxPopuli') {
        expect(state.game.voxPopuli?.status).toBe('complete')
        expect(state.game.voxPopuli?.winnerId).toBeTruthy()
      } else {
        expect(state.game.cupidArrow?.status).toBe('broken')
        expect(state.game.cupidArrow?.eliminatedPairCount).toBeGreaterThanOrEqual(4)
      }
      await auditor.assertNoErrorsAtEnd()
      await page.goto('about:blank')
    })
  }

  test('Survival resumes, recovers through visible controls, and replaces Robo contestants @long-run', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60 * 60_000)
    const auditor = await runSeasonSimulation(
      page,
      testInfo,
      defaultSimulationConfig({
        mode: 'survival',
        maxActions: 700,
        maxDays: 8,
        skipCompetitions: true,
        skipOptionalConfessionals: true,
        forceDoubleElimination: true,
        saveResumeAtDay: 1,
        captureFinalScreenshot: false,
        checkpointEveryActions: 15,
      })
    )
    const state = await readAppState(page)
    const activeRobos = state.game.players.filter(
      (player) => player.isRobo && player.status === 'active'
    )
    const roboSlots = activeRobos.map((player) => player.survivorSlot)
    expect(state.game.modeSpecific?.kind).toBe('survival')
    if (state.game.modeSpecific?.kind === 'survival') {
      expect(state.game.modeSpecific.currentDay).toBeGreaterThan(1)
      expect(state.game.modeSpecific.totalRoboContestantsEvicted).toBeGreaterThanOrEqual(2)
    }
    expect(roboSlots.every((slot) => Number.isInteger(slot))).toBe(true)
    expect(new Set(roboSlots).size).toBe(roboSlots.length)
    expect(
      auditor.timeline.some((entry) => entry.module === 'persistence'),
      'the Survival run should survive a visible save, browser reload, and resume'
    ).toBe(true)
    await auditor.assertNoErrorsAtEnd()
    await page.goto('about:blank')
  })
})
