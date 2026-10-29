import {
  closeDebugPanelIfOpen,
  dismissPermissionPromptIfPresent,
  expect,
  test,
} from './support/test'

// Broadcast QA covers both portrait and landscape geometry on the real overlay.
test.describe('Housemate biographies @core-journey', () => {
  test('keeps Aria and Dex full-height with compact side copy and decodable portraits', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => {
      sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
      localStorage.setItem(
        'bbmobilenew_settings_v1',
        JSON.stringify({
          audio: { musicOn: false, sfxOn: false },
          gameUX: { animations: true },
        })
      )
    })

    await page.goto('./', { waitUntil: 'domcontentloaded' })
    const mainMenu = page.getByRole('navigation', { name: 'Main menu' })
    await expect(mainMenu).toBeVisible({ timeout: 30_000 })
    await dismissPermissionPromptIfPresent(page)
    await closeDebugPanelIfOpen(page)

    await mainMenu
      .getByRole('button', { name: 'Hubmates', exact: true })
      .evaluate((button) => (button as HTMLButtonElement).click())

    const cinematic = page.getByRole('dialog', { name: 'Meet the Hubmates' })
    await expect(cinematic).toBeVisible({ timeout: 30_000 })
    const enterHub = cinematic.getByRole('button', { name: 'Enter the hub' })
    if (await enterHub.isVisible()) await enterHub.click()
    await cinematic.getByRole('button', { name: "Open Aria's full story" }).click()
    await expect(cinematic.getByRole('heading', { name: 'Aria' })).toBeVisible({
      timeout: 10_000,
    })

    const portrait = cinematic.locator('.hbc-profile__portrait')
    const portraitWrap = cinematic.locator('.hbc-profile__portrait-stage')
    const copy = cinematic.locator('.hbc-profile__copy')
    await expect(portrait).toBeVisible()
    await expect
      .poll(() => portrait.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)

    const viewport = page.viewportSize()
    const portraitBox = await portraitWrap.boundingBox()
    const copyBox = await copy.boundingBox()
    if (!viewport || !portraitBox || !copyBox) {
      throw new Error('Biography layout measurements are unavailable')
    }

    // Desktop intentionally caps the portrait stage at 760px (`min(71dvh, 760px)`).
    // Mobile uses the uncapped viewport-relative layout. Assert the actual design
    // contract rather than requiring >72vh on tall desktops, which contradicts
    // the explicit desktop cap.
    const minimumPortraitHeight =
      viewport.width >= 700 ? Math.min(viewport.height * 0.71, 760) - 2 : viewport.height * 0.72
    expect(portraitBox.height).toBeGreaterThanOrEqual(minimumPortraitHeight)
    expect(portraitBox.y).toBeGreaterThanOrEqual(80)
    expect(portraitBox.y + portraitBox.height).toBeLessThanOrEqual(viewport.height - 50)
    expect(copyBox.width).toBeLessThanOrEqual(viewport.width * 0.5)
    expect(copyBox.x).toBeGreaterThanOrEqual(viewport.width * 0.48)

    await page.screenshot({
      path: 'test-results/housemates-biography-aria-mobile.png',
      fullPage: false,
    })

    await cinematic.getByRole('button', { name: 'All players' }).click()
    for (let step = 0; step < 4; step += 1) {
      await cinematic.getByRole('button', { name: 'Next player', exact: true }).click()
    }
    await cinematic.getByRole('button', { name: "Open Dex's full story" }).click()
    await expect(cinematic.getByRole('heading', { name: 'Dex', exact: true })).toBeVisible()
    await expect(portrait).toHaveAttribute('src', /Dex_informal_v2\.webp$/)
    const dimensions = await portrait.evaluate(async (element) => {
      const image = element as HTMLImageElement
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight }
    })
    expect(dimensions).toEqual({ width: 1024, height: 1536 })
    await page.screenshot({
      path: 'test-results/housemates-biography-dex-mobile.png',
      fullPage: false,
    })
  })
})
