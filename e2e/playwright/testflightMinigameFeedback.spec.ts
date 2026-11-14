import { closeDebugPanelIfOpen, expect, test } from './support/test'
import { generateSecretCode } from '../../src/components/CodeBreakerComp/codeBreakerLogic'
import { createVaultCrackerLayout } from '../../src/minigames/vaultCracker/engine/layout'

for (const premium of [false, true]) {
  test(`Crystal Path hint and wrong-tile feedback survive theme premium=${premium}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(
      `./#/minigame-lab?game=crystal_path_shattered&seed=424242&players=8&skipRules=1&skipCountdown=1&showLab=1${premium ? '&vipPreview=1' : ''}`
    )
    await closeDebugPanelIfOpen(page)
    await page.addStyleTag({
      content:
        '.minigame-lab__panel,.dbg-fab { visibility:hidden !important; pointer-events:none !important; }',
    })
    const row = page.locator('.cps-row.is-current').first()
    const ordinary = await row.locator('.cps-tile-left').evaluate((node) => ({
      background: getComputedStyle(node).backgroundImage,
      border: getComputedStyle(node).borderColor,
    }))
    const hint = page.getByRole('button', { name: /Use hint/ })
    await hint.click()
    const hinted = row.locator('.is-hinted')
    await expect(hinted.locator('.cps-hint-marker')).toBeVisible()
    const highlighted = await hinted.evaluate((node) => ({
      background: getComputedStyle(node).backgroundImage,
      border: getComputedStyle(node).borderColor,
    }))
    expect(highlighted.background).not.toBe(ordinary.background)
    expect(highlighted.border).not.toBe(ordinary.border)
    const remaining = await hint.getAttribute('aria-label')
    await hint.click()
    await expect(hint).toHaveAttribute('aria-label', remaining!)
    const wrong = row.locator('.cps-tile:not(.is-hinted):not(.cps-tile-center)').first()
    await wrong.click()
    await expect(wrong.locator('.cps-fracture')).toBeVisible()
    await expect(page.locator('.cps-hint-marker')).toHaveCount(0)
    await expect
      .poll(() => wrong.evaluate((node) => Number(getComputedStyle(node, '::after').opacity)))
      .toBeGreaterThan(0.5)
    const scar = await wrong.evaluate((node) => ({
      opacity: getComputedStyle(node, '::after').opacity,
      background: getComputedStyle(node, '::after').backgroundImage,
    }))
    expect(Number(scar.opacity)).toBeGreaterThan(0.5)
    expect(scar.background).toContain('linear-gradient')
  })
}

for (const width of [320, 375, 390]) {
  test(`Vault attempt feedback stays alongside its guess at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const seed = 424242
    await page.goto(
      `./#/minigame-lab?game=logicLocks&seed=${seed}&players=8&skipRules=1&skipCountdown=1&showLab=1`
    )
    await closeDebugPanelIfOpen(page)
    await page.addStyleTag({
      content:
        '.minigame-lab__panel,.dbg-fab { visibility:hidden !important; pointer-events:none !important; }',
    })
    const canvas = page.getByTestId('vault-cracker-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    const layout = createVaultCrackerLayout(box.width, box.height, 1)
    const secret = generateSecretCode(seed)
    const current = [0, 0, 0, 0]
    for (let attempt = 0; attempt < 3; attempt++) {
      const guess = secret.map((digit, index) => (digit + (index <= attempt ? 1 : 0)) % 10)
      for (let index = 0; index < 4; index++) {
        const slot = layout.dialSlots[index]!
        for (let step = 0; step < (guess[index]! - current[index]! + 10) % 10; step++) {
          await page.mouse.click(box.x + slot.centerX, box.y + slot.y + slot.height * 0.25)
        }
        current[index] = guess[index]!
      }
      await page.mouse.click(
        box.x + layout.submitRect.x + layout.submitRect.width / 2,
        box.y + layout.submitRect.y + layout.submitRect.height / 2
      )
      await expect(page.locator('.cb__guess-row')).toHaveCount(attempt + 1)
    }
    for (const row of await page.locator('.cb__guess-row').all()) {
      await row.scrollIntoViewIfNeeded()
      const outer = (await row.boundingBox())!
      const main = (await row.locator('.cb__guess-main').boundingBox())!
      const feedback = (await row.locator('.cb__guess-feedback').boundingBox())!
      expect(main.x + main.width + 6).toBeLessThanOrEqual(feedback.x)
      expect(feedback.x + feedback.width).toBeLessThanOrEqual(outer.x + outer.width)
      expect(Math.abs(feedback.y + feedback.height / 2 - outer.y - outer.height / 2)).toBeLessThan(
        3
      )
      await expect(row.locator('.cb__pip')).toHaveCount(4)
    }
  })
}
