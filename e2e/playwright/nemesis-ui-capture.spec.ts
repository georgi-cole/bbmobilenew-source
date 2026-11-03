import { copyFile, mkdir } from 'node:fs/promises'
import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Page,
  type TestInfo,
} from './support/test'
import { openProfileCreationForm } from './support/profile'

/**
 * Authentic PR screenshots: React components, Redux reducers and the Faux TV
 * run in Chromium. Debug controls seed reproducible game state, NOT mock HTML.
 * Screenshots are saved both to the test result and a persistent CI evidence
 * directory, since the later finale test clears Playwright's test-results.
 */
async function captureActualScreen(page: Page, testInfo: TestInfo, filename: string) {
  const capturePath = testInfo.outputPath(filename)
  await page.screenshot({ path: capturePath, fullPage: true })
  await mkdir('visual-evidence/nemesis', { recursive: true })
  await copyFile(capturePath, `visual-evidence/nemesis/${filename}`)
}

async function startCaptureGame(page: Page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await expect(menu).toBeVisible({ timeout: 30_000 })
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)

  await openProfileCreationForm(page)
  await page.getByLabel('Display Name').fill('Nemesis QA Player')
  await page.getByLabel('Age').fill('28')
  await page.getByLabel('Location', { exact: false }).first().fill('QA City')
  await page.getByLabel('Sex (Reality storylines)').selectOption('Male')
  await page.locator('.app-shell__main').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Play', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Play menu' })
    .getByRole('button', {
      name: 'Classic',
      exact: true,
    })
    .click()
  await expect(page.getByRole('toolbar', { name: 'Game actions' })).toBeVisible()
}

async function seedRealNemesis(page: Page, scenario: 'warning' | 'reveal') {
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  await toggle.click()
  await expect(panel).toBeVisible()
  await panel
    .getByRole('button', {
      name: scenario === 'warning' ? 'Load Nemesis warning preview' : 'Load Nemesis reveal preview',
    })
    .click()
  await expect(panel).toBeHidden()
  const state = await readAppState(page)
  const human = state.game.players.find((player) => player.isUser)
  const nemesis = state.game.players.find(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
  if (!human || !nemesis) throw new Error('The real game has no valid QA cast')
  expect(state.game.phase).toBe('social_2')
  return { human, nemesis, state }
}

test.describe('Nemesis PR actual UI screenshots @nemesis-visual @smoke', () => {
  test.setTimeout(120_000)

  test('anonymous Faux TV warning is rendered by the running game', async ({ page }, testInfo) => {
    await startCaptureGame(page)
    const { state } = await seedRealNemesis(page, 'warning')
    expect(
      Object.values(state.social.reality.relationshipAutonomy.nemeses).some(
        (entry) => entry.status === 'ACTIVE' && Boolean(entry.clueEventId) && !entry.revealEventId
      )
    ).toBe(true)
    const tv = page.getByRole('region', { name: 'Live game events display' })
    await expect(tv).toBeVisible()
    await expect(tv.getByText(/Someone in the Hub is quietly questioning your game/)).toBeVisible({
      timeout: 20_000,
    })
    await captureActualScreen(page, testInfo, '01-real-faux-tv-anonymous-warning.png')
  })

  test('real reveal, Nemesis relationship, one-energy action and private answer', async ({
    page,
  }, testInfo) => {
    await startCaptureGame(page)
    const { human, nemesis, state } = await seedRealNemesis(page, 'reveal')
    const objective = Object.values(state.social.reality.relationshipAutonomy.nemeses).find(
      (entry) => entry.ownerId === nemesis.id && entry.targetId === human.id
    )
    expect(objective?.revealEventId).toBeTruthy()
    const pact = state.social.reality.alliances[`qa-nemesis-pact:${human.id}:${nemesis.id}`]
    expect(pact?.status).toBe('DISSOLVED')
    const group = Object.values(state.social.reality.alliances).find(
      (entry) =>
        entry.kind === 'GROUP' &&
        entry.memberIds.includes(human.id) &&
        entry.memberIds.includes(nemesis.id)
    )
    expect(group?.status).toBe('FRACTURED')

    const tv = page.getByRole('region', { name: 'Live game events display' })
    await expect(tv).toBeVisible()
    await expect(tv.getByText(new RegExp(`${nemesis.name} has turned against you`))).toBeVisible({
      timeout: 20_000,
    })
    await captureActualScreen(page, testInfo, '02-real-faux-tv-nemesis-reveal.png')

    await page
      .getByRole('toolbar', { name: 'Game actions' })
      .getByRole('button', {
        name: /^Social(?: \(\d+\))?$/,
      })
      .click()
    const social = page.getByRole('dialog', { name: 'Social Phase' })
    await expect(social).toBeVisible()
    const tutorial = page.getByTestId('reality-social-tutorial-prompt')
    if (await tutorial.isVisible()) {
      await tutorial.getByRole('button', { name: 'Skip' }).click()
      await expect(tutorial).toBeHidden()
    }

    // Forming a QA group correctly triggers the real one-time alliance
    // onboarding prompt. Dismiss it through its own player-facing button
    // before interacting with the roster; never force-click through a modal.
    for (let index = 0; index < 4; index += 1) {
      const prompt = page.locator('.season-tutorial-prompt')
      if (!(await prompt.isVisible())) break
      await prompt.getByRole('button', { name: 'Got it' }).click()
      await expect(prompt).toBeHidden()
    }

    const targetCard = social
      .locator('[aria-label="Player roster"]')
      .getByRole('button')
      .filter({ hasText: nemesis.name })
      .first()
    await targetCard.click()
    // Selecting a player intentionally replaces the roster with a detail card;
    // the old roster button is removed from the DOM rather than left pressed.
    await expect(social.getByRole('heading', { name: nemesis.name })).toBeVisible()
    // The detailed card exposes a dedicated accessible Nemesis indicator. A
    // hidden duplicate label elsewhere in the panel must not shadow it.
    await expect(social.locator('[aria-label="Nemesis relationship"]')).toBeVisible()
    await captureActualScreen(page, testInfo, '03-real-social-nemesis-relationship.png')

    await social.getByRole('tab', { name: 'Strategy' }).click()
    const questionCard = social
      .locator('[aria-label="Action grid"]')
      .getByRole('button', { name: /Why Betray Me\?/ })
    await expect(questionCard).toBeVisible()
    await questionCard.scrollIntoViewIfNeeded()
    await captureActualScreen(page, testInfo, '04-real-social-why-betray-me-card.png')

    const energyBefore = (await readAppState(page)).social.energyBank[human.id]
    await questionCard.click()
    await social.getByRole('button', { name: 'Execute' }).click()
    await expect
      .poll(async () =>
        (await readAppState(page)).social.reality.events.some(
          (event) => event.actionId === 'ask_nemesis_reason'
        )
      )
      .toBe(true)
    const after = await readAppState(page)
    const answer = after.social.reality.events.find(
      (event) => event.actionId === 'ask_nemesis_reason'
    )
    if (!answer) throw new Error('The game did not persist the Nemesis answer')
    expect(after.social.energyBank[human.id]).toBe(energyBefore - 1)
    await expect(social.getByText(answer.reason, { exact: false }).first()).toBeVisible()
    await captureActualScreen(page, testInfo, '05-real-social-private-nemesis-answer.png')
  })
})
