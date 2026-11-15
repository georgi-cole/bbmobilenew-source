import { closeDebugPanelIfOpen, expect, test } from './support/test'

for (const width of [320, 390]) {
  test(`Color Match results offer a reachable Continue at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
    await page.goto(
      './#/minigame-lab?game=colorMatch&seed=424242&players=8&skipRules=1&skipCountdown=1&showLab=1'
    )
    await closeDebugPanelIfOpen(page)
    await page.addStyleTag({
      content:
        '.minigame-lab__panel,.dbg-fab{visibility:hidden!important;pointer-events:none!important}',
    })
    await expect(page.getByRole('button', { name: 'Submit Match' })).toBeVisible()
    const target = await page
      .locator('.cm__swatch--target')
      .evaluate((element) => getComputedStyle(element).backgroundColor.match(/\d+/g)!.map(Number))
    for (const [index, channel] of ['Red', 'Green', 'Blue'].entries()) {
      await page
        .getByRole('slider', { name: new RegExp(`${channel} channel:`) })
        .press(target[index]! < 128 ? 'End' : 'Home')
    }
    await page.getByRole('button', { name: 'Submit Match' }).click()
    await page.getByRole('button', { name: 'Skip to Results' }).click()
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
    await continueButton.scrollIntoViewIfNeeded()
    await expect(continueButton).toBeInViewport()
    await continueButton.click()
    await expect(page.getByTestId('minigame-lab-completion-count')).toHaveText('1')
  })

  for (const game of ['gatesOfTheEye', 'riskWheel']) {
    test(`${game} bottom controls remain reachable with phone safe insets at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
      await page.goto(
        `./#/minigame-lab?game=${game}&seed=424242&players=8&skipRules=1&skipCountdown=1&showLab=1&vipPreview=1`
      )
      await closeDebugPanelIfOpen(page)
      const root = page.locator(game === 'gatesOfTheEye' ? '.gate-game' : '.rw-root')
      await expect(root).toBeVisible()
      await page.addStyleTag({
        content:
          '.minigame-lab__panel,.dbg-fab{visibility:hidden!important;pointer-events:none!important}',
      })
      await page.locator('.minigame-stage').evaluate((element) => {
        const stage = element as HTMLElement
        stage.style.setProperty('--minigame-window-top', '59px')
        stage.style.setProperty('--minigame-window-bottom', '34px')
      })
      const hostBox = (await page.locator('.minigame-host').boundingBox())!
      const gameBox = (await root.boundingBox())!
      expect(gameBox.y).toBeGreaterThanOrEqual(hostBox.y)
      expect(gameBox.y + gameBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height + 1)
      // Native Safari intersects touch-action along the ancestor chain. Every
      // ancestor up to the scroller must permit the vertical gesture.
      const touchActions = await root.evaluate((element) => {
        const actions: string[] = []
        for (
          let node: Element | null = element;
          node && !node.classList.contains('minigame-stage');
          node = node.parentElement
        ) {
          actions.push(getComputedStyle(node).touchAction)
        }
        return actions
      })
      expect(touchActions).not.toContain('none')
      const bottomControl =
        game === 'gatesOfTheEye'
          ? root.locator('.gate-door-card').last()
          : root.locator('.rw-btn').last()
      await bottomControl.scrollIntoViewIfNeeded()
      await expect(bottomControl).toBeInViewport()
      await expect(bottomControl).toBeEnabled()
    })
  }
}
