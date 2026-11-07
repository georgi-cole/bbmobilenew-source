import fs from 'node:fs/promises'
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const isPlayer = process.argv.includes('--player'),
  base = isPlayer ? 'player_characters' : 'ai_characters',
  firstName = isPlayer ? 'Character 1' : 'Aria',
  firstId = isPlayer ? 'character-1' : 'aria',
  count = isPlayer ? 27 : 28
const report = {
  url: 'http://127.0.0.1:' + (isPlayer ? 4321 : 4320) + '/',
  characters: [],
  layouts: [],
  pageErrors: [],
}
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
  page.on('pageerror', (e) => report.pageErrors.push(e.message))
  await page.goto(report.url)
  await page.locator('#name').filter({ hasText: firstName }).waitFor()
  const choices = await page
    .locator('#character option')
    .evaluateAll((nodes) => nodes.map((n) => ({ id: n.value, name: n.textContent })))
  if (choices.length !== count) throw new Error('Expected ' + count + ' character choices')
  for (const c of choices) {
    await page.selectOption('#character', c.id)
    await page.waitForFunction(
      (name) => document.querySelector('#name').textContent === name,
      c.name
    )
    await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#grid img,#portrait')]
      for (const img of imgs) img.loading = 'eager'
      await Promise.all(imgs.map((img) => img.decode()))
    })
    const state = await page.evaluate(() => ({
      coverage: document.querySelector('#coverage').textContent,
      cards: document.querySelectorAll('.card').length,
      broken: [...document.querySelectorAll('#grid img,#portrait')].filter(
        (img) => !img.complete || !img.naturalWidth
      ).length,
    }))
    report.characters.push({ id: c.id, ...state })
    if (state.cards !== 6 || state.broken) throw new Error('Broken gallery ' + c.id)
    if (!process.argv.includes('--allow-incomplete') && state.coverage !== '6 / 6')
      throw new Error('Incomplete pack ' + c.id)
  }
  await page.selectOption('#character', firstId)
  await page.waitForFunction(
    (name) => document.querySelector('#name').textContent === name,
    firstName
  )
  for (const width of [390, 1200]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.selectOption('#background', width === 390 ? 'light' : '')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    report.layouts.push({ width, overflow })
    if (overflow) throw new Error('Horizontal overflow ' + width)
    await page.screenshot({
      path: base + '/_production/reviews/gallery-' + width + '.png',
      fullPage: true,
    })
  }
  await page.selectOption('#throne', 'no')
  await page.waitForFunction(() => !document.querySelector('.throne'))
  await page.selectOption('#throne', 'yes')
  await page.waitForFunction(() => !!document.querySelector('.throne'))
  if (report.pageErrors.length) throw new Error('Gallery page errors')
  report.passed = true
} finally {
  await browser.close()
  await fs.writeFile(
    base + '/_production/gallery-validation.json',
    JSON.stringify(report, null, 2) + '\n'
  )
  console.log(JSON.stringify(report, null, 2))
}
