// Use real browser media here. The shared E2E fixture deliberately mocks play().
import { expect, test } from '@playwright/test'

test('decodes credits and releases sources across 20 accelerated End/Skip cycles', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
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
  await page.goto('./#/credits')
  async function playTimedFixture() {
    await page.evaluate(() => {
      window.location.hash =
        '/minigame-lab?game=quickTap&seed=730&players=4&skipRules=true&skipCountdown=false&quickTapVip=false'
    })
    await expect(page.locator('.minigame-host-ready')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('video[src]')).toHaveCount(0)
    const canvas = page.getByTestId('quick-tap-race-canvas')
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    for (let tap = 0; tap < 20; tap += 1) await canvas.click()
    await expect(page.locator('.minigame-host-results')).toBeVisible({ timeout: 40_000 })
    await expect(page.locator('video[src]')).toHaveCount(0)
  }
  await playTimedFixture()
  const cycles: Array<{ outcome: string; released: boolean }> = []
  for (let cycle = 0; cycle < 20; cycle += 1) {
    await page.evaluate(() => {
      window.location.hash = '/credits'
    })
    const video = page.getByTestId('credits-background-video')
    await expect(video).toBeAttached()
    await expect
      .poll(
        () =>
          video.evaluate((element) => {
            const media = element as HTMLVideoElement
            return media.readyState >= 2 && media.currentTime > 0.1 && !media.paused
          }),
        { timeout: 10_000 }
      )
      .toBe(true)
    const handle = await video.elementHandle()
    if (!handle) throw new Error('Credits video disappeared before handoff')
    if (cycle === 0) {
      await video.evaluate((element) => {
        ;(element as HTMLVideoElement).currentTime = 46
      })
      await page.waitForTimeout(250)
      await expect(page.locator('.big-eye-credits__card--closing-part-two')).toBeVisible()
      await testInfo.attach('credits-live-closing-text', {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    }
    const outcome = cycle % 2 ? 'ended-after-seek' : 'skip'
    if (outcome === 'skip') await page.getByRole('button', { name: 'Skip credits' }).click()
    else
      await video.evaluate((element) => {
        const media = element as HTMLVideoElement
        media.currentTime = media.duration - 0.2
      })
    await expect(page.locator('.credits-container')).toHaveCount(0, { timeout: 10_000 })
    await expect
      .poll(() =>
        handle.evaluate(
          (element) => !element.hasAttribute('src') && (element as HTMLVideoElement).paused
        )
      )
      .toBe(true)
    cycles.push({ outcome, released: true })
    await handle.dispose()
  }
  await playTimedFixture()
  expect(errors).toEqual([])
  await testInfo.attach('browser-media-cleanup-evidence', {
    body: JSON.stringify(
      {
        cycles,
        actualPhysicalDevice: false,
        timedGameplayBeforeAndAfter:
          'Quick Tap Race; seed 730; four players; normal countdown; twenty taps; both reached results',
        limitation:
          'Browser lifecycle smoke with real decoding. End cycles seek near the end; this is not a full-duration performance or physical-device baseline.',
      },
      null,
      2
    ),
    contentType: 'application/json',
  })
})
