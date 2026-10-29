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
  for (const [control, title, milestone] of [
    ['Preview fourth-place departure', 'Fourth place', 'fourth_place'],
    ['Preview bronze arrival', 'Bronze medalist', 'bronze'],
  ] as const) {
    test(`reviews the ${milestone} film without committing a season result`, async ({
      page,
    }, testInfo) => {
      await launch(page)
      await page
        .getByRole('button', { name: 'Toggle Debug Panel' })
        .evaluate((button) => (button as HTMLButtonElement).click())
      const before = await readAppState(page)
      await page
        .getByRole('complementary', { name: 'Debug Panel' })
        .getByRole('button', { name: control, exact: true })
        .evaluate((button) => (button as HTMLButtonElement).click())
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      await expect(dialog).toHaveAttribute('data-milestone', milestone)
      await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'playing')
      await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
        timeout: 12000,
      })
      await expect(
        dialog.getByText(
          milestone === 'fourth_place'
            ? 'You finish in fourth place. Three housemates remain in the race for the title.'
            : 'You take third place and join sequester. The Tribunal will choose the winner.',
          { exact: true }
        )
      ).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`${milestone}-review.png`) })
      await dialog.getByRole('button', { name: 'Continue season', exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('complementary', { name: 'Debug Panel' })).toBeVisible()
      const after = await readAppState(page)
      expect(after.game.gameId).toBe(before.game.gameId)
      expect(after.game.phase).toBe(before.game.phase)
      expect(after.game.pendingEviction).toEqual(before.game.pendingEviction)
      expect(after.game.history).toEqual(before.game.history)
      expect(after.game.players).toEqual(before.game.players)
    })
  }

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
    await expect(dialog.locator('.tdc-backplate')).toHaveAttribute('src', /sequester-room-v9.webp$/)
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
    expect(
      cameraMotion
        .filter((motion) => motion.name !== 'tdc-city-window')
        .every((motion) => !motion.fades)
    ).toBe(true)
    expect(cameraMotion.map((motion) => motion.name)).toEqual(
      expect.arrayContaining(['tdc-window-approach', 'tdc-pass-cast'])
    )
    const cityHold = dialog.locator('.tdc-room').evaluate(
      (room) =>
        new Promise<{ phase: string | undefined; copy: string }>((resolve) => {
          room.addEventListener(
            'animationend',
            (event) => {
              if ((event as AnimationEvent).animationName !== 'tdc-window-approach') return
              const dialog = room.closest<HTMLElement>('.tdc-dialog')!
              resolve({
                phase: dialog.dataset.phase,
                copy: getComputedStyle(dialog.querySelector('.tdc-copy')!).visibility,
              })
            },
            { once: true }
          )
        })
    )
    const groundedPass = dialog.locator('.tdc-person--player').evaluate(
      (player) =>
        new Promise<{ scale: number; clear: boolean; grounded: boolean; onFloor: boolean }>(
          (resolve) => {
            const scene = player.closest('.tdc-scene')!
            const cast = [...scene.querySelectorAll('.tdc-person')]
            const initialFeet = cast.map((figure) => figure.getBoundingClientRect().bottom)
            player.addEventListener(
              'animationend',
              () => {
                const frame = scene.getBoundingClientRect()
                const room = scene.querySelector('.tdc-room')!.getBoundingClientRect()
                resolve({
                  scale: new DOMMatrixReadOnly(
                    getComputedStyle(scene.querySelector('.tdc-room')!).transform
                  ).a,
                  clear: cast.every((figure) => {
                    const bounds = figure.getBoundingClientRect()
                    return bounds.right <= frame.left || bounds.left >= frame.right
                  }),
                  grounded: cast.every(
                    (figure, index) =>
                      Math.abs(figure.getBoundingClientRect().bottom - initialFeet[index]) < 1
                  ),
                  onFloor: initialFeet.every((feet) => feet >= room.top + room.height * 0.58),
                })
              },
              { once: true }
            )
          }
        )
    )
    await expect(dialog.locator('.tdc-action')).toHaveClass(/game-button/)
    await expect(dialog.locator('figcaption')).toHaveCount(0)
    const glazing = await dialog.locator('.tdc-window-glazing').evaluate((glass) => ({
      holders: glass.querySelectorAll('.tdc-mullion').length,
      behindCast:
        Number(getComputedStyle(glass).zIndex) <
        Number(getComputedStyle(glass.parentElement!.querySelector('.tdc-cast')!).zIndex),
    }))
    expect(glazing).toEqual({ holders: 2, behindCast: true })
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
    const pass = await groundedPass
    expect(pass.clear).toBe(true)
    expect(pass.grounded).toBe(true)
    expect(pass.onFloor).toBe(true)
    expect(pass.scale).toBeGreaterThan(1.1)
    expect(pass.scale).toBeLessThanOrEqual(1.32)
    expect(await cityHold).toEqual({ phase: 'playing', copy: 'hidden' })
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
    expect(decodedImageBytes).toBeLessThan(14 * 1024 * 1024)
    const cityDensity = await dialog
      .locator('.tdc-city-view > img')
      .evaluate(
        (image) => (image as HTMLImageElement).naturalWidth / image.getBoundingClientRect().width
      )
    expect(cityDensity).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 0) <= 480 ? 2 : 1.5)
    await expect(dialog.locator('.tdc-city-view')).toHaveCSS('transform', 'none')
    const plane = await dialog.locator('.tdc-stage-plane').boundingBox()
    const film = await dialog.boundingBox()
    const action = await dialog.locator('.tdc-action').boundingBox()
    if (!plane || !action || !film) throw new Error('Portrait composition is unavailable')
    expect(plane.width).toBeCloseTo(film.width, 0)
    expect(plane.height).toBeCloseTo(film.height, 0)
    expect(plane.x).toBeCloseTo(film.x, 0)
    expect(plane.y).toBeCloseTo(film.y, 0)
    await expect(dialog.locator('.tdc-copy')).toBeVisible()
    const originalViewport = page.viewportSize()
    if (!originalViewport) throw new Error('Viewport geometry is unavailable')
    await page.setViewportSize({ ...originalViewport, height: originalViewport.height - 60 })
    await expect
      .poll(async () => {
        const resized = await dialog.locator('.tdc-stage-plane').boundingBox()
        const available = await dialog.locator('.tdc-scene').boundingBox()
        return resized && available
          ? {
              fills:
                Math.abs(resized.width - available.width) < 0.5 &&
                Math.abs(resized.height - available.height) < 0.5,
            }
          : null
      })
      .toEqual({ fills: true })
    await page.setViewportSize(originalViewport)
    expect(action.width).toBeLessThanOrEqual(180)
    expect(action.height).toBeGreaterThanOrEqual(44)
    await expect(dialog.locator('.tdc-action')).not.toContainText('→')
    for (const figure of await dialog.locator('.tdc-person').all()) {
      await expect(figure).not.toBeInViewport()
    }
    const cityTransform = await dialog
      .locator('.tdc-room')
      .evaluate((room) => new DOMMatrixReadOnly(getComputedStyle(room).transform).a)
    expect(cityTransform).toBeCloseTo(2.2)
    expect(
      await dialog.locator('.tdc-scene').evaluate((scene) =>
        scene
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running')
          .map((animation) => (animation as CSSAnimation).animationName)
      )
    ).toEqual(Array(4).fill('tdc-city-window'))
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
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 12000,
    })
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
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 12000,
    })
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
    await expect(dialog.locator('.tdc-room > .tdc-backplate')).toHaveAttribute(
      'src',
      /farewell-window-v7.webp$/
    )
    await expect(dialog.locator('.tdc-room__portal')).toHaveCount(1)
    await expect(dialog.getByText('Leaving the Hub')).toBeVisible()
    await expect(dialog.locator('.tdc-person')).toHaveCount(1)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'playing', {
      timeout: 6000,
    })
    const finalCity = dialog.locator('.tdc-set-content').evaluate(
      (camera) =>
        new Promise<string>((resolve) => {
          camera.addEventListener('animationend', (event) => {
            if ((event as AnimationEvent).animationName !== 'tdc-exit-push') return
            resolve(
              getComputedStyle(camera.closest('.tdc-dialog')!.querySelector('.tdc-copy')!)
                .visibility
            )
          })
        })
    )
    const doorway = await dialog.locator('.tdc-room__portal').boundingBox()
    const film = await dialog.boundingBox()
    if (!doorway || !film) throw new Error('Departure shot is unavailable')
    expect(doorway.x).toBeGreaterThanOrEqual(film.x)
    expect(doorway.x + doorway.width).toBeLessThanOrEqual(film.x + film.width)
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
    expect(
      departureMotion
        .filter((motion) => motion.name !== 'tdc-city-window')
        .every((motion) => !motion.fades)
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`tribunal-exit-${testInfo.project.name}.png`),
    })
    expect(await finalCity).toBe('hidden')
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

  test('uses the complete title card without scenic or cue requests when data saving is enabled', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true, effectiveType: '4g' },
      })
    })
    const scenery: string[] = []
    page.on('request', (request) => {
      if (/assets\/tribunal\/|Twin_shock_presentation/.test(request.url()))
        scenery.push(request.url())
    })
    await launch(page)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const arrival = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(arrival).toHaveAttribute('data-presentation', 'slate')
    await expect(arrival.locator('img')).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('tribunal-data-saving-card.png') })
    await arrival.getByRole('button', { name: 'Continue season' }).click()
    await launch(page)
    await page.getByRole('button', { name: 'Exit', exact: true }).click()
    const departure = page.getByRole('dialog', { name: 'One last goodbye' })
    await expect(departure).toHaveAttribute('data-presentation', 'slate')
    await departure.getByRole('button', { name: 'Home', exact: true }).click()
    expect(scenery).toEqual([])
  })

  test('holds the title card when scenery arrives after the loading deadline', async ({ page }) => {
    await page.route('**/assets/tribunal/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3500))
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=',
          'base64'
        ),
      })
    })
    const cues: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('Twin_shock_presentation')) cues.push(request.url())
    })
    await launch(page)
    await page.getByRole('button', { name: 'Agree', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to sequester' })
    await expect(dialog).toHaveAttribute('data-presentation', 'slate')
    await expect(dialog.getByRole('button', { name: 'Continue season' })).toBeEnabled()
    await page.waitForTimeout(2000)
    await expect(dialog).toHaveAttribute('data-presentation', 'slate')
    await expect(dialog.locator('img')).toHaveCount(0)
    expect(cues).toEqual([])
    await dialog.getByRole('button', { name: 'Continue season' }).click()
  })

  test('uses the departure film for Classic fourth place without ending the season', async ({
    page,
  }, testInfo) => {
    await launch(page)
    const panel = page.getByRole('complementary', { name: 'Debug Panel' })
    if (!(await panel.isVisible())) {
      await page
        .getByRole('button', { name: 'Toggle Debug Panel' })
        .evaluate((button) => (button as HTMLButtonElement).click())
    }
    await panel
      .getByRole('button', { name: 'Prepare Classic Final 4 Test', exact: true })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await page
      .getByRole('button', { name: 'Toggle Debug Panel' })
      .evaluate((button) => (button as HTMLButtonElement).click())
    const pleas = page.getByRole('dialog', { name: 'Final 4 plea chat' })
    await pleas.getByRole('button', { name: 'Skip to decision', exact: true }).click()
    const vote = pleas.getByRole('button', { name: /^Vote to eliminate / }).first()
    await expect(vote).toBeVisible()
    await vote.click()
    const announcement = page.getByRole('dialog', { name: 'Final 4 elimination announcement' })
    await announcement.getByRole('button', { name: 'Skip to end', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Fourth place' })
    await expect(dialog).toHaveAttribute('data-milestone', 'fourth_place')
    await expect(dialog).toHaveClass(/tdc-dialog--exit/)
    const pending = await readAppState(page)
    const evicteeId = pending.game.pendingEviction?.evicteeId
    expect(evicteeId).toBeTruthy()
    expect(pending.game.players.find((player) => player.id === evicteeId)?.status).not.toBe('jury')
    await expect(dialog.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0)
    await expect(dialog.locator('.tdc-scene')).toHaveAttribute('data-phase', 'ready', {
      timeout: 12000,
    })
    await page.screenshot({ path: testInfo.outputPath('fourth-place-departure.png') })
    await dialog.getByRole('button', { name: 'Continue season', exact: true }).click()
    await expect(dialog).toBeHidden()
    const completed = await readAppState(page)
    expect(completed.game.pendingEviction).toBeNull()
    expect(completed.game.players.find((player) => player.id === evicteeId)?.seasonPlacement).toBe(
      4
    )
    expect(completed.game.gameId).toBe(pending.game.gameId)
    expect(
      completed.game.players.filter((player) => !['jury', 'evicted'].includes(player.status))
    ).toHaveLength(3)
  })
})
