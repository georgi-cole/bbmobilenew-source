import {
  dismissPermissionPromptIfPresent,
  expect,
  readAppState,
  test,
  type Locator,
} from './support/test'
import { openProfileCreationForm } from './support/profile'

async function expectSafeControls(scope: Locator): Promise<void> {
  await expect
    .poll(() =>
      scope.evaluate((element) => {
        const root = getComputedStyle(document.documentElement)
        const top = Number.parseFloat(root.getPropertyValue('--safe-area-inset-top')) || 0
        const bottom = Number.parseFloat(root.getPropertyValue('--safe-area-inset-bottom')) || 0
        return [...element.querySelectorAll('button')].flatMap((button) => {
          const rect = button.getBoundingClientRect()
          if (button.disabled || rect.width === 0 || rect.height === 0) return []
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          const safe =
            rect.left >= -1 &&
            rect.right <= innerWidth + 1 &&
            rect.top >= top - 1 &&
            rect.bottom <= innerHeight - bottom + 1
          const tappable = hit === button || (hit !== null && button.contains(hit))
          return safe && tappable
            ? []
            : [{ label: button.getAttribute('aria-label') || button.textContent, safe, tappable }]
        })
      })
    )
    .toEqual([])
}

for (const platform of ['iphone', 'android'] as const) {
  test(`${platform} installed display keeps controls clear through resize and resume @smoke @mobile`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await page.addInitScript((phone) => {
      window.name = `phone-preview:${phone}`
    }, platform)
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('./')
    const home = page.getByRole('navigation', { name: 'Main menu' })
    await expect(home).toBeVisible({ timeout: 60_000 })
    const debugPanel = page.getByRole('complementary', { name: 'Debug Panel' })
    if (await debugPanel.isVisible()) {
      await debugPanel.getByRole('button', { name: 'Close Debug Panel' }).click()
    }
    await dismissPermissionPromptIfPresent(page)
    await openProfileCreationForm(page)
    await page.getByLabel('Display Name').fill(`Display QA ${platform}`)
    await page.getByLabel('Age').fill('28')
    await page.getByLabel('Location', { exact: false }).first().fill('QA Test City')
    await page.getByLabel('Sex (Reality storylines)').selectOption('Male')
    // A short viewport checks form scrolling; native keyboard behavior still
    // needs an installed device because browser resizing does not emulate IME.
    await page.setViewportSize({ width: 320, height: 400 })
    await page.locator('.app-shell__main').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expectSafeControls(page.locator('.edit-profile__actions'))
    await page.getByRole('button', { name: 'Save Profile', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible()
    const profileId = (await readAppState(page)).profiles.activeProfileId
    await page.evaluate((id) => {
      localStorage.setItem(`bbmobilenew_season_tutorial_v1:${id}`, 'done')
    }, profileId)
    await page.setViewportSize({ width: 393, height: 852 })
    await page.getByRole('button', { name: 'Go back', exact: true }).click()
    await home.getByRole('button', { name: 'Play', exact: true }).click()
    await page
      .getByRole('navigation', { name: 'Play menu' })
      .getByRole('button', { name: 'Classic', exact: true })
      .click()
    await expect(page.getByRole('region', { name: 'Game action zone' })).toBeVisible({
      timeout: 60_000,
    })
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation).toBeVisible()

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 393, height: 852 },
      { width: 430, height: 932 },
    ]) {
      await page.setViewportSize(viewport)
      await expectSafeControls(navigation)
      const roster = page.getByRole('region', { name: /HUBMATES \(/ })
      const lastPlayer = roster.getByRole('button').last()
      await lastPlayer.scrollIntoViewIfNeeded()
      await lastPlayer.click({ trial: true })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await navigation.getByRole('button', { name: 'More', exact: true }).click()
      await page
        .getByRole('menu', { name: 'More destinations' })
        .getByRole('menuitem', { name: 'Settings', exact: true })
        .click()
      const main = page.locator('.app-shell__main')
      const scroll = await main.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return { overflow: element.scrollHeight > element.clientHeight, top: element.scrollTop }
      })
      if (scroll.overflow) expect(scroll.top).toBeGreaterThan(0)
      await main.evaluate((element) => {
        element.scrollTop = 0
      })
      await page.getByRole('button', { name: 'Go back', exact: true }).click()
      await expectSafeControls(navigation)
    }

    await page.setViewportSize({ width: 320, height: 568 })
    await navigation.getByRole('button', { name: 'Home', exact: true }).click()
    const save = page.getByRole('dialog', { name: 'Save and return home?' })
    await expect(save).toBeVisible()
    await expectSafeControls(save)
    await save.getByRole('button', { name: 'Save & Home', exact: true }).click()
    await expect(home).toBeVisible()
    await page.reload()
    await expect(home).toBeVisible()
    await dismissPermissionPromptIfPresent(page)
    await home.getByRole('button', { name: 'Play', exact: true }).click()
    await page.getByRole('button', { name: 'Continue Last', exact: true }).click()
    await expectSafeControls(navigation)
    await page.setViewportSize({ width: 852, height: 393 })
    await expect(page.getByRole('heading', { name: 'Rotate your device' })).toBeVisible()
    await page.setViewportSize({ width: 393, height: 852 })
    await expectSafeControls(navigation)
    await navigation.getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'More destinations' })).toBeVisible()
    await page.goto('about:blank')
  })
}
