import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
} from './support/test'

test('guest Day 1 notice guides profile creation and preserves the current season', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('./#/profile-picker')
  await closeDebugPanelIfOpen(page)
  await dismissPermissionPromptIfPresent(page)
  await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByRole('button', { name: 'Guest Mode', exact: true }).click()

  const welcomeTour = page.getByRole('dialog', { name: 'Welcome to The Big Eye' })
  const playButton = page.getByRole('button', { name: 'Advance to next phase' })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const before = await readAppState(page)
    if (before.game.phase === 'loh_comp_announcement' && before.game.week === 1) break

    if (await welcomeTour.isVisible()) {
      await welcomeTour.getByRole('button', { name: 'Skip', exact: true }).click()
      continue
    }

    await expect(playButton).toBeEnabled()
    await playButton.click()
    await expect
      .poll(async () => {
        const after = await readAppState(page)
        return (
          after.game.phase !== before.game.phase ||
          after.game.broadcastQueue?.[0] !== before.game.broadcastQueue?.[0] ||
          (await welcomeTour.isVisible())
        )
      })
      .toBe(true)
  }

  const initialSeason = await readAppState(page)
  expect(initialSeason.profiles.isGuest).toBe(true)
  expect(initialSeason.game.phase).toBe('loh_comp_announcement')
  expect(initialSeason.game.week).toBe(1)

  const reminder = page.getByRole('status', { name: 'Guest mode save reminder' })
  await expect(reminder).toBeVisible()
  await expect(reminder).toContainText(
    'You’re playing as a guest, so your progress won’t be saved.'
  )
  await expect(reminder).toContainText('Create a profile from More to save your season.')
  await page.screenshot({ path: 'test-results/guest-save-reminder-preview.png' })
  await expect(page.locator('.tv-zone__phase-chip')).toHaveAttribute('aria-label', 'HOUSE UPDATE')
  await expect(page.getByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeHidden()

  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  const moreButton = mainNavigation.getByRole('button', { name: 'More', exact: true })
  await expect(moreButton).toHaveAttribute('data-guest-save-step', 'more')
  await moreButton.click()

  const moreMenu = page.getByRole('menu', { name: 'More destinations' })
  const profileMenuItem = moreMenu.getByRole('menuitem', { name: 'Profile', exact: true })
  await expect(profileMenuItem).toHaveAttribute('data-guest-save-step', 'profile')
  await profileMenuItem.click()

  await expect(page.getByRole('button', { name: 'Create Profile', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()
  await expect(page.getByText('New Profile', { exact: true })).toBeVisible()

  await page.getByPlaceholder('Enter display name').fill('Season Saver')
  await page.getByLabel('Age').fill('28')
  await page.getByLabel('Sex (Reality storylines)').selectOption('Other')

  const beforeCreate = await readAppState(page)
  await page.getByRole('button', { name: 'Create Profile', exact: true }).click()

  await expect(page).toHaveURL(/#\/game$/)
  await expect
    .poll(async () => {
      const after = await readAppState(page)
      return {
        isGuest: after.profiles.isGuest,
        profileName: after.profiles.profiles.find(
          (profile) => profile.id === after.profiles.activeProfileId
        )?.name,
        sex: after.profiles.profiles.find(
          (profile) => profile.id === after.profiles.activeProfileId
        )?.bio?.sex,
        gameId: after.game.gameId,
        runId: after.game.runId,
        week: after.game.week,
        phase: after.game.phase,
      }
    })
    .toEqual({
      isGuest: false,
      profileName: 'Season Saver',
      sex: 'Other',
      gameId: beforeCreate.game.gameId,
      runId: beforeCreate.game.runId,
      week: beforeCreate.game.week,
      phase: beforeCreate.game.phase,
    })

  await expect(reminder).toBeHidden()
  await expect(page.getByRole('dialog', { name: /Announcement: LOH Competition/i })).toBeVisible()

  await page.reload()
  await page.goto('./#/')
  await closeDebugPanelIfOpen(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const continueLast = page.getByRole('navigation', { name: 'Play menu' }).getByRole('button', {
    name: 'Continue Last',
    exact: true,
  })
  await expect(continueLast).toBeVisible()
  await continueLast.click()
  await expect(page).toHaveURL(/#\/game$/)

  await expect
    .poll(async () => {
      const afterReload = await readAppState(page)
      return {
        profileName: afterReload.profiles.profiles.find(
          (profile) => profile.id === afterReload.profiles.activeProfileId
        )?.name,
        gameId: afterReload.game.gameId,
        runId: afterReload.game.runId,
        week: afterReload.game.week,
        phase: afterReload.game.phase,
      }
    })
    .toEqual({
      profileName: 'Season Saver',
      gameId: beforeCreate.game.gameId,
      runId: beforeCreate.game.runId,
      week: beforeCreate.game.week,
      phase: beforeCreate.game.phase,
    })
})
