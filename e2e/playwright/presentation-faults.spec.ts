// Fault injection uses the real browser decoder and real game/credits routes.
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { seedTwinScene } from './support/twinShockScene'

type Family = 'credits' | 'twin'

const mediaFiles = {
  credits: 'assets/credits/big-eye-cinematic-background.mp4',
  twin: 'assets/twin-shock/twin-shock-intro-v1.mp4',
}

async function openScene(page: Page, family: Family) {
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({
    timeout: 30_000,
  })
  if (family === 'credits') {
    await page.evaluate(() => {
      location.hash = '/credits'
    })
  } else {
    const storeUrl = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/src\/store\/store\.ts$/.test(new URL(url).pathname))
    )
    if (!storeUrl) throw new Error('Missing running game store')
    await seedTwinScene(page, storeUrl, 'combined', 0)
  }
  return page.locator(family === 'credits' ? '.credits-container' : '.twin-intro')
}

async function assertNoMediaDuringGameplay(page: Page) {
  await page.evaluate(() => {
    location.hash =
      '/minigame-lab?game=quickTap&seed=730&players=4&skipRules=true&skipCountdown=false&quickTapVip=false'
  })
  await expect(page.locator('.minigame-host-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('video[src], [data-cinematic-preparing="true"]')).toHaveCount(0)
  await expect(page.getByTestId('quick-tap-race-canvas')).toBeVisible({ timeout: 15_000 })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
    localStorage.setItem(
      'bbmobilenew_settings_v1',
      JSON.stringify({ audio: { musicOn: false, sfxOn: false }, gameUX: { animations: true } })
    )
  })
})

for (const family of ['credits', 'twin'] as const) {
  test(`${family}: changing the system motion preference releases video without replaying it`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const scene = await openScene(page, family)
    const video = scene.locator('video')
    await expect
      .poll(() =>
        video.evaluate(
          (element) =>
            (element as HTMLVideoElement).readyState >= 2 &&
            (element as HTMLVideoElement).currentTime > 0 &&
            !(element as HTMLVideoElement).paused
        )
      )
      .toBe(true)
    const handle = await video.elementHandle()
    if (!handle) throw new Error('Missing playing media element')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect
      .poll(() =>
        handle.evaluate(
          (element) => !element.hasAttribute('src') && (element as HTMLVideoElement).paused
        )
      )
      .toBe(true)
    if (family === 'credits') {
      await expect(scene.locator('video')).toHaveCount(0)
      await expect(page.getByTestId('credits-background-fallback')).toBeVisible()
    } else await expect(scene).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    if (family === 'credits') {
      await expect(scene.locator('video')).toHaveCount(0)
      await scene.getByRole('button', { name: /skip/i }).click()
      await expect(scene).toHaveCount(0)
    }
    await assertNoMediaDuringGameplay(page)
    await expect.poll(() => handle.evaluate((element) => !element.hasAttribute('src'))).toBe(true)
    await handle.dispose()
  })

  for (const fault of ['missing', 'corrupt', 'late'] as const) {
    test(`${family}: ${fault} video keeps fallback and Skip usable without a late source`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(60_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let releaseResponse = () => {}
      const responseGate = new Promise<void>((resolve) => {
        releaseResponse = resolve
      })
      const responses: Array<Promise<void>> = []
      const body =
        fault === 'late'
          ? await readFile(new URL(`../../public/${mediaFiles[family]}`, import.meta.url))
          : Buffer.from('This is not a valid MP4 stream.')
      await page.route(`**/${mediaFiles[family]}`, (route) => {
        const response = responseGate.then(async () => {
          // A detached media element may cancel its held network request.
          await route
            .fulfill({ status: fault === 'missing' ? 404 : 200, contentType: 'video/mp4', body })
            .catch(() => {})
        })
        responses.push(response)
        return response
      })
      try {
        const scene = await openScene(page, family)
        await expect(scene).toBeVisible()
        const video = scene.locator('video')
        await expect(video).toHaveAttribute('src', /\.mp4$/)
        const handle = await video.elementHandle()
        if (!handle) throw new Error('Expected a captured media element before fault injection')
        await expect.poll(() => responses.length).toBeGreaterThan(0)
        if (fault !== 'late') releaseResponse()
        await expect
          .poll(() => handle.evaluate((element) => !element.hasAttribute('src')))
          .toBe(true)
        if (fault === 'late') releaseResponse()
        await Promise.all(responses)
        await expect(scene).toBeVisible()
        await expect(scene.locator('video[src]')).toHaveCount(0)
        if (family === 'credits') {
          await expect(page.getByTestId('credits-background-fallback')).toBeVisible()
          await expect(scene.locator('.credits-overlay-track')).toBeVisible()
        } else await expect(scene).not.toHaveClass(/twin-intro--video-ready/)
        await testInfo.attach(`${family}-${fault}-fallback`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        await scene.getByRole('button', { name: /skip/i }).click()
        await expect(scene).toHaveCount(0)
        await assertNoMediaDuringGameplay(page)
        await expect
          .poll(() =>
            handle.evaluate(
              (element) => !element.hasAttribute('src') && (element as HTMLVideoElement).paused
            )
          )
          .toBe(true)
        await handle.dispose()
        expect(errors).toEqual([])
      } finally {
        releaseResponse()
        await Promise.all(responses)
      }
    })
  }

  test(`${family}: a delayed response after route exit cannot revive the old scene`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    let releaseResponse = () => {}
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve
    })
    const responses: Array<Promise<void>> = []
    const body = await readFile(new URL(`../../public/${mediaFiles[family]}`, import.meta.url))
    await page.route(`**/${mediaFiles[family]}`, (route) => {
      const response = responseGate.then(async () => {
        await route.fulfill({ contentType: 'video/mp4', body }).catch(() => {})
      })
      responses.push(response)
      return response
    })
    try {
      const scene = await openScene(page, family)
      const video = scene.locator('video')
      await expect(video).toHaveAttribute('src', /\.mp4$/)
      const handle = await video.elementHandle()
      if (!handle) throw new Error('Missing captured media element')
      await expect.poll(() => responses.length).toBeGreaterThan(0)
      await page.evaluate(() => {
        location.hash = '/'
      })
      await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
      releaseResponse()
      await Promise.all(responses)
      await assertNoMediaDuringGameplay(page)
      await expect(page.locator('.credits-container, .twin-intro')).toHaveCount(0)
      await expect
        .poll(() =>
          handle.evaluate(
            (element) => !element.hasAttribute('src') && (element as HTMLVideoElement).paused
          )
        )
        .toBe(true)
      await handle.dispose()
    } finally {
      releaseResponse()
      await Promise.all(responses)
    }
  })
}
