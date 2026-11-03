const path = require('node:path')
const { chromium } = require('@playwright/test')

const captures = [
  { scenario: 'ordinary', filename: 'ordinary-decision.png', at: 0.3 },
  { scenario: 'ordinary', filename: 'ordinary.png', at: 0.9 },
  { scenario: 'detox', filename: 'detox.png', at: 0.9 },
  { scenario: 'voxOne', filename: 'vox.png', at: 0.9 },
  { scenario: 'cupid', filename: 'cupid.png', at: 0.9 },
]

async function main() {
  const outputDir = path.resolve(process.argv[2] ?? 'docs/screenshots/replacement-ceremonies')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  try {
    for (const capture of captures) {
      await page.goto(
        `http://127.0.0.1:4324/tools/ceremony-replacements.html?capture=1&scenario=${capture.scenario}`
      )
      await page.waitForFunction(() => window.replacementClip?.counts?.mounted, null, {
        timeout: 30000,
      })
      await page.evaluate((at) => {
        window.replacementClip.seek(Math.round(window.replacementDurationMs * at))
      }, capture.at)
      await page.waitForTimeout(100)
      await page.screenshot({ path: path.join(outputDir, capture.filename) })
      process.stdout.write(`${capture.filename}\n`)
    }
  } finally {
    await context.close()
    await browser.close()
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
