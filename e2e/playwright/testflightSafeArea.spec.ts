import { closeDebugPanelIfOpen, expect, test } from './support/test'
import { mkdir } from 'node:fs/promises'

const viewports = [
  { name: 'portrait cutout', width: 390, height: 844, top: 59, right: 0, bottom: 34, left: 0 },
  { name: 'landscape cutout', width: 844, height: 390, top: 0, right: 59, bottom: 21, left: 59 },
  { name: 'no cutout', width: 390, height: 844, top: 0, right: 0, bottom: 0, left: 0 },
]

for (const game of ['famousFigures', 'quickTap', 'logicLocks']) {
  for (const viewport of viewports) {
    test(`${game} keeps its viewport clear of the ${viewport.name} @smoke @core-journey`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(
        `./#/minigame-lab?game=${game}&seed=424242&players=8&skipRules=1&skipCountdown=1&showLab=1&freeze=1`
      )
      await closeDebugPanelIfOpen(page)
      await page.addStyleTag({
        content: `
          :root {
            --safe-area-inset-top: ${viewport.top}px;
            --safe-area-inset-right: ${viewport.right}px;
            --safe-area-inset-bottom: ${viewport.bottom}px;
            --safe-area-inset-left: ${viewport.left}px;
          }
          .minigame-lab__panel, .dbg-fab { visibility: hidden !important; }
        `,
      })
      const host = page.locator('.minigame-host')
      await expect(host).toBeVisible()
      const shellBox = (await page.locator('.app-shell').boundingBox())!
      const gameBox = (await host.boundingBox())!
      expect(gameBox.y).toBeCloseTo(shellBox.y + viewport.top, 0)
      expect(gameBox.x).toBeCloseTo(shellBox.x + viewport.left, 0)
      expect(gameBox.x + gameBox.width).toBeCloseTo(shellBox.x + shellBox.width - viewport.right, 0)
      expect(gameBox.y + gameBox.height).toBeCloseTo(
        shellBox.y + shellBox.height - viewport.bottom,
        0
      )

      // The real game's root must resize to the safe viewport rather than retain
      // a full-window height whose bottom controls would be clipped.
      const playing = host.locator('.minigame-host-playing')
      await expect(playing).toBeVisible()
      const gameRoot = playing.locator(
        game === 'famousFigures' ? '.ff-container' : game === 'quickTap' ? '.qtr-canvas' : '.cb'
      )
      await expect(gameRoot).toBeVisible()
      const contentBox = (await gameRoot.boundingBox())!
      expect(contentBox.y).toBeGreaterThanOrEqual(gameBox.y - 1)
      expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(gameBox.y + gameBox.height + 1)
      const menu = page.getByRole('button', { name: 'Open minigame menu', exact: true })
      await expect(menu).toBeVisible()
      const menuBox = (await menu.boundingBox())!
      expect(menuBox.y).toBeGreaterThanOrEqual(viewport.top - 1)
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width - viewport.right + 1)
      await mkdir('visual-evidence/followups', { recursive: true })
      await page.screenshot({
        path: `visual-evidence/followups/${game}-${viewport.name.replaceAll(' ', '-')}.png`,
      })
    })
  }
}

test('VIP description omits retired themes @smoke @core-journey', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#/store')
  await closeDebugPanelIfOpen(page)
  await expect(page.getByText('VIP themes', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Explore VIP', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).not.toContainText('VIP theme')
  await expect(dialog).toContainText('every permanent Store unlock and cinematic ceremony')
  await mkdir('visual-evidence/followups', { recursive: true })
  await page.screenshot({ path: 'visual-evidence/followups/vip-description.png' })
})
