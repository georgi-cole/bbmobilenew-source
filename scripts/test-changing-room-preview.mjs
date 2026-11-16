import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const folder = path.resolve('artifacts/changing-room-preview')
await mkdir(folder, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 940 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
const reports = []
async function check(name, test) {
  await test()
  reports.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
function assert(value, message) {
  if (!value) throw new Error(message)
}
try {
  await page.goto(pathToFileURL(path.join(folder, 'changing-room-test.html')).href)
  await page.getByRole('img', { name: 'Look 6' }).waitFor()
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0)
  )
  await check('All 35 real looks remain browsable', async () => {
    for (let i = 0; i < 35; i++) {
      const number = ((5 + i) % 35) + 1
      await page.getByRole('img', { name: `Look ${number}`, exact: true }).waitFor()
      await page.getByRole('button', { name: 'Next look', exact: true }).click()
    }
    await page.getByRole('img', { name: 'Look 6', exact: true }).waitFor()
  })
  await page.screenshot({ path: path.join(folder, '01-changing-room.png') })
  await check('Eyeros badge opens the market without spending', async () => {
    await page.getByRole('button', { name: 'Open look market for 30,000 Eyeros' }).click()
    await page.getByRole('dialog', { name: 'Look 6' }).waitFor()
    assert(
      (await page.getByTestId('demo-balance').textContent()) === '45,000 Eyeros',
      'Opening market spent currency'
    )
  })
  await page.screenshot({ path: path.join(folder, '02-eyeros-market.png') })
  await check('Purchase spends exactly 30,000 once, then becomes owned', async () => {
    await page.getByRole('button', { name: 'Unlock for 30,000 Eyeros' }).click()
    await page.getByText('This look is yours.').waitFor()
    assert(
      (await page.getByTestId('demo-balance').textContent()) === '15,000 Eyeros',
      'Wrong wallet debit'
    )
    await page.getByRole('button', { name: 'Back to changing room' }).click()
    await page.getByRole('button', { name: 'Use this look' }).waitFor()
    assert(
      (await page.getByRole('button', { name: 'Open look market for 30,000 Eyeros' }).count()) ===
        0,
      'Owned look still purchasable'
    )
  })
  await check('Insufficient balance disables purchase', async () => {
    await page.getByRole('button', { name: 'Low balance', exact: true }).click()
    await page.getByRole('button', { name: 'Open look market for 30,000 Eyeros' }).click()
    assert(
      await page.getByRole('button', { name: 'Unlock for 30,000 Eyeros' }).isDisabled(),
      'Purchase should be disabled'
    )
    await page.getByText(/18,000 more Eyeros/).waitFor()
    await page.keyboard.press('Escape')
    assert((await page.getByRole('dialog').count()) === 0, 'Escape failed')
    assert(
      await page
        .getByRole('button', { name: 'Open look market for 30,000 Eyeros' })
        .evaluate((element) => element === document.activeElement),
      'Focus not restored'
    )
  })
  await check('VIP badge opens VIP option, demo unlocks all without spending', async () => {
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
    await page.getByRole('button', { name: 'Open VIP market for all looks' }).click()
    await page.getByRole('button', { name: 'Activate demo VIP' }).waitFor()
    await page.screenshot({ path: path.join(folder, '03-vip-market.png') })
    await page.getByRole('button', { name: 'Activate demo VIP' }).click()
    await page.getByText('Already unlocked.').waitFor()
    assert(
      (await page.getByTestId('demo-balance').textContent()) === '45,000 Eyeros',
      'VIP spent Eyeros'
    )
    await page.getByRole('button', { name: 'Back to changing room' }).click()
    await page.getByRole('button', { name: 'Next look' }).click()
    await page.getByRole('button', { name: 'Use this look' }).waitFor()
  })
  await check('First free look needs no market', async () => {
    await page.getByRole('button', { name: 'Free', exact: true }).click()
    await page.getByText('Free look', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Use this look' }).waitFor()
  })
  await check('Mobile and narrow layout: readable, no horizontal overflow', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
      await page.locator('.room-preview__device').scrollIntoViewIfNeeded()
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Horizontal overflow at ${width}`
      )
      if (width === 390) await page.screenshot({ path: path.join(folder, '04-mobile-room.png') })
      await page.getByRole('button', { name: 'Open look market for 30,000 Eyeros' }).click()
      const bounds = await page.getByRole('dialog').boundingBox()
      assert(
        bounds &&
          bounds.x >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= 844,
        `Market outside ${width}px viewport`
      )
      if (width === 390) await page.screenshot({ path: path.join(folder, '05-mobile-market.png') })
      await page.getByRole('button', { name: 'Close market' }).click()
    }
  })
  assert(errors.length === 0, errors.join('\n'))
  await writeFile(
    path.join(folder, 'test-results.json'),
    JSON.stringify({ passed: true, reports, errors }, null, 2)
  )
} catch (error) {
  await page.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true })
  await writeFile(
    path.join(folder, 'test-results.json'),
    JSON.stringify({ passed: false, reports, errors, failure: String(error) }, null, 2)
  )
  throw error
} finally {
  await browser.close()
}
