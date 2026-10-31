// Real media on the actual game route; the shared UI fixture mocks play().
import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { seedTwinScene } from './support/twinShockScene'

async function waitForChapterTransition(page: Page) {
  await expect
    .poll(() =>
      page.locator('.twin-intro').evaluate((root) =>
        [
          ...root.querySelectorAll(
            '.twin-intro__signal, .twin-intro__chapter, .twin-intro__verdict'
          ),
        ].every((block) => {
          const opacity = Number(getComputedStyle(block).opacity)
          return block.getAttribute('aria-hidden') === 'true' ? opacity <= 0.01 : opacity >= 0.99
        })
      )
    )
    .toBe(true)
}

test('preserves both Twin Shock results through 20 real game-route playback/Skip cycles', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
    localStorage.setItem(
      'bbmobilenew_settings_v1',
      JSON.stringify({ audio: { musicOn: false, sfxOn: false }, gameUX: { animations: true } })
    )
  })
  await page.goto('./')
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({ timeout: 30_000 })
  const moduleBase = new URL('./', page.url()).href
  // Vite may timestamp an HMR dependency. Reuse the app's exact store module
  // URL so this browser fixture cannot accidentally create a second store.
  const storeModuleUrl = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/store\/store\.ts$/.test(new URL(url).pathname))
  )
  if (!storeModuleUrl) throw new Error('The running app store module is unavailable')
  const pilotEnabled = await page.evaluate(
    async (base) =>
      (await import(`${base}src/config/featureFlags.ts`)).isTwinShockVideoPilotEnabled(),
    moduleBase
  )
  const cycles: Array<{ branch: string; outcome: string; sourceReleased: boolean }> = []
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const branch = cycle % 2 ? 'ali_enters' : 'combined'
    const expected = await seedTwinScene(page, storeModuleUrl, branch, cycle)
    const intro = page.locator('.twin-intro')
    await expect(intro).toBeVisible({ timeout: 15_000 })
    const video = page.getByTestId('twin-shock-background-video')
    const handle = await video.elementHandle()
    if (!handle) throw new Error('Twin background element is missing')
    if (pilotEnabled) {
      await expect
        .poll(
          () =>
            video.evaluate((element) => {
              const media = element as HTMLVideoElement
              return media.readyState >= 2 && media.currentTime > 0.1 && !media.paused
            }),
          { timeout: 3000 }
        )
        .toBe(true)
      if (cycle < 2) {
        await video.evaluate((element) => {
          ;(element as HTMLVideoElement).currentTime = 8.5
        })
        await expect(intro).toHaveAttribute('data-stage', 'reveal')
        await waitForChapterTransition(page)
        await testInfo.attach(`twin-${branch}-live-names`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
        await video.evaluate((element) => {
          ;(element as HTMLVideoElement).currentTime = 12
        })
        await expect(intro).toHaveAttribute('data-stage', 'verdict')
        await waitForChapterTransition(page)
        await expect(intro.locator('.twin-intro__verdict h2')).toHaveText(
          branch === 'ali_enters' ? 'Ali enters the House.' : 'Lia & Ali play as one.'
        )
        await testInfo.attach(`twin-${branch}-live-verdict`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        })
      }
    } else {
      await expect(video).not.toHaveAttribute('src')
    }
    let outcome = pilotEnabled && cycle % 4 < 2 ? 'ended-after-seek' : 'skip'
    if (outcome === 'ended-after-seek') {
      const didSeek = await handle.evaluate((element) => {
        const media = element as HTMLVideoElement
        // Capturing settled chapter frames can outlast the remaining video or
        // a deliberately bounded seek stall. A captured element may already
        // have been released; let its normal/fallback completion finish.
        if (!media.hasAttribute('src') || !Number.isFinite(media.duration)) return false
        media.currentTime = media.duration - 0.15
        return true
      })
      if (!didSeek) outcome = 'normal-end-or-bounded-fallback'
    } else {
      await intro.getByRole('button', { name: /skip/i }).evaluate((button) => {
        ;(button as HTMLButtonElement).click()
        ;(button as HTMLButtonElement).click()
      })
    }
    await expect(intro).toHaveCount(0, { timeout: outcome === 'skip' ? 5000 : 25_000 })
    await expect
      .poll(() =>
        handle.evaluate(
          (element) => !element.hasAttribute('src') && (element as HTMLVideoElement).paused
        )
      )
      .toBe(true)
    await expect
      .poll(
        () =>
          page.evaluate(async (base) => {
            const { store } = await import(base)
            return store.getState().game.twinShock?.pendingRevealAnimation ?? null
          }, storeModuleUrl),
        { timeout: 7000 }
      )
      .toBeNull()
    const result = await page.evaluate(async (base) => {
      const { store } = await import(base)
      const game = store.getState().game
      return {
        rosterSize: game.players.length,
        resolution: game.twinShockResolution,
        aliPresent: game.players.some((player: { id: string }) => player.id === 'ali'),
        liaName: game.players.find((player: { id: string }) => player.id === 'lia')?.name,
      }
    }, storeModuleUrl)
    expect(result.rosterSize).toBe(expected.rosterSize)
    expect(result.resolution).toBe(expected.resolution)
    expect(result.aliPresent).toBe(branch === 'ali_enters')
    expect(result.liaName).toBe(branch === 'combined' ? 'Lia & Ali' : 'Lia')
    await expect(page.locator('video[src]')).toHaveCount(0)
    cycles.push({ branch, outcome, sourceReleased: true })
    await handle.dispose()
  }
  expect(errors).toEqual([])
  const evidence = JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      pilotEnabled,
      actualDecodingVerified: pilotEnabled,
      cycles,
      actualPhysicalDevice: false,
      limitation:
        'Browser lifecycle capture. End cycles seek near the end; this is not a full-duration or physical-device performance baseline.',
    },
    null,
    2
  )
  const auditDirectory = new URL('../../renders/premium-presentation-audit/', import.meta.url)
  await mkdir(auditDirectory, { recursive: true })
  const reportName = `twin-${testInfo.project.name.replace(/[^a-z0-9-]/gi, '-')}-${pilotEnabled ? 'video' : 'fallback'}-${Date.now()}.json`
  await writeFile(new URL(reportName, auditDirectory), `${evidence}\n`, 'utf8')
  await testInfo.attach('twin-browser-lifecycle-evidence', {
    body: evidence,
    contentType: 'application/json',
  })
})
