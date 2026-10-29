import { dismissPermissionPromptIfPresent, expect, test } from './support/test'

test.describe('Tribunal invitation preview @visual @mobile', () => {
  test('keeps the real Faux TV invitation inside the screen at the selected viewport', async ({
    page,
  }, testInfo) => {
    await page.goto('./#/game?debug=1')
    await dismissPermissionPromptIfPresent(page)

    const debugPanel = page.getByRole('complementary', { name: 'Debug Panel' })
    await expect(debugPanel).toBeVisible()
    await debugPanel.getByRole('button', { name: 'Load Tribunal invitation preview' }).click()

    const viewport = page.getByRole('region', { name: 'Live game events display' })
    const invitation = page.locator('.tv-announcement--tribunal-invitation')
    const continueButton = page.getByRole('button', { name: 'Continue as Tribunal Member' })

    await expect(invitation).toBeVisible()
    await expect(invitation.getByText("Your Story Isn't Over")).toBeVisible()
    await expect(continueButton).toBeVisible()

    const viewportBounds = await viewport.boundingBox()
    const titleBounds = await invitation.locator('.tv-announcement__title').boundingBox()
    const subtitleBounds = await invitation.locator('.tv-announcement__subtitle').boundingBox()
    const buttonBounds = await continueButton.boundingBox()
    if (!viewportBounds || !titleBounds || !subtitleBounds || !buttonBounds) {
      throw new Error('Faux TV invitation geometry is unavailable')
    }

    for (const bounds of [titleBounds, subtitleBounds, buttonBounds]) {
      expect(bounds.x).toBeGreaterThanOrEqual(viewportBounds.x)
      expect(bounds.y).toBeGreaterThanOrEqual(viewportBounds.y)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewportBounds.x + viewportBounds.width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewportBounds.y + viewportBounds.height)
    }

    await page.screenshot({
      path: testInfo.outputPath(`tribunal-invitation-${testInfo.project.name}.png`),
      fullPage: false,
    })
  })
})
