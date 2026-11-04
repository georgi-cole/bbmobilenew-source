const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('@playwright/test')

const scenarios = [
  'ordinary',
  'halo',
  'force',
  'mission',
  'coLoh',
  'detox',
  'doubleTroubleOne',
  'doubleTroubleTwo',
  'doubleTroubleOriginals',
  'failedAmbush',
  'threePersonFinal',
  'voxOne',
  'voxMultiple',
  'cupid',
  'singleNominee',
  'singleVoxNominee',
  'coLohNominations',
  'allPower',
  'cupidPower',
  'dualPower',
  'dualTiebreak',
  'voxRankFive',
  'voxFive',
  'ambushControl',
]

async function main() {
  const outputDir = path.resolve(
    process.argv[2] ?? process.env.REPLACEMENT_REVIEW_DIR ?? 'artifacts/replacement-ceremonies'
  )
  const baseUrl = process.env.REPLACEMENT_REVIEW_URL ?? 'http://127.0.0.1:4324/bbmobilenew'
  await fs.mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const captures = []
  const errors = []

  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        recordVideo: { dir: outputDir, size: { width: 390, height: 844 } },
      })
      const recordingStartedAt = Date.now()
      const page = await context.newPage()
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('response', (response) => {
        if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
          pageErrors.push(`${response.status()} ${response.url()}`)
      })
      await page.goto(`${baseUrl}/tools/ceremony-replacements.html?capture=1&scenario=${scenario}`)
      await page.waitForFunction(
        () => window.replacementClip?.counts?.mounted || window.replacementError,
        null,
        {
          timeout: 30000,
        }
      )
      const failure = await page.evaluate(() => window.replacementError)
      if (failure) throw new Error(`${scenario}: ${failure}`)
      const durationMs = await page.evaluate(() => window.replacementDurationMs)
      const playback = await page.evaluate(() => ({
        elapsedMs: window.replacementClip.root.getAnimations()[0]?.currentTime ?? 0,
        metrics: window.replacementClip.metrics,
      }))
      const trimStartMs = Math.max(0, Date.now() - recordingStartedAt - playback.elapsedMs - 120)
      await page.waitForFunction(() => !window.replacementClip.counts.mounted, null, {
        timeout: durationMs + 5000,
      })
      await page.waitForTimeout(150)
      const released = await page.evaluate(() => window.replacementClip.counts)
      const video = page.video()
      await page.close()
      const filename = `${scenario}.webm`
      await video.saveAs(path.join(outputDir, filename))
      await context.close()
      if (pageErrors.length) errors.push({ scenario, errors: pageErrors })
      captures.push({
        scenario,
        filename,
        durationMs,
        trimStartMs,
        metrics: playback.metrics,
        released,
        pageErrors,
      })
      process.stdout.write(`${scenario}: ${filename}\n`)
    }
  } finally {
    await browser.close()
  }

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify({ viewport: '390x844', captures, errors }, null, 2)}\n`
  )
  if (errors.length)
    throw new Error(`Browser errors during ${errors.map((entry) => entry.scenario).join(', ')}`)
  process.stdout.write(`Created ${captures.length} review videos in ${outputDir}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
