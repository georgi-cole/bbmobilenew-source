// Encode the approved cinematic stills; no canvas work runs in gameplay.
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sourceDirectory = process.argv[2]
if (!sourceDirectory)
  throw new Error('Usage: node scripts/prepare-tribunal-artwork.mjs <source-directory>')
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
  await mkdir('public/assets/tribunal', { recursive: true })
  for (const name of ['arrival-empty', 'arrival-one', 'arrival-two', 'departure']) {
    const source = await readFile(path.join(sourceDirectory, name + '.png'))
    const encoded = await page.evaluate(
      async (data) => {
        const image = new Image()
        image.src = data
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 960
        canvas.getContext('2d').drawImage(image, 0, 0, 640, 960)
        return canvas.toDataURL('image/webp', 0.82).split(',')[1]
      },
      'data:image/png;base64,' + source.toString('base64')
    )
    const bytes = Buffer.from(encoded, 'base64')
    const target = 'public/assets/tribunal/' + name + '-v2.webp'
    await writeFile(target, bytes)
    console.log(target + ': ' + Math.round(bytes.length / 1024) + ' KiB; decoded 2.34 MiB')
  }
} finally {
  await browser.close()
}
