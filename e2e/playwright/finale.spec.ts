import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  readDurableItem,
  test,
  type Page,
} from './support/test'
import {
  advanceFinalePresentation,
  exitVisibleMinigameWithZero,
  startVisibleCompetitionBriefing,
} from './season-sim/runner'
import { dismissShockAcknowledgement } from './season-sim/shockAcknowledgement'
import { attachJuryDiagnostics } from './season-sim/juryDiagnostics'

const PROFILE_ID = 'e2e-finale-profile'
const PROFILE_NAME = 'Finale Journey Player'
const FIXTURE_SENTINEL_KEY = 'bbmobilenew:e2e:finale-fixture'
const PROFILES_STORAGE_KEY = 'bbmobilenew:profiles:v1'
const SETTINGS_STORAGE_KEY = 'bbmobilenew_settings_v1'
const PLAYER_SAFETY_STORAGE_KEY = 'bbmobilenew:player-safety:v1'
const VIP_STORAGE_KEY = 'bbmobilenew:vip:v2'
const ARCHIVE_KEY = `bbmobilenew:seasonArchives:${encodeURIComponent(PROFILE_ID)}`
const CLASSIC_RUN_KEY = `bbmobilenew:savedRunSlot:${encodeURIComponent(PROFILE_ID)}:classic`
const LEGACY_SAVED_STATE_KEY = `bbmobilenew:savedSeason:${encodeURIComponent(PROFILE_ID)}`

interface FixtureRoster {
  finalists: Array<{ id: string; name: string }>
  jurors: Array<{ id: string; name: string }>
  preJury: Array<{ id: string; name: string }>
}

interface PersistedRunFacts {
  awardEvents: Array<{ awardAmount?: number; winnerId?: string }>
  favoriteWinnerId: string | null
  finaleRunnerUpId: string | null
  finaleWinnerId: string | null
  seasonFinalePhase: string | null
}

interface ArchiveSummary {
  finalPlacement: number | null
  madeJury: boolean
  playerId: string
  wonPublicFavorite: boolean
}

async function installDeterministicFinaleFixture(page: Page): Promise<void> {
  await page.addInitScript(
    ({
      fixtureSentinelKey,
      playerSafetyStorageKey,
      profileId,
      profileName,
      profilesStorageKey,
      settingsStorageKey,
      vipStorageKey,
    }) => {
      // Keep roster selection and all incidental non-game random calls stable.
      // The game itself starts with its canonical deterministic seed (42).
      let randomState = 0x6d2b79f5
      Math.random = () => {
        randomState = (randomState + 0x6d2b79f5) >>> 0
        let value = randomState
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
      }

      // addInitScript runs again after reload. Seed storage only once so the
      // later reloads exercise the real saved run and archive instead of
      // silently reinstalling the fixture.
      if (localStorage.getItem(fixtureSentinelKey) === 'installed') return

      localStorage.clear()
      sessionStorage.clear()
      // These direct finale journeys start from a prepared game state, so the
      // one-time cold-open intro is outside the path under test.
      sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
      localStorage.setItem(
        profilesStorageKey,
        JSON.stringify({
          activeProfileId: profileId,
          isGuest: false,
          profiles: [
            {
              avatar: '🧑',
              createdAt: '2026-07-21T00:00:00.000Z',
              id: profileId,
              name: profileName,
            },
          ],
        })
      )
      localStorage.setItem(
        settingsStorageKey,
        JSON.stringify({
          audio: { musicOn: false, sfxOn: false },
          gameUX: { animations: false },
          sim: {
            enableFavoritePlayer: true,
            enableTwists: true,
            favoritePlayerAwardAmount: 25000,
            publicMode: true,
          },
        })
      )
      localStorage.setItem(
        playerSafetyStorageKey,
        JSON.stringify({
          version: 1,
          ageBand: 'adult',
          guardianPlayPermission: false,
          optionalFeatures: {
            location: false,
            analytics: false,
            onlineServices: false,
            ads: false,
          },
        })
      )
      // The deterministic finale journey does not exercise geolocation. Mark
      // that optional browser prompt as declined so it cannot cover the QA
      // controls on the direct game route.
      localStorage.setItem('bb:allowLocation', 'denied')
      localStorage.setItem(
        vipStorageKey,
        JSON.stringify({
          isActive: false,
          entitlements: {
            survivalMode: false,
            publicMode: false,
            tribunalHouse: false,
            dramaMode: false,
            cupidArrow: true,
            voxPopuli: true,
            premiumChallenges: false,
            noAds: false,
          },
          lastVerifiedAt: null,
        })
      )
      localStorage.setItem(fixtureSentinelKey, 'installed')
    },
    {
      fixtureSentinelKey: FIXTURE_SENTINEL_KEY,
      playerSafetyStorageKey: PLAYER_SAFETY_STORAGE_KEY,
      profileId: PROFILE_ID,
      profileName: PROFILE_NAME,
      profilesStorageKey: PROFILES_STORAGE_KEY,
      settingsStorageKey: SETTINGS_STORAGE_KEY,
      vipStorageKey: VIP_STORAGE_KEY,
    }
  )
}

async function readPersistedRun(page: Page): Promise<PersistedRunFacts> {
  const raw = await readDurableItem(page, CLASSIC_RUN_KEY)
  if (!raw) throw new Error('profile-scoped Classic finale snapshot is missing')

  const snapshot = JSON.parse(raw) as {
    finale?: { runnerUpId?: string | null; winnerId?: string | null }
    game?: {
      favoritePlayer?: { winnerId?: string | null } | null
      history?: Array<{
        data?: { awardAmount?: number; winnerId?: string }
        type?: string
      }>
      seasonFinale?: { phase?: string } | null
    }
  }
  if (!snapshot.game) throw new Error('Classic finale snapshot is incomplete')

  return {
    awardEvents: (snapshot.game.history ?? [])
      .filter((event) => event.type === 'favoritePlayer:award')
      .map((event) => ({
        awardAmount: event.data?.awardAmount,
        winnerId: event.data?.winnerId,
      })),
    favoriteWinnerId: snapshot.game.favoritePlayer?.winnerId ?? null,
    finaleRunnerUpId: snapshot.finale?.runnerUpId ?? null,
    finaleWinnerId: snapshot.finale?.winnerId ?? null,
    seasonFinalePhase: snapshot.game.seasonFinale?.phase ?? null,
  }
}

async function readArchive(page: Page): Promise<{
  archiveCount: number
  classicRunPresent: boolean
  legacySavePresent: boolean
  seasonId: string | null
  summaries: ArchiveSummary[]
}> {
  const [archiveRaw, classicRunRaw, legacySaveRaw] = await Promise.all([
    readDurableItem(page, ARCHIVE_KEY),
    readDurableItem(page, CLASSIC_RUN_KEY),
    readDurableItem(page, LEGACY_SAVED_STATE_KEY),
  ])
  const archives = archiveRaw
    ? (JSON.parse(archiveRaw) as Array<{
        playerSummaries?: ArchiveSummary[]
        seasonId?: string
      }>)
    : []

  return {
    archiveCount: archives.length,
    classicRunPresent: classicRunRaw != null,
    legacySavePresent: legacySaveRaw != null,
    seasonId: archives[0]?.seasonId ?? null,
    summaries: archives[0]?.playerSummaries ?? [],
  }
}

/** Open the debug panel by clicking the FAB toggle (if not already open). */
async function openDebugPanel(page: Page): Promise<void> {
  const fab = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(fab).toBeVisible({ timeout: 30_000 })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  if (!(await panel.isVisible())) {
    await fab.click()
  }
  await expect(panel).toBeVisible({ timeout: 5_000 })
}

async function openActiveGameRoute(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/game?debug=1'
  })
  await expect(page).toHaveURL(/#\/game\?debug=1$/)
  await openDebugPanel(page)
}

async function configureValidFinaleRoster(page: Page): Promise<FixtureRoster> {
  const gameState = await readAppState(page)
  const humanId = gameState.game.players.find((player) => player.isUser)?.id
  if (!humanId) throw new Error('The deterministic finale fixture has no human player.')

  const statusSelect = page.getByRole('combobox', { name: 'Player Hub Status' })
  const players = await statusSelect.locator('option').evaluateAll((options) =>
    options.slice(1).map((option) => ({
      id: (option as HTMLOptionElement).value,
      name: option.textContent?.replace(/\s+\([^)]*\)$/, '').trim() ?? '',
    }))
  )

  expect(players.length).toBeGreaterThanOrEqual(9)
  // Keep the human in the finale while configuring the roster. Marking the
  // human pre-jury eliminated can correctly end the live season before the
  // debug control has a chance to open the Tribunal.
  const finalists = [
    players.find((player) => player.id === humanId),
    players.find((player) => player.id !== humanId),
  ]
  if (finalists.some((player) => !player)) {
    throw new Error('The deterministic finale fixture cannot reserve two finalists.')
  }
  const resolvedFinalists = finalists as FixtureRoster['finalists']
  expect(resolvedFinalists.map((player) => player.id)).toContain(humanId)
  const remainingPlayers = players.filter(
    (player) => !resolvedFinalists.some((finalist) => finalist.id === player.id)
  )
  const jurors = remainingPlayers.slice(0, 7)
  const preJury = remainingPlayers.slice(7)

  for (const juror of jurors) {
    await statusSelect.selectOption(juror.id)
    await page.getByRole('button', { name: 'Set Tribunal' }).click()
  }
  for (const evictee of preJury) {
    await statusSelect.selectOption(evictee.id)
    await page.getByRole('button', { name: 'Set Pre-jury Eliminated' }).click()
  }

  return { finalists: resolvedFinalists, jurors, preJury }
}

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: 30_000 })
  await closeDebugPanelIfOpen(page)

  await dismissPermissionPromptIfPresent(page)

  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
}

async function resumeClassicRun(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()

  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  const continueLast = playMenu.getByRole('button', { name: 'Continue Last' })
  await expect(continueLast).toBeVisible()
  await continueLast.click()
}

function eventCount(state: Awaited<ReturnType<typeof readAppState>>, eventType: string): number {
  return (state.game.history ?? []).filter((event) => event.type === eventType).length
}

async function finishFinalThreePleaAndAnnouncement(page: Page): Promise<void> {
  const pleas = page.getByRole('dialog', { name: 'The Finale plea chat' })
  if (!(await pleas.isVisible().catch(() => false))) {
    expect(await advanceFinalePresentation(page)).toBe(true)
  }
  await expect(pleas).toBeVisible({ timeout: 10_000 })
  expect(await advanceFinalePresentation(page)).toBe(true)
  await expect(pleas).toBeHidden({ timeout: 10_000 })

  const announcement = page.getByRole('dialog', {
    name: 'The Finale elimination announcement',
  })
  const humanDecision = page.getByRole('dialog', { name: 'Final Power Decision' })
  await expect
    .poll(
      async () =>
        (await announcement.isVisible().catch(() => false)) ||
        (await humanDecision.isVisible().catch(() => false)),
      { timeout: 10_000 }
    )
    .toBe(true)

  if (await humanDecision.isVisible().catch(() => false)) {
    await humanDecision.getByRole('button').first().click()
    await humanDecision.getByRole('button', { name: /^Eliminate .+ · Keep .+/ }).click()
  }

  await expect(announcement).toBeVisible({ timeout: 10_000 })
  expect(await advanceFinalePresentation(page)).toBe(true)
  await expect(announcement).toBeHidden({ timeout: 10_000 })
}

test.describe('Finale / Jury flow @release', () => {
  test.setTimeout(300_000)

  test('Final Three decision advances through pleas and announcement without replaying a season', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await installDeterministicFinaleFixture(page)
    await page.goto('./#/game?debug=1', { waitUntil: 'commit', timeout: 60_000 })
    await expect(page).toHaveURL(/#\/game\?debug=1$/)
    await openDebugPanel(page)
    await page.getByRole('button', { name: 'Prepare Classic Final 3 Test' }).click()

    const preparedState = await readAppState(page)
    expect(preparedState.game.status).toBe('active')
    const human = preparedState.game.players.find((player) => player.isUser)
    const thirdAi = preparedState.game.players.find(
      (player) => !player.isUser && player.status === 'jury'
    )
    expect(human).toBeDefined()
    expect(thirdAi).toBeDefined()

    const preparedFinalists = preparedState
    expect(
      preparedFinalists.game.players.filter(
        (player) => player.status !== 'evicted' && player.status !== 'jury'
      )
    ).toHaveLength(3)
    expect(
      preparedFinalists.game.players.some(
        (player) => player.isUser && player.status !== 'evicted' && player.status !== 'jury'
      )
    ).toBe(true)
    expect(preparedFinalists.game.players.find((player) => player.id === thirdAi!.id)?.status).toBe(
      'jury'
    )

    await openActiveGameRoute(page)
    await page.getByRole('button', { name: 'F3 Part 3', exact: true }).click()
    await page.getByRole('button', { name: 'Advance Phase' }).click()
    await closeDebugPanelIfOpen(page)
    expect(await startVisibleCompetitionBriefing(page)).toBe(true)
    expect(await exitVisibleMinigameWithZero(page)).toBe(true)
    await expect
      .poll(
        async () => {
          const state = await readAppState(page)
          return state.game.phase === 'final3_decision' && state.game.awaitingFinal3Plea
        },
        { timeout: 15_000 }
      )
      .toBe(true)
    await closeDebugPanelIfOpen(page)

    await finishFinalThreePleaAndAnnouncement(page)
  })

  test('Cupid spell break reaches the Final Three plea and announcement without replaying a season', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await installDeterministicFinaleFixture(page)
    await page.goto('./#/game?debug=1', { waitUntil: 'commit', timeout: 60_000 })
    await openDebugPanel(page)
    const cupidUnlock = page.getByRole('button', { name: 'Unlock Cupid Test', exact: true })
    await expect(cupidUnlock).toBeVisible()
    await cupidUnlock.click()
    await page.getByRole('button', { name: 'Activate Cupid', exact: true }).click()

    expect((await readAppState(page)).game.cupidArrow?.status).toBe('active')
    await page.getByRole('button', { name: 'Test Cupid Dissociation' }).click()
    await expect.poll(async () => (await readAppState(page)).game.cupidArrow?.status).toBe('broken')
    await dismissShockAcknowledgement(page)

    await page.getByRole('button', { name: 'Prepare Classic Final 3 Test' }).click()
    const preparedState = await readAppState(page)
    expect(preparedState.game.status).toBe('active')
    expect(preparedState.game.cupidArrow?.status).toBe('broken')
    const human = preparedState.game.players.find((player) => player.isUser)
    expect(human?.status).toBe('active')

    await openActiveGameRoute(page)
    await page.getByRole('button', { name: 'F3 Part 3', exact: true }).click()
    await page.getByRole('button', { name: 'Advance Phase' }).click()
    await closeDebugPanelIfOpen(page)
    expect(await startVisibleCompetitionBriefing(page)).toBe(true)
    expect(await exitVisibleMinigameWithZero(page)).toBe(true)
    await expect
      .poll(
        async () => {
          const state = await readAppState(page)
          return state.game.phase === 'final3_decision' && state.game.awaitingFinal3Plea
        },
        { timeout: 15_000 }
      )
      .toBe(true)
    expect((await readAppState(page)).game.cupidArrow?.status).toBe('broken')
    await closeDebugPanelIfOpen(page)

    await finishFinalThreePleaAndAnnouncement(page)
  })

  test('Cupid Tribunal records its pending jury work and completed clue timer', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000)
    await installDeterministicFinaleFixture(page)
    await page.goto('./?debugPerformance=1#/game?debug=1', { timeout: 90_000 })
    await openDebugPanel(page)
    await page.getByRole('button', { name: 'Unlock Cupid Test', exact: true }).click()
    await page.getByRole('button', { name: 'Activate Cupid', exact: true }).click()
    await page.getByRole('button', { name: 'Test Cupid Dissociation' }).click()
    await expect.poll(async () => (await readAppState(page)).game.cupidArrow?.status).toBe('broken')
    await dismissShockAcknowledgement(page)
    await page.getByRole('button', { name: 'Prepare Classic Final 3 Test' }).click()
    await openActiveGameRoute(page)
    await configureValidFinaleRoster(page)
    await page.getByRole('button', { name: '→ Force Tribunal' }).click()
    await closeDebugPanelIfOpen(page)

    const tribunal = page.getByRole('dialog', { name: 'Tribunal Finale' })
    await expect(tribunal).toBeVisible({ timeout: 10_000 })
    await tribunal.getByRole('button', { name: 'Begin Tribunal ▶' }).click()
    await expect
      .poll(async () => (await readAppState(page)).finale.revealedCount, { timeout: 30_000 })
      .toBeGreaterThan(0)
    const events = await page.evaluate(
      () => window.__bbGamePerformance?.snapshot().juryEvents ?? []
    )
    expect(events.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'redux-finale-transition',
        'tribunal-stage',
        'tribunal-opening-button-pressed',
        'tribunal-clue-scheduled',
        'tribunal-clue-timer-fired',
      ])
    )
    expect((await readAppState(page)).game.cupidArrow?.status).toBe('broken')
    await attachJuryDiagnostics(page, testInfo)
  })

  test('Vox Populi carries the Final Three audience ballot through the player appeal', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await installDeterministicFinaleFixture(page)
    await page.goto('./#/game?debug=1', { waitUntil: 'commit', timeout: 60_000 })
    await openDebugPanel(page)
    await page.getByRole('button', { name: 'Unlock Vox Test', exact: true }).click()
    await page.getByRole('button', { name: 'Activate Vox', exact: true }).click()
    await expect.poll(async () => (await readAppState(page)).game.voxPopuli?.status).toBe('active')
    await page.getByRole('button', { name: 'Prepare Vox Final 3 Test', exact: true }).click()

    const preparedState = await readAppState(page)
    expect(preparedState.game.status).toBe('active')
    const finalists = preparedState.game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury'
    )
    expect(finalists).toHaveLength(3)
    const human = finalists.find((player) => player.isUser)
    const nominees = finalists.filter((player) => !player.isUser)
    expect(human).toBeDefined()
    expect(nominees).toHaveLength(2)

    const nomineeRow = page.locator('.dbg-row--col').filter({
      has: page.locator('.dbg-label', { hasText: 'Force Nominees' }),
    })
    await nomineeRow.locator('select').nth(0).selectOption(human!.id)
    await nomineeRow.locator('select').nth(1).selectOption(nominees[0].id)
    await nomineeRow.getByRole('button', { name: 'Set', exact: true }).click()

    const lohRow = page.locator('.dbg-row').filter({
      has: page.locator('.dbg-label', { hasText: 'Force LOH' }),
    })
    await lohRow.locator('select').selectOption(nominees[1].id)
    await lohRow.getByRole('button', { name: 'Set', exact: true }).click()

    const phaseRow = page.locator('.dbg-row').filter({
      has: page.locator('.dbg-label', { hasText: 'Set Phase' }),
    })
    await phaseRow.locator('select').selectOption('final3_decision')
    await phaseRow.getByRole('button', { name: 'Set', exact: true }).click()
    await page.getByRole('button', { name: 'Advance Phase' }).click()
    await expect
      .poll(
        async () => {
          const vox = (await readAppState(page)).game.voxPopuli
          return vox?.awaitingPublicVote === true && vox.publicVoteContext === 'final3'
        },
        { timeout: 10_000 }
      )
      .toBe(true)
    await openActiveGameRoute(page)
    await closeDebugPanelIfOpen(page)
    await dismissShockAcknowledgement(page)

    const appeal = page.getByRole('dialog', { name: 'Final appeal to the audience' })
    await expect(appeal).toBeVisible()
    await appeal.getByRole('button', { name: /The people/ }).click()
    await expect
      .poll(async () => (await readAppState(page)).game.voxPopuli?.finalThreeAppeal)
      .toBe('loyalty')

    await page.getByRole('button', { name: 'Advance to next phase', exact: true }).click()
    await expect
      .poll(
        async () => {
          const game = (await readAppState(page)).game
          return (
            game.voxPopuli?.awaitingPublicVote === false &&
            game.voteResultsMode === 'public' &&
            game.pendingEviction?.evicteeId != null
          )
        },
        { timeout: 15_000 }
      )
      .toBe(true)
  })

  test('completes a valid finale, reward, recap, and archive exactly once @core-journey @persistence @economy', async ({
    page,
  }) => {
    await installDeterministicFinaleFixture(page)
    await page.goto('./#/game?debug=1')
    await openDebugPanel(page)

    const initialState = await readAppState(page)
    expect(initialState.game.seed).toBe(42)
    expect(initialState.profiles).toMatchObject({ activeProfileId: PROFILE_ID, isGuest: false })
    expect(initialState.profiles.profiles).toContainEqual(
      expect.objectContaining({ id: PROFILE_ID, name: PROFILE_NAME })
    )

    // The cold store has no active season. Enter the valid finale fixture
    // before changing statuses so the route does not correctly return Home.
    await page.getByRole('button', { name: 'Prepare Classic Final 3 Test' }).click()
    await openActiveGameRoute(page)

    const roster = await configureValidFinaleRoster(page)
    const fixtureState = await readAppState(page)
    expect(
      fixtureState.game.players
        .filter((player) => player.status !== 'jury' && player.status !== 'evicted')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.finalists.map((player) => player.id).sort())
    expect(
      fixtureState.game.players
        .filter((player) => player.status === 'jury')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.jurors.map((player) => player.id).sort())
    expect(
      fixtureState.game.players
        .filter((player) => player.status === 'evicted')
        .map((player) => player.id)
        .sort()
    ).toEqual(roster.preJury.map((player) => player.id).sort())

    await page.getByRole('button', { name: '→ Force Tribunal' }).click()
    await closeDebugPanelIfOpen(page)

    const tribunal = page.getByRole('dialog', { name: 'Tribunal Finale' })
    await expect(tribunal).toBeVisible({ timeout: 10_000 })
    const beginTribunal = tribunal.getByRole('button', { name: 'Begin Tribunal ▶' })
    await expect(beginTribunal).toBeEnabled()
    await beginTribunal.click()
    await expect(beginTribunal).toBeHidden()
    await expect
      .poll(async () => (await readAppState(page)).finale.revealedCount, { timeout: 30_000 })
      .toBeGreaterThan(0)
    await expect
      .poll(
        async () => {
          const state = await readAppState(page)
          return state.finale.jurorIds.filter((id) => id !== '__public__').sort()
        },
        {
          message: 'the Tribunal should retain every configured jury member',
          timeout: 30_000,
        }
      )
      .toEqual(expect.arrayContaining(roster.jurors.map((player) => player.id).sort()))
    const tribunalState = await readAppState(page)
    expect([...tribunalState.finale.finalistIds].sort()).toEqual(
      roster.finalists.map((player) => player.id).sort()
    )
    expect(
      tribunalState.finale.jurorIds
        .filter((id) => id !== '__public__')
        .every((id) => [...roster.jurors, ...roster.preJury].some((player) => player.id === id))
    ).toBe(true)

    await tribunal
      .getByRole('button', { name: /Skip All/ })
      .evaluate((button) => (button as HTMLButtonElement).click())
    const recap = page.getByRole('dialog', { name: 'Season recap archive' })
    await expect(recap).toBeVisible({ timeout: 10_000 })
    const skipRecapOpening = recap.getByRole('button', { name: 'Skip opening' })
    if (await skipRecapOpening.isVisible().catch(() => false)) {
      await skipRecapOpening.click({ timeout: 1_500 }).catch(() => undefined)
    }
    await expect(recap.getByRole('heading', { name: 'Choose the next chapter.' })).toBeVisible({
      timeout: 30_000,
    })
    await recap
      .getByRole('button', { name: 'Exit season recap' })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(recap).toBeHidden()

    await expect(tribunal).toBeVisible({ timeout: 10_000 })
    await tribunal
      .getByRole('button', { name: /Skip All/ })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(tribunal).toContainText(/wins The Big Eye|Winner declared/, {
      timeout: 10_000,
    })

    const resolvedFinale = await readAppState(page)
    const winnerId = resolvedFinale.finale.winnerId
    const runnerUpId = resolvedFinale.finale.runnerUpId
    expect(winnerId).not.toBeNull()
    expect(runnerUpId).not.toBeNull()
    expect(winnerId).not.toBe(runnerUpId)
    expect(roster.finalists.map((player) => player.id)).toContain(winnerId)
    expect(roster.finalists.map((player) => player.id)).toContain(runnerUpId)

    const continueTribunal = tribunal.getByRole('button', { name: 'Continue 🎉', exact: true })
    await expect(continueTribunal).toBeVisible({ timeout: 15_000 })
    await continueTribunal.click({ timeout: 3_000 })

    const winnerReveal = page.getByRole('dialog', { name: /Season \d+ winner reveal/ })
    await expect(winnerReveal).toBeVisible({ timeout: 10_000 })
    const persistedWinner = await readAppState(page)
    const winner = persistedWinner.game.players.find((player) => player.id === winnerId)
    const runnerUp = persistedWinner.game.players.find((player) => player.id === runnerUpId)
    if (!winner || !runnerUp) throw new Error('resolved finalists are absent from the game roster')

    expect(persistedWinner.game.players.filter((player) => player.isWinner)).toHaveLength(1)
    expect(persistedWinner.game.players.filter((player) => player.finalRank === 1)).toHaveLength(1)
    expect(persistedWinner.game.players.filter((player) => player.finalRank === 2)).toHaveLength(1)
    expect(winner.isWinner).toBe(true)
    expect(winner.finalRank).toBe(1)
    expect(runnerUp.finalRank).toBe(2)
    await expect(winnerReveal).toContainText(winner.name)

    await dismissPermissionPromptIfPresent(page)
    await winnerReveal.getByRole('button', { name: 'Continue' }).click()
    const interview = page.getByRole('dialog', { name: 'Winner interview' })
    await expect(interview).toBeVisible()
    await interview.getByRole('button', { name: 'Skip to end' }).click()

    const favoriteSetup = page.getByRole('dialog', { name: 'Public favorite setup' })
    await expect(favoriteSetup).toBeVisible()
    await page.evaluate(() => {
      window.location.hash = '/game?debug=1'
    })
    await expect(page).toHaveURL(/#\/game\?debug=1$/)
    await expect(favoriteSetup).toBeVisible()
    await favoriteSetup.getByRole('button', { name: 'Skip to end' }).click()

    const favoriteVote = page.getByRole('dialog', {
      name: "Public's Favorite Player overlay",
    })
    await expect(favoriteVote).toBeVisible({ timeout: 15_000 })
    await favoriteVote.getByRole('button', { name: /Lock/ }).click()
    const favoriteFastForward = favoriteVote.getByRole('button', {
      name: 'Fast forward public favorite vote',
    })
    if (await favoriteFastForward.isVisible()) {
      await favoriteFastForward.click()
    }
    const favoriteVoteButtons = favoriteVote.getByRole('button', { name: /Vote for/ })
    if ((await favoriteVoteButtons.count()) > 0) {
      await favoriteVoteButtons.first().click()
    }
    const favoriteContinue = favoriteVote.getByRole('button', { name: /Continue/ })
    await expect(favoriteContinue).toBeVisible({ timeout: 30_000 })
    await favoriteContinue.click()

    const goodbye = page.getByRole('dialog', { name: 'Final goodbye sequence' })
    await expect(goodbye).toBeVisible({ timeout: 10_000 })
    const rewardedState = await readAppState(page)
    const favoriteWinnerId = rewardedState.game.favoritePlayer?.winnerId ?? null
    expect(favoriteWinnerId).not.toBeNull()
    expect(rewardedState.game.favoritePlayer?.active).toBe(false)
    expect(eventCount(rewardedState, 'favoritePlayer:start')).toBe(1)
    expect(eventCount(rewardedState, 'favoritePlayer:winner')).toBe(1)
    expect(eventCount(rewardedState, 'favoritePlayer:award')).toBe(1)

    const persistedBeforeReload = await readPersistedRun(page)
    expect(persistedBeforeReload).toEqual({
      awardEvents: [{ awardAmount: 25000, winnerId: favoriteWinnerId }],
      favoriteWinnerId,
      finaleRunnerUpId: runnerUpId,
      finaleWinnerId: winnerId,
      seasonFinalePhase: 'goodbyeSequence',
    })

    await page.reload()
    await waitForHome(page)
    expect(await readPersistedRun(page)).toEqual(persistedBeforeReload)

    await resumeClassicRun(page)
    const resumedGoodbye = page.getByRole('dialog', { name: 'Final goodbye sequence' })
    await expect(resumedGoodbye).toBeVisible({ timeout: 10_000 })
    const resumedState = await readAppState(page)
    expect(eventCount(resumedState, 'favoritePlayer:award')).toBe(1)
    expect(resumedState.game.favoritePlayer?.winnerId).toBe(favoriteWinnerId)
    await expect(page.getByRole('dialog', { name: 'Season recap cinematic' })).toBeHidden()
    await expect(favoriteVote).toBeHidden()

    await resumedGoodbye.getByRole('button', { name: 'Skip to end' }).click()
    await expect(page.getByLabel('Credits cinematic', { exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Skip credits' }).click()
    await expect(page).toHaveURL(/#\/game-over$/, { timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'Season Complete' })).toBeVisible()

    await expect(page.getByText('Season champion', { exact: true })).toBeVisible()
    await expect(page.getByText(winner.name, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Runner-up', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(runnerUp.name, { exact: true }).first()).toBeVisible()

    const completedState = await readAppState(page)
    expect(completedState.game.seasonFinale?.phase).toBe('seasonComplete')
    expect(eventCount(completedState, 'favoritePlayer:award')).toBe(1)

    await page.getByRole('main').getByRole('button', { name: 'Home', exact: true }).click()
    await waitForHome(page)
    const archived = await readArchive(page)
    expect(archived.archiveCount).toBe(1)
    expect(archived.seasonId).toBeTruthy()
    expect(archived.classicRunPresent).toBe(false)
    expect(archived.legacySavePresent).toBe(false)
    expect(archived.summaries.filter((summary) => summary.finalPlacement === 1)).toEqual([
      expect.objectContaining({ playerId: winnerId }),
    ])
    expect(archived.summaries.filter((summary) => summary.finalPlacement === 2)).toEqual([
      expect.objectContaining({ playerId: runnerUpId }),
    ])
    expect(archived.summaries.filter((summary) => summary.wonPublicFavorite)).toEqual([
      expect.objectContaining({ playerId: favoriteWinnerId }),
    ])
    for (const juror of roster.jurors) {
      expect(archived.summaries).toContainEqual(
        expect.objectContaining({ madeJury: true, playerId: juror.id })
      )
    }
    for (const preJuror of roster.preJury) {
      expect(archived.summaries).toContainEqual(
        expect.objectContaining({ madeJury: false, playerId: preJuror.id })
      )
    }
  })
})
