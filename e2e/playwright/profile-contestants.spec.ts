import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
} from './support/test'

test('a season retains its chosen contestant after player edits and reload @core-journey @mobile', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.addInitScript(() => {
    if (!localStorage.getItem('bbmobilenew:profiles:v1')) {
      localStorage.setItem(
        'bbmobilenew:profiles:v1',
        JSON.stringify({
          profiles: [
            {
              id: 'contestant-owner',
              name: 'Maya',
              appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
              avatar: '🧑',
              bio: { age: '41', sex: 'Female', location: 'Sofia' },
              createdAt: '2026-10-27',
              eyeoleans: 900,
            },
          ],
          activeProfileId: 'contestant-owner',
          isGuest: false,
        })
      )
    }
    localStorage.setItem('bbmobilenew_season_tutorial_v1:contestant-owner', 'done')
  })
  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 60000 })
  await dismissPermissionPromptIfPresent(page)
  await closeDebugPanelIfOpen(page)
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: 'Play menu' })
    .getByRole('button', { name: 'Classic', exact: true })
    .click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 30000,
  })
  const started = await readAppState(page)
  const runId = started.game.runId ?? started.game.gameId
  expect(started.game.players.find((player) => player.isUser)).toMatchObject({
    name: 'Maya',
    age: 41,
    sex: 'Female',
  })
  expect(started.profiles.profiles[0]).toMatchObject({
    name: 'Maya',
    eyeoleans: 900,
    bio: { age: '41', sex: 'Female', location: 'Sofia' },
  })
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^home$/i })
    .click()
  await page
    .getByRole('dialog', { name: 'Save and return home?' })
    .getByRole('button', { name: 'Save & Home' })
    .click()
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 60000 })
  // Existing links recover to the designed Play menu, never the removed form.
  await page.goto('./#/new-season?mode=classic', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Play menu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose your contestant' })).toHaveCount(0)
  await page.goto('./#/profile-edit', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Age', { exact: true }).fill('55')
  await page.getByLabel('Display Name', { exact: true }).fill('Jordan')
  await page.getByLabel('Sex (Reality storylines)', { exact: true }).selectOption('Male')
  await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
  await page.goto('./#/profile/dressing-room', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Next look', exact: true }).click()
  await page.getByRole('button', { name: 'Use this look', exact: true }).click()
  const reveal = page.getByRole('dialog', { name: 'Jordan', exact: true })
  await expect(reveal).toBeVisible()
  const skip = reveal.getByRole('button', { name: 'Skip reveal', exact: true })
  if (await skip.isVisible()) await skip.click()
  await reveal.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.goto('./', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 60000 })
  await closeDebugPanelIfOpen(page)
  await page
    .getByRole('navigation', { name: 'Main menu' })
    .getByRole('button', { name: 'Play', exact: true })
    .click()
  await page.getByRole('button', { name: 'Continue Last', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({
    timeout: 30000,
  })
  const resumed = await readAppState(page)
  expect(resumed.game.runId ?? resumed.game.gameId).toBe(runId)
  expect(resumed.game.players.find((player) => player.isUser)).toMatchObject({
    name: 'Maya',
    age: 41,
    sex: 'Female',
  })
  expect(resumed.game.seasonContestant).toMatchObject({
    appearanceSelection: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
    bio: { age: '41', location: 'Sofia' },
  })
  expect(resumed.profiles.profiles[0]).toMatchObject({
    name: 'Jordan',
    bio: { age: '55', sex: 'Male' },
    appearanceSelection: { kind: 'catalog', lookId: 'pc-003', revision: 1 },
  })
  expect(resumed.game.players.find((player) => player.isUser)?.appearance).toEqual({
    kind: 'catalog',
    lookId: 'pc-002',
    revision: 1,
  })
  await page.screenshot({
    path: 'artifacts/profile-performance/direct-season-mobile.png',
    fullPage: true,
  })
})

test('legacy five-profile installs remain usable while new creation is capped at three @mobile', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.addInitScript(() => {
    localStorage.setItem(
      'bbmobilenew:profiles:v1',
      JSON.stringify({
        profiles: Array.from({ length: 5 }, (_, index) => ({
          id: `legacy-${index}`,
          name: `Legacy player ${index + 1}`,
          avatar: '🧑',
          createdAt: '2026-10-27',
          bio: { age: '28' },
        })),
        activeProfileId: 'legacy-4',
        isGuest: false,
      })
    )
  })
  await page.goto('./#/profile-picker', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Profiles/ })).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('main').getByText('Legacy player 5', { exact: true })).toBeVisible()
  await expect(page.getByText(/Up to 3 player profiles/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Create New Profile/ })).toHaveCount(0)
  expect((await readAppState(page)).profiles.profiles).toHaveLength(5)
})
