import { generateSecretCode } from '../../src/components/CodeBreakerComp/codeBreakerLogic'
import { createVaultCrackerLayout } from '../../src/minigames/vaultCracker/engine/layout'
import { closeDebugPanelIfOpen, expect, test } from './support/test'

test('Vault Cracker score labels and bands stay aligned in the mobile results rows', async ({
  page,
}) => {
  const seed = 424242
  await page.goto(
    `./#/minigame-lab?game=logicLocks&seed=${seed}&players=8&skipRules=1&skipCountdown=1&showLab=1&testCompetitionContext=loh`,
    { waitUntil: 'commit' }
  )

  await closeDebugPanelIfOpen(page)
  await expect(page.getByTestId('minigame-lab-selected-title')).toHaveText('Vault Cracker')
  await page.addStyleTag({
    content:
      '.minigame-lab__panel { visibility: hidden !important; pointer-events: none !important; }',
  })

  const host = page.getByRole('dialog', { name: /Vault Cracker minigame/i })
  const canvas = host.getByTestId('vault-cracker-canvas')
  await expect(canvas).toBeVisible()
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('Vault Cracker canvas is not laid out.')

  const secretCode = generateSecretCode(seed)
  const layout = createVaultCrackerLayout(canvasBox.width, canvasBox.height, 1)
  for (let index = 0; index < secretCode.length; index += 1) {
    const slot = layout.dialSlots[index]
    if (!slot) throw new Error(`Vault Cracker is missing dial ${index + 1}.`)
    for (let click = 0; click < secretCode[index]!; click += 1) {
      await page.mouse.click(canvasBox.x + slot.centerX, canvasBox.y + slot.y + slot.height * 0.25)
    }
  }

  await page.mouse.click(
    canvasBox.x + layout.submitRect.x + layout.submitRect.width / 2,
    canvasBox.y + layout.submitRect.y + layout.submitRect.height / 2
  )
  await expect(host.getByText(/Vault breached in 1 attempt/i)).toBeVisible({ timeout: 10_000 })
  const results = host.locator('.cb--results')
  await expect(results).toBeVisible({ timeout: 5_000 })

  const rows = results.locator('.cb__lb-entry')
  await expect(rows).toHaveCount(8)
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index)
    const rowBox = await row.boundingBox()
    const scoreBox = await row.locator('.cb__lb-score').boundingBox()
    const bandBox = await row.locator('.cb__lb-band').boundingBox()
    const labelBox = await row.locator('.cb__lb-score-label').boundingBox()

    expect(rowBox, `row ${index + 1} should be visible`).not.toBeNull()
    expect(scoreBox, `score ${index + 1} should be visible`).not.toBeNull()
    expect(bandBox, `performance band ${index + 1} should be visible`).not.toBeNull()
    expect(
      labelBox?.width,
      `score label ${index + 1} should be visually hidden`
    ).toBeLessThanOrEqual(1)
    expect(scoreBox!.y + scoreBox!.height).toBeLessThanOrEqual(bandBox!.y)
    expect(bandBox!.x).toBeGreaterThanOrEqual(rowBox!.x)
    expect(bandBox!.x + bandBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width)
  }
})
