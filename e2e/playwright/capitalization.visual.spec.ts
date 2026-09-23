import { closeDebugPanelIfOpen, expect, test } from './support/test'

test('captures the premium Capitalization flow @core-journey', async ({ page }, testInfo) => {
  await page.goto(
    './#/minigame-lab?game=capitalization&seed=424242&players=3&skipRules=1&skipCountdown=1&context=battleBack'
  )

  await closeDebugPanelIfOpen(page)
  await page.getByRole('button', { name: 'Minimize minigame lab' }).click()
  await page.locator('.minigame-lab__restore').evaluate((element) => {
    ;(element as HTMLElement).style.display = 'none'
  })

  const root = page.getByTestId('capitalization-root')
  await expect(root).toBeVisible()
  await page.getByRole('button', { name: 'Start Back 2 the Game' }).click()

  // Capture the real rendered minigame surface while the premium globe is active.
  await page.waitForTimeout(450)
  await root.screenshot({
    path: testInfo.outputPath('capitalization-premium-globe.png'),
  })

  // The real component moves from globe selection into the capital question after 2.6s.
  await page.waitForTimeout(2400)
  await expect(page.getByLabel('Capital city answer')).toBeVisible()
  await root.screenshot({
    path: testInfo.outputPath('capitalization-premium-question.png'),
  })

  // Advance through the first continent to capture the real in-game standings surface.
  for (let question = 1; question <= 3; question += 1) {
    await page.getByRole('button', { name: 'Skip', exact: true }).click()

    if (question < 3) {
      await expect(page.getByLabel('Answer result')).toBeVisible()
      await page.getByLabel('Answer result').getByRole('button', { name: 'Continue' }).click()
      await page.waitForTimeout(2700)
      await expect(page.getByLabel('Capital city answer')).toBeVisible()
    }
  }

  await expect(page.getByLabel('Round standings')).toBeVisible()
  await expect(page.getByText(/All contestants remain in play/i)).toBeVisible()
  await expect(page.getByText(/3 alive/i)).toBeVisible()
  await root.screenshot({
    path: testInfo.outputPath('capitalization-premium-standings.png'),
  })
})
