import { closeDebugPanelIfOpen, expect, test, type Page } from './support/test'

async function openMajorityRules(page: Page, players: number, animated = false) {
  await page.emulateMedia({ reducedMotion: animated ? 'no-preference' : 'reduce' })
  await page.goto(
    `./#/minigame-lab?game=majorityRules&seed=424242&players=${players}&skipRules=1&skipCountdown=1&showLab=0&vipPreview=1`,
    { waitUntil: 'commit' }
  )
  const shell = page.locator('.majority-rules-shell[data-presentation="vip"]')
  await expect(shell).toBeVisible({ timeout: 30_000 })
  await closeDebugPanelIfOpen(page)
  await page.addStyleTag({ content: '.minigame-lab__restore { display: none !important; }' })
  return shell
}

test('VIP trap doors open and eliminated portraits fall while the names remain', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 740 })
  const shell = await openMajorityRules(page, 12, true)
  await expect(shell).toHaveAttribute('data-phase', 'question', { timeout: 15_000 })
  await shell.locator('.majority-rules-option').first().click()
  await shell.getByRole('button', { name: 'Lock in answer', exact: true }).click()
  await expect(shell).toHaveAttribute('data-phase', 'reveal')
  const traps = shell.getByRole('region', { name: 'Eliminated players' })
  await expect(traps).toHaveAttribute('data-animated', 'true')
  const avatar = traps.locator('.majority-rules-trapdoor__avatar').first()
  await expect
    .poll(() => avatar.evaluate((node) => getComputedStyle(node).opacity), { timeout: 3000 })
    .toBe('0')
  await expect(traps.locator('figcaption').first()).toBeVisible()
  expect(
    await traps
      .locator('.majority-rules-trapdoor__leaf.is-left')
      .first()
      .evaluate((node) => getComputedStyle(node).transform)
  ).not.toBe('none')
})

async function assertPhaseFits(page: Page, actionName: string, requireNoScroll: boolean) {
  const action = page.getByRole('button', { name: actionName, exact: true })
  await expect(action).toBeInViewport({ ratio: 1 })
  const measurements = await page.locator('.majority-rules-card').evaluate((card) => {
    const rect = card.getBoundingClientRect()
    const content = card.querySelector('.majority-rules-phase-content')!
    const blocks = [
      ...content.querySelectorAll<HTMLElement>(
        '.majority-rules-aggregation__row, .majority-rules-reveal-fact, .majority-rules-duel-player'
      ),
    ]
    return {
      right: rect.right,
      viewport: innerWidth,
      cardOverflow: card.scrollWidth - card.clientWidth,
      contentOverflow: content.scrollHeight - content.clientHeight,
      clipped: blocks
        .filter((block) => block.scrollWidth > block.clientWidth + 1)
        .map((block) => block.className),
    }
  })
  expect(measurements.right).toBeLessThanOrEqual(measurements.viewport + 1)
  expect(measurements.cardOverflow).toBeLessThanOrEqual(1)
  expect(measurements.clipped).toEqual([])
  if (requireNoScroll) expect(measurements.contentOverflow).toBeLessThanOrEqual(1)
}

for (const size of [
  { width: 390, height: 740 },
  { width: 320, height: 568 },
]) {
  test.describe(`Majority Rules VIP ${size.width}×${size.height} @minigame`, () => {
    test.use({ viewport: size })

    test('wraps reveal text and keeps Continue fully visible', async ({ page }, testInfo) => {
      const shell = await openMajorityRules(page, 12)
      await expect(shell).toHaveAttribute('data-phase', 'question', { timeout: 15_000 })
      await shell.locator('.majority-rules-option').first().click()
      await shell.getByRole('button', { name: 'Lock in answer', exact: true }).click()
      await expect(shell).toHaveAttribute('data-phase', 'reveal')
      const watch = page.getByRole('button', { name: 'Continue watching', exact: true })
      if (await watch.isVisible()) await watch.click()
      await assertPhaseFits(page, 'Continue', size.height >= 700)
      const labels = shell.locator('.majority-rules-aggregation__label strong')
      expect(
        await labels.evaluateAll((nodes) =>
          nodes.every((node) => getComputedStyle(node).whiteSpace === 'normal')
        )
      ).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('reveal.png') })
    })

    test('fits the final duel and its chosen numbers without scrolling', async ({
      page,
    }, testInfo) => {
      const shell = await openMajorityRules(page, 2)
      await expect(shell).toHaveAttribute('data-phase', 'final_duel_pick', { timeout: 15_000 })
      await expect(shell.locator('.majority-rules-duel-player')).toHaveCount(2)
      await shell.locator('.majority-rules-number-button:enabled').first().click()
      await expect(shell).toHaveAttribute('data-phase', 'final_duel_roll')
      await assertPhaseFits(page, 'Roll die', true)
      await page.screenshot({ path: testInfo.outputPath('duel.png') })
    })
  })
}
