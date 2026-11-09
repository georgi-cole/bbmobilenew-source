import { expect, test } from './support/test'

test.use({ showWeatherPrompt: true })

test('first launch keeps the hub fixed and opens Players and Credits @mobile', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    window.name = 'phone-preview:iphone'
    Object.defineProperty(navigator, 'permissions', {
      value: { query: async () => ({ state: 'prompt' }) },
    })
  })
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('./')

  const home = page.getByRole('navigation', { name: 'Main menu' })
  const weather = page.getByRole('dialog', { name: 'Local weather' })
  await expect(weather).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('kolequant-splash')).toHaveCount(0)
  await expect(home).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Players', exact: true })).toBeHidden()
  await weather.getByRole('button', { name: 'Not now' }).click()
  await expect(home).toBeVisible()

  await page.setViewportSize({ width: 320, height: 568 })
  const scroll = await home.evaluate((menu) => {
    const main = menu.closest('.app-shell__main')!
    window.scrollTo(0, innerHeight)
    main.scrollTop = main.scrollHeight
    menu.scrollTop = menu.scrollHeight
    return { window: window.scrollY, main: main.scrollTop, menu: menu.scrollTop }
  })
  expect(scroll).toEqual({ window: 0, main: 0, menu: 0 })
  await expect(home.getByRole('button', { name: 'Credits', exact: true })).toBeInViewport()
  await home.getByRole('button', { name: 'Play', exact: true }).click()
  const modes = page.getByRole('navigation', { name: 'Play menu' })
  await expect(modes.getByRole('button', { name: 'Classic', exact: true })).toBeInViewport()
  await modes.getByRole('button', { name: 'Back', exact: true }).click()

  await page.setViewportSize({ width: 393, height: 852 })
  await page.getByRole('button', { name: 'Players', exact: true }).click()
  const players = page.locator('#houseguestsModal')
  const backToHub = players.getByRole('button', { name: 'Back to Intro Hub' })
  await expect(backToHub).toHaveClass(/game-back-button/)
  await players.getByRole('button', { name: 'View Finn Lund' }).click()
  const backToList = players.getByRole('button', { name: 'Back to Players' })
  await expect(backToHub).toHaveClass(/game-back-button/)
  await expect(backToList).toHaveClass(/game-back-button/)
  await backToList.click()
  await expect(players.getByRole('heading', { name: 'Players', exact: true })).toBeVisible()
  await backToHub.click()
  await expect(players).toBeHidden()

  await home.getByRole('button', { name: 'Credits', exact: true }).click()
  await expect(page.locator('.credits-container')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  const frame = await page.locator('.credits-media').boundingBox()
  expect(frame).not.toBeNull()
  expect(frame!.width / frame!.height).toBeCloseTo(9 / 16, 2)
  expect(frame!.y).toBeGreaterThan(0)
})

test('profile fields scroll below the status bar with Save reachable @mobile', async ({ page }) => {
  await page.addInitScript(() => {
    window.name = 'phone-preview:iphone'
    localStorage.setItem(
      'bbmobilenew:profiles:v1',
      JSON.stringify({
        profiles: [
          {
            id: 'profile-scroll',
            name: 'Morgan',
            avatar: '🧑',
            createdAt: '2026-11-09',
            bio: { age: '30', location: 'Sofia', sex: 'Other' },
          },
        ],
        activeProfileId: 'profile-scroll',
        isGuest: false,
      })
    )
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./#/profile-edit')
  await expect(page.getByLabel('Display Name')).toHaveValue('Morgan')

  const scroll = await page.locator('.app-shell__main').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    const root = getComputedStyle(document.documentElement)
    return {
      formTop: element.getBoundingClientRect().top,
      safeTop: Number.parseFloat(root.getPropertyValue('--safe-area-inset-top')),
      formScroll: element.scrollTop,
      windowScroll: window.scrollY,
    }
  })
  expect(scroll.formScroll).toBeGreaterThan(0)
  expect(scroll.safeTop).toBeGreaterThan(0)
  expect(scroll.formTop).toBeGreaterThanOrEqual(scroll.safeTop)
  expect(scroll.windowScroll).toBe(0)
  await expect(page.getByRole('button', { name: 'Save Profile' })).toBeInViewport({ ratio: 1 })
})
