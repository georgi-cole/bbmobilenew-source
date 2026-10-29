import type { Page } from '@playwright/test'
import { dismissPermissionPromptIfPresent, expect, readAppState, test } from './support/test'

async function launch(page: Page, firstArrival = false) {
  await page.goto('./#/game?debug=1')
  await dismissPermissionPromptIfPresent(page)
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  await expect(panel).toBeVisible()
  await panel
    .getByRole('button', {
      name: firstArrival
        ? 'Load first Tribunal arrival preview'
        : 'Load Tribunal invitation preview',
      exact: true,
    })
    .click()
}

test.describe('Tribunal invitation preview @visual @mobile', () => {
  test('keeps both choices inside the Faux TV and requires an explicit decision', async ({
    page,
  }, testInfo) => {
    await launch(page)
    const viewport = page.getByRole('region', { name: 'Live game events display' })
    const invitation = page.locator('.tv-announcement--tribunal-invitation')
    await expect(invitation).toBeVisible()
    await expect(invitation.getByText("You've earned a spot in the Tribunal")).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Choose Agree or Exit in the Faux TV' })
    ).toBeDisabled()
    expect(
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
      )
    ).toBe(false)
    await expect(invitation).toBeVisible()
    const screen = await viewport.boundingBox()
    if (!screen) throw new Error('Faux TV geometry is unavailable')
    for (const locator of [
      invitation.locator('.tv-announcement__title'),
      invitation.locator('.tv-announcement__subtitle'),
      invitation.getByRole('button', { name: 'Agree', exact: true }),
      invitation.getByRole('button', { name: 'Exit', exact: true }),
    ]) {
      const bounds = await locator.boundingBox()
      if (!bounds) throw new Error('Invitation control geometry is unavailable')
      expect(bounds.x).toBeGreaterThanOrEqual(screen.x)
      expect(bounds.y).toBeGreaterThanOrEqual(screen.y)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(screen.x + screen.width)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(screen.y + screen.height)
    }
    await expect(page.locator('.tv-zone')).not.toHaveClass(/tv-zone--tribunal-spotlight/)
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-choice-${testInfo.project.name}.png`),
    })
  })

  test('opens sequester with the actual player and at most two members, then resumes', async ({
    page,
  }, testInfo) => {
    await launch(page)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.tdc-room__window')).toHaveCount(1)
    await expect(dialog.locator('.tdc-room__portal')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Continue season' })).toHaveClass(
      /game-button--primary/
    )
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-waiting-members', '2')
    const state = await readAppState(page)
    const human = state.game.players.find((player) => player.isUser)!
    const jurors = state.game.players
      .filter((player) => player.status === 'jury' && player.id !== human.id)
      .slice(0, 2)
    await expect(dialog.locator('.tdc-person')).toHaveCount(3)
    expect(
      await dialog
        .locator('.tdc-person')
        .evaluateAll((figures) => figures.map((figure) => (figure as HTMLElement).dataset.playerId))
    ).toEqual([human.id, ...jurors.map((player) => player.id)])
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 12000,
    })
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-image-state', 'resolved')
    await expect(dialog.locator('.tdc-person[data-presentation="cutout"]')).toHaveCount(3)
    const decodedImageBytes = await dialog
      .locator('.tdc-scene img')
      .evaluateAll((images) =>
        images.reduce(
          (bytes, image) =>
            bytes +
            (image as HTMLImageElement).naturalWidth *
              (image as HTMLImageElement).naturalHeight *
              4,
          0
        )
      )
    expect(decodedImageBytes).toBeLessThan(3 * 1024 * 1024)
    const sceneBounds = await dialog.locator('.tdc-scene').boundingBox()
    if (!sceneBounds) throw new Error('Stage geometry is unavailable')
    for (const figure of await dialog.locator('.tdc-person').all()) {
      const bounds = await figure.boundingBox()
      if (!bounds) throw new Error('Cast geometry is unavailable')
      expect(bounds.x).toBeGreaterThanOrEqual(sceneBounds.x)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(sceneBounds.x + sceneBounds.width)
      expect(bounds.y).toBeGreaterThanOrEqual(sceneBounds.y)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(sceneBounds.y + sceneBounds.height)
    }
    expect(
      await dialog
        .locator('.tdc-scene')
        .evaluate(
          (scene) =>
            scene
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === 'running').length
        )
    ).toBe(0)
    await testInfo.attach('scene-image-budget', {
      body: JSON.stringify({ decodedImageBytes }),
      contentType: 'application/json',
    })
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-arrival-${testInfo.project.name}.png`),
    })
    await dialog.getByRole('button', { name: 'Continue season' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.tv-announcement--tribunal-invitation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Advance to next phase' })).toBeEnabled()
  })

  test('handles the first juror with reduced motion', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launch(page, true)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(dialog.getByText(/You're the first to arrive/)).toBeVisible()
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-waiting-members', '0')
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready')
    await expect(dialog.locator('.tdc-person')).toHaveCount(1)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-image-state', 'resolved')
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-first-arrival-${testInfo.project.name}.png`),
    })
    await dialog.getByRole('button', { name: 'Continue season' }).click()
    await expect(dialog).toBeHidden()
  })

  test('keeps the handoff usable when body artwork fails', async ({ page }, testInfo) => {
    await page.route('**/assets/tribunal/cast/*.webp', (route) =>
      route.fulfill({ status: 200, contentType: 'image/webp', body: 'unavailable' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launch(page)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(dialog.locator('.tdc-person[data-presentation="portrait"]')).toHaveCount(3)
    for (const portrait of await dialog.locator('.tdc-person__portrait .pa__img').all()) {
      await expect(portrait).toHaveClass(/pa__img--loaded/)
    }
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-portrait-fallback-${testInfo.project.name}.png`),
    })
    await dialog.getByRole('button', { name: 'Continue season' }).click()
    await expect(dialog).toBeHidden()
  })

  test('plays the exit scene and ends the local run', async ({ page }, testInfo) => {
    await launch(page)
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'One last goodbye' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.tdc-room__window')).toHaveCount(0)
    await expect(dialog.locator('.tdc-room__portal')).toHaveCount(1)
    await expect(dialog.getByText('Leaving the Hub')).toBeVisible()
    await expect(dialog.locator('.tdc-person')).toHaveCount(1)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'playing', {
      timeout: 6000,
    })
    await page.waitForTimeout(900)
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-exit-${testInfo.project.name}.png`),
    })
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 8000,
    })
    await dialog.getByRole('button', { name: 'Return home' }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/#\/$/)
  })
})
