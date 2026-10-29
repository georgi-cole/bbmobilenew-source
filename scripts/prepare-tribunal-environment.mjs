// Encode approved generated masters offline. Transparency remains intact.
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const source = process.argv[2]
const selectedAsset = process.argv[3]
if (!source)
  throw new Error(
    'Usage: node scripts/prepare-tribunal-environment.mjs <source-directory> [asset-name]'
  )
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ].find(existsSync)
    : undefined)
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  for (const [name, width, height, trim, version = 'v4'] of [
    ['sequester-window', 800, 1000, false],
    ['farewell-set', 800, 1000, false],
    ['farewell-door', 240, 720, true],
    ['farewell-luggage', 200, 320, true],
    ['farewell-window', 800, 1000, false, 'v7'],
    ['phone-city', 0, 0, false, 'v8'],
    ['sequester-room', 600, 1300, false, 'v9'],
  ]) {
    if (selectedAsset && name !== selectedAsset) continue
    if (version !== 'v4' && !existsSync(path.join(source, name + '.png'))) continue
    const input = await readFile(path.join(source, name + '.png'))
    const encoded = await page.evaluate(
      async ({ data, width, height, trim, quality }) => {
        const image = new Image()
        image.src = data
        await image.decode()
        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = image.width
        sourceCanvas.height = image.height
        const context = sourceCanvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        let left = 0,
          top = 0,
          right = image.width - 1,
          bottom = image.height - 1
        if (trim) {
          const pixels = context.getImageData(0, 0, image.width, image.height).data
          left = image.width
          top = image.height
          right = 0
          bottom = 0
          for (let y = 0; y < image.height; y++)
            for (let x = 0; x < image.width; x++) {
              if (pixels[(y * image.width + x) * 4 + 3] < 64) continue
              left = Math.min(left, x)
              right = Math.max(right, x)
              top = Math.min(top, y)
              bottom = Math.max(bottom, y)
            }
        }
        const canvas = document.createElement('canvas')
        const scale = trim ? Math.min(width / (right - left + 1), height / (bottom - top + 1)) : 1
        canvas.width = trim ? Math.round((right - left + 1) * scale) : width || image.width
        canvas.height = trim ? Math.round((bottom - top + 1) * scale) : height || image.height
        canvas
          .getContext('2d')
          .drawImage(
            sourceCanvas,
            left,
            top,
            right - left + 1,
            bottom - top + 1,
            0,
            0,
            canvas.width,
            canvas.height
          )
        return canvas.toDataURL('image/webp', quality).split(',')[1]
      },
      {
        data: 'data:image/png;base64,' + input.toString('base64'),
        width,
        height,
        trim,
        quality: version === 'v8' ? 0.92 : 0.86,
      }
    )
    const bytes = Buffer.from(encoded, 'base64')
    await writeFile('public/assets/tribunal/' + name + '-' + version + '.webp', bytes)
    console.log(name + ': ' + Math.round(bytes.length / 1024) + ' KiB')
  }
} finally {
  await browser.close()
}
