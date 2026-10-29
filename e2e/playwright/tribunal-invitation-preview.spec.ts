import type { Page } from '@playwright/test'
import { dismissPermissionPromptIfPresent, expect, readAppState, test } from './support/test'

async function launch(page: Page, arrival: 'normal' | 'first' | 'second' = 'normal') {
  await page.goto('./#/game?debug=1', { waitUntil: 'domcontentloaded' })
  const panel = page.getByRole('complementary', { name: 'Debug Panel' })
  const toggle = page.getByRole('button', { name: 'Toggle Debug Panel' })
  await expect(toggle).toBeVisible()
  if (!(await panel.isVisible())) {
    await toggle.evaluate((button) => (button as HTMLButtonElement).click())
  }
  await expect(panel).toBeVisible()
  await dismissPermissionPromptIfPresent(page)
  const fixture = panel.getByRole('button', {
    name:
      arrival === 'first'
        ? 'Load first Tribunal arrival preview'
        : arrival === 'second'
          ? 'Load second Tribunal arrival preview'
          : 'Load Tribunal invitation preview',
    exact: true,
  })
  await expect(fixture).toBeEnabled()
  await fixture.evaluate((button) => (button as HTMLButtonElement).click())
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
    await expect(dialog.locator('.tdc-backplate')).toHaveAttribute(
      'src',
      /sequester-window-v4.webp$/
    )
    await expect(dialog.locator('.tdc-room__portal')).toHaveCount(0)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'playing')
    const cameraMotion = await dialog.locator('.tdc-scene').evaluate((scene) =>
      scene.getAnimations({ subtree: true }).map((animation) => ({
        name: (animation as CSSAnimation).animationName,
        fades: (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some((frame) => 'opacity' in frame),
      }))
    )
    expect(cameraMotion.map((motion) => motion.name)).toEqual(
      expect.arrayContaining(['tdc-camera-settle', 'tdc-pass-frame'])
    )
    expect(cameraMotion.every((motion) => !motion.fades)).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Continue season' })).toHaveClass(/game-button/)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-waiting-members', '2')
    const state = await readAppState(page)
    const human = state.game.players.find((player) => player.isUser)!
    const juryIds = new Set(
      state.game.players
        .filter((player) => player.status === 'jury' && player.id !== human.id)
        .map((player) => player.id)
    )
    const jurors = state.game.history
      .filter((event) => event.type === 'seasonExit' && juryIds.has(String(event.data.playerId)))
      .slice(-2)
      .reverse()
      .map((event) => String(event.data.playerId))
    await expect(dialog.locator('.tdc-person')).toHaveCount(3)
    expect(
      await dialog
        .locator('.tdc-person')
        .evaluateAll((figures) => figures.map((figure) => (figure as HTMLElement).dataset.playerId))
    ).toEqual([human.id, ...jurors])
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
    expect(decodedImageBytes).toBeLessThan(6 * 1024 * 1024)
    const plane = await dialog.locator('.tdc-stage-plane').boundingBox()
    const action = await dialog.locator('.tdc-action').boundingBox()
    if (!plane || !action) throw new Error('Portrait composition is unavailable')
    expect(plane.width / plane.height).toBeCloseTo(0.8, 2)
    const originalViewport = page.viewportSize()
    if (!originalViewport) throw new Error('Viewport geometry is unavailable')
    await page.setViewportSize({ ...originalViewport, height: originalViewport.height - 60 })
    await expect
      .poll(async () => {
        const resized = await dialog.locator('.tdc-stage-plane').boundingBox()
        const available = await dialog.locator('.tdc-scene').boundingBox()
        return resized && available
          ? {
              ratio: Math.round((resized.width / resized.height) * 100),
              fits:
                resized.width <= available.width + 0.5 && resized.height <= available.height + 0.5,
            }
          : null
      })
      .toEqual({ ratio: 80, fits: true })
    await page.setViewportSize(originalViewport)
    expect(action.width).toBeLessThanOrEqual(180)
    expect(action.height).toBeGreaterThanOrEqual(44)
    await expect(dialog.locator('.tdc-action')).not.toContainText('→')
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
    await launch(page, 'first')
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

  test('welcomes the second arrival with just the previous eliminated juror', async ({
    page,
  }, testInfo) => {
    await launch(page, 'second')
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-waiting-members', '1')
    await expect(dialog.locator('.tdc-person')).toHaveCount(2)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready')
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-second-arrival-${testInfo.project.name}.png`),
    })
    await dialog.getByRole('button', { name: 'Continue season' }).click()
    await expect(dialog).toBeHidden()
  })

  test('plays the exit scene and ends the local run', async ({ page }, testInfo) => {
    await launch(page)
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'One last goodbye' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.tdc-backplate')).toHaveAttribute('src', /farewell-set-v4.webp$/)
    await expect(dialog.locator('.tdc-room__portal')).toHaveCount(1)
    await expect(dialog.getByText('Leaving the Hub')).toBeVisible()
    await expect(dialog.locator('.tdc-person')).toHaveCount(1)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'playing', {
      timeout: 6000,
    })
    await page.waitForTimeout(900)
    await expect(dialog.locator('.tdc-person')).toHaveCSS('opacity', '1')
    await expect(dialog.locator('.tdc-luggage')).toHaveCSS('opacity', '1')
    const departureMotion = await dialog.locator('.tdc-scene').evaluate((scene) =>
      scene.getAnimations({ subtree: true }).map((animation) => ({
        name: (animation as CSSAnimation).animationName,
        fades: (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some((frame) => 'opacity' in frame),
      }))
    )
    expect(departureMotion.filter((motion) => motion.name === 'tdc-close')).toHaveLength(2)
    expect(departureMotion.every((motion) => !motion.fades)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-exit-${testInfo.project.name}.png`),
    })
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 8000,
    })
    await expect(dialog.locator('.tdc-action')).not.toContainText('→')
    await expect(dialog.locator('.tdc-room')).toBeVisible()
    await expect(dialog.locator('.tdc-person')).toHaveCSS('opacity', '1')
    await expect(dialog.locator('.tdc-room__door').first()).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)'
    )
    const occlusion = await dialog.locator('.tdc-room__portal').evaluate((portal) => {
      const cast = portal.parentElement!.querySelector('.tdc-cast')!
      const figure = cast.querySelector('.tdc-person')!.getBoundingClientRect()
      const opening = portal.getBoundingClientRect()
      const luggage = cast.querySelector('.tdc-luggage')!.getBoundingClientRect()
      const contains = (bounds: DOMRect) =>
        bounds.left >= opening.left &&
        bounds.right <= opening.right &&
        bounds.top >= opening.top &&
        bounds.bottom <= opening.bottom
      return {
        doorsInFront:
          Number(getComputedStyle(portal).zIndex) > Number(getComputedStyle(cast).zIndex),
        figureBeyondThreshold: contains(figure),
        luggageBeyondThreshold: contains(luggage),
      }
    })
    expect(occlusion).toEqual({
      doorsInFront: true,
      figureBeyondThreshold: true,
      luggageBeyondThreshold: true,
    })
    const action = await dialog.locator('.tdc-action').boundingBox()
    if (!action) throw new Error('Home control is unavailable')
    expect(action.width).toBeLessThanOrEqual(180)
    await dialog.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/#\/$/)
  })

  test('can skip the camera reveal and uses closed doors for reduced-motion departure', async ({
    page,
  }) => {
    await launch(page)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const arrival = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await arrival.getByRole('button', { name: 'Skip animation' }).click()
    await expect(arrival.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready')
    await expect(arrival.locator('.tdc-camera')).toHaveCSS('transform', 'none')
    await arrival.getByRole('button', { name: 'Continue season' }).click()
    await expect(arrival).toBeHidden()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await launch(page)
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    const departure = page.getByRole('dialog', { name: 'One last goodbye' })
    await expect(departure.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready')
    await expect(departure.locator('.tdc-room')).toBeVisible()
    await expect(departure.locator('.tdc-room__door').first()).toHaveCSS(
      'transform',
      'matrix(1, 0, 0, 1, 0, 0)'
    )
    expect(
      await departure
        .locator('.tdc-scene')
        .evaluate((scene) => scene.getAnimations({ subtree: true }).length)
    ).toBe(0)
    await departure.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(departure).toBeHidden()
  })
})
