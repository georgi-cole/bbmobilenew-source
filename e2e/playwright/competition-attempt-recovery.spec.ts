import type { Browser, BrowserContext, Page } from '@playwright/test'
import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  E2E_NEW_SEASON_FIXTURE,
  expect,
  readAppState,
  readDurableItem,
  test,
} from './support/test'

const APP_URL = 'http://127.0.0.1:4173/bbmobilenew/'
const SAVED_RUN_SLOT_KEY_PREFIX = 'bbmobilenew:savedRunSlot:'
const SCREEN_TIMEOUT_MS = 30_000

async function waitForHome(page: Page): Promise<void> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(mainMenu).toBeVisible({ timeout: SCREEN_TIMEOUT_MS * 2 })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
  await expect(mainMenu.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function createProfile(page: Page, name: string): Promise<string> {
  const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
  const createProfileButton = page.getByRole('button', { name: /Create (New )?Profile$/i })
  const playWithoutSignIn = page.getByRole('button', {
    name: 'Play without signing in',
    exact: true,
  })
  await expect(mainMenu.or(createProfileButton).or(playWithoutSignIn)).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS * 2,
  })
  await closeDebugPanelIfOpen(page)
  if (await mainMenu.isVisible().catch(() => false)) {
    await mainMenu.getByRole('button', { name: 'Profile', exact: true }).click()
  }
  await expect(playWithoutSignIn.or(createProfileButton)).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
  if (await playWithoutSignIn.isVisible()) await playWithoutSignIn.click()
  else await createProfileButton.click()
  await page.getByRole('button', { name: 'Choose this look', exact: true }).click()
  const reveal = page.getByRole('dialog', { name: /^Look \d+$/ })
  await expect(reveal).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  const skipReveal = reveal.getByRole('button', { name: 'Skip reveal', exact: true })
  if (await skipReveal.isVisible().catch(() => false)) await skipReveal.click()
  const continueReveal = reveal.getByRole('button', { name: 'Continue', exact: true })
  await expect(continueReveal).toBeEnabled({ timeout: SCREEN_TIMEOUT_MS })
  await continueReveal.click()
  await expect(reveal).toBeHidden({ timeout: SCREEN_TIMEOUT_MS })
  await expect(page.getByLabel('Display Name')).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await page.getByLabel('Display Name').fill(name)
  await page.getByLabel('Age').fill('28')
  await page.getByLabel('Location').fill('Sofia')
  await page.getByLabel('Sex (Reality storylines)').selectOption('Male')
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()

  const profileId = (await readAppState(page)).profiles.activeProfileId
  if (profileId == null) throw new Error('The competition test profile was not created.')
  await page.evaluate(
    (id) => localStorage.setItem(`bbmobilenew_season_tutorial_v1:${id}`, 'done'),
    profileId
  )
  await page.getByRole('button', { name: 'Go back' }).click()
  await waitForHome(page)
  return profileId
}

async function startSeason(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu).toBeVisible()
  await playMenu.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

async function forceMinigame(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Toggle Debug Panel' }).click()
  const debugPanel = page.getByRole('complementary', { name: 'Debug Panel' })
  await expect(debugPanel).toBeVisible()
  await debugPanel.getByRole('button', { name: 'Force Game' }).click()
  await page.getByRole('option', { name: title, exact: true }).click()
  await debugPanel.getByRole('button', { name: 'Apply', exact: true }).click()
  await closeDebugPanelIfOpen(page)
}

async function closePhaseInfoIfPresent(page: Page): Promise<void> {
  const phaseInfo = page.getByRole('dialog', { name: /^Phase info:/ })
  if (await phaseInfo.isVisible().catch(() => false)) {
    await phaseInfo.getByRole('button', { name: 'Close' }).click()
    await expect(phaseInfo).toBeHidden()
  }
}

async function openFirstLohCompetition(page: Page): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    await closePhaseInfoIfPresent(page)
    const phase = (await readAppState(page)).game.phase
    if (phase === 'loh_comp_announcement') break

    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    if (await continueButton.isVisible()) {
      await continueButton.click()
    } else {
      const advance = page.getByRole('button', { name: 'Advance to next phase' })
      await expect(advance).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
      await expect(advance).toBeEnabled()
      await advance.click()
    }
  }

  await expect
    .poll(() => readAppState(page).then((state) => state.game.phase), {
      timeout: SCREEN_TIMEOUT_MS,
    })
    .toBe('loh_comp_announcement')
  await closePhaseInfoIfPresent(page)
  await page.getByRole('button', { name: 'Advance to next phase' }).click()

  const briefing = page.getByRole('button', { name: 'Start competition', exact: true })
  await expect(briefing).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await briefing.click()
  await expect(page.locator('.minigame-host-playing')).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await expect
    .poll(() => readAppState(page).then((state) => state.challenge.pending?.attempt?.status), {
      timeout: SCREEN_TIMEOUT_MS,
    })
    .toBe('playing')
}

async function forceCloseAndReopen(
  page: Page,
  browser: Browser
): Promise<{ context: BrowserContext; page: Page }> {
  // Closing the context sends no beforeunload event. Importing the captured
  // browser storage into a fresh context models a process restart with the same
  // durable IndexedDB contents.
  const storageState = await page.context().storageState({ indexedDB: true })
  await page.context().close()

  const context = await browser.newContext({ storageState })
  await context.addInitScript(
    ({ newSeasonFixture }) => {
      Object.defineProperty(window, '__E2E__', {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      })
      Object.defineProperty(window, '__bbE2ENewSeason', {
        configurable: false,
        enumerable: false,
        value: newSeasonFixture,
        writable: false,
      })
    },
    { newSeasonFixture: E2E_NEW_SEASON_FIXTURE }
  )

  const reopenedPage = await context.newPage()
  await reopenedPage.goto(APP_URL, {
    waitUntil: 'domcontentloaded',
    timeout: SCREEN_TIMEOUT_MS * 2,
  })
  await waitForHome(reopenedPage)
  return { context, page: reopenedPage }
}

async function resumeLastRun(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  const playMenu = page.getByRole('navigation', { name: 'Play menu' })
  await expect(playMenu.getByRole('button', { name: 'Continue Last' })).toBeVisible()
  await playMenu.getByRole('button', { name: 'Continue Last' }).click()
  await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
}

function resultContinueAction(page: Page) {
  return page
    .getByRole('button', { name: 'Close results', exact: true })
    .or(page.getByRole('button', { name: /Continue.*▶/ }))
}

async function savedAttemptStatus(page: Page, profileId: string): Promise<string | undefined> {
  const raw = await readDurableItem(
    page,
    `${SAVED_RUN_SLOT_KEY_PREFIX}${encodeURIComponent(profileId)}:classic`
  )
  if (raw == null) return undefined
  const savedRuns = JSON.parse(raw) as {
    challenge?: { pending?: { attempt?: { status?: string } } }
  }
  return savedRuns.challenge?.pending?.attempt?.status
}

test('force closing mid-competition forfeits once and keeps the result before Continue @persistence @release', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: SCREEN_TIMEOUT_MS * 2 })
  const profileId = await createProfile(page, 'Competition Restart Player')
  await startSeason(page)
  await openFirstLohCompetition(page)

  const activeAttempt = (await readAppState(page)).challenge.pending?.attempt
  expect(activeAttempt?.status).toBe('playing')
  await expect
    .poll(() => savedAttemptStatus(page, profileId), { timeout: SCREEN_TIMEOUT_MS })
    .toBe('playing')

  let reopened = await forceCloseAndReopen(page, browser)
  let activePage = reopened.page
  let activeContext = reopened.context
  try {
    await resumeLastRun(activePage)
    await expect(activePage.getByRole('heading', { name: 'Exited early' })).toBeVisible({
      timeout: SCREEN_TIMEOUT_MS,
    })

    const forfeited = (await readAppState(activePage)).challenge.pending?.attempt
    expect(forfeited).toMatchObject({
      number: activeAttempt?.number,
      status: 'finished',
      result: { rawValue: 0, partial: true },
    })
    await expect
      .poll(() => savedAttemptStatus(activePage, profileId), { timeout: SCREEN_TIMEOUT_MS })
      .toBe('finished')
    await expect(resultContinueAction(activePage).first()).toBeVisible()

    // The game has now recorded the forfeit, but the player has not continued.
    // A second forced close must restore this same result, not offer a fresh try.
    reopened = await forceCloseAndReopen(activePage, browser)
    activePage = reopened.page
    activeContext = reopened.context
    await resumeLastRun(activePage)
    await expect(activePage.getByRole('heading', { name: 'Exited early' })).toBeVisible({
      timeout: SCREEN_TIMEOUT_MS,
    })
    expect((await readAppState(activePage)).challenge.pending?.attempt).toMatchObject({
      number: activeAttempt?.number,
      status: 'finished',
      result: { rawValue: 0, partial: true },
    })
    await expect(resultContinueAction(activePage).first()).toBeVisible()
  } finally {
    await activeContext.close()
  }
})

test('a finished minigame result survives a forced browser restart before Continue @persistence @release', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  await page.goto('./', { waitUntil: 'domcontentloaded', timeout: SCREEN_TIMEOUT_MS * 2 })
  const profileId = await createProfile(page, 'Completed Competition Restart Player')
  await startSeason(page)
  await forceMinigame(page, 'Timing Bar')
  await openFirstLohCompetition(page)

  const host = page.getByRole('dialog', { name: /Timing Bar minigame/i })
  await host.getByRole('button', { name: /Begin Round 1/i }).click()
  await expect(host.locator('.tbg__playing')).toBeVisible({ timeout: SCREEN_TIMEOUT_MS })
  await host.getByRole('button', { name: 'Lock in this position as your final answer' }).click()
  await expect(host.getByRole('heading', { name: "You've been eliminated" })).toBeVisible({
    timeout: SCREEN_TIMEOUT_MS,
  })
  await host.getByRole('button', { name: /Skip to final results/i }).click()

  await expect
    .poll(() => readAppState(page).then((state) => state.challenge.pending?.attempt?.status), {
      timeout: SCREEN_TIMEOUT_MS,
    })
    .toBe('finished')
  const humanId = (await readAppState(page)).game.players.find((player) => player.isUser)?.id
  const completedAttempt = (await readAppState(page)).challenge.pending?.attempt
  expect(completedAttempt).toMatchObject({
    status: 'finished',
    result: {
      partial: false,
      completion: { authoritativeLastPlaceId: humanId },
    },
  })
  await expect
    .poll(() => savedAttemptStatus(page, profileId), { timeout: SCREEN_TIMEOUT_MS })
    .toBe('finished')
  await expect(resultContinueAction(page).first()).toBeVisible()

  const reopened = await forceCloseAndReopen(page, browser)
  try {
    await resumeLastRun(reopened.page)
    await expect(reopened.page.getByRole('dialog', { name: /Timing Bar minigame/i })).toBeVisible()
    await expect(resultContinueAction(reopened.page).first()).toBeVisible()
    expect((await readAppState(reopened.page)).challenge.pending?.attempt).toEqual(completedAttempt)
    expect((await readAppState(reopened.page)).challenge.pending?.attempt?.status).toBe('finished')
  } finally {
    await reopened.context.close()
  }
})
