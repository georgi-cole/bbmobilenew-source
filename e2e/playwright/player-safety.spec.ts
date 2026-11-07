// Import the base fixture: these journeys must not receive the adult season seed.
import { expect, test } from '@playwright/test'

test.setTimeout(90_000)
test.beforeEach(async ({ page }) => {
  // Isolate the age journeys from third-party font latency and the optional dev API.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' })
  )
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'font/woff2' })
  )
  await page.route('**/api/live-config', (route) =>
    route.fulfill({ body: '{}', contentType: 'application/json' })
  )
})

test('under-13 admission remains locked through refresh, Back, and direct game/store URLs', async ({
  page,
}, testInfo) => {
  const personalRequests: string[] = []
  page.on('request', (request) => {
    if (/open-meteo|vip-confessional|api\/challenges|api\/seasons|measure/.test(request.url()))
      personalRequests.push(request.url())
  })
  await page.goto('./#/game')
  await expect(page.getByRole('heading', { name: 'Before you play' })).toBeVisible()
  await page.getByLabel('Your age', { exact: true }).fill('11')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'For parents and guardians' })).toBeVisible()
  await page.getByRole('button', { name: /Check parent verification/ }).click()
  await expect(page.getByRole('status')).toContainText('Play remains locked')
  await page.screenshot({
    path: testInfo.outputPath('parent-verification-unavailable.png'),
    fullPage: true,
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'For parents and guardians' })).toBeVisible()
  await page.goto('./#/store')
  await expect(page.getByRole('heading', { name: 'For parents and guardians' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'For parents and guardians' })).toBeVisible()
  expect(personalRequests).toEqual([])
  await expect(page.getByLabel('Your age', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('guest entry asks who is playing and cannot bypass the younger-age decision', async ({
  page,
}, testInfo) => {
  await page.goto('./#/profile-picker')
  await page.getByLabel('Your age', { exact: true }).fill('28')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: /Continue as Guest/ }).click()
  await expect(page.getByRole('dialog', { name: 'Who is playing?' })).toBeVisible()
  await page.getByLabel('Player age', { exact: true }).fill('12')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'For parents and guardians' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('guest-child-locked.png'), fullPage: true })
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('bbmobilenew:player-safety:v1')!).ageBand
    )
  ).toBe('under13')
})

test('adults start with optional features off and can withdraw each choice', async ({
  page,
}, testInfo) => {
  await page.goto('./#/player-privacy')
  await page.getByLabel('Your age', { exact: true }).fill('28')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Player privacy & family' })).toBeVisible()
  for (const checkbox of await page.getByRole('checkbox').all())
    await expect(checkbox).not.toBeChecked()
  await page.getByRole('checkbox', { name: /Weather from my location/ }).check()
  await page.getByRole('checkbox', { name: /Weather from my location/ }).uncheck()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Weather from my location/ })).not.toBeChecked()
  await page.screenshot({ path: testInfo.outputPath('adult-privacy-choices.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
