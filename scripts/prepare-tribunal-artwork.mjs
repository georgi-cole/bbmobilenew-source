// Run after updating the existing cutout art. Chromium is used only as an
// offline WebP encoder here; no canvas or browser dependency ships in gameplay.
import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
  const folder = 'public/assets/tribunal/characters'
  await mkdir(folder, { recursive: true })
  const cutouts = (await readdir('public/assets/Informal_attires'))
    .filter((file) => /\.(png|webp)$/i.test(file))
    .sort()
    .map((file) => `public/assets/Informal_attires/${file}`)
  cutouts.push(
    ...['male', 'female', 'neutral'].map(
      (gender) => `public/assets/full_body_fallback_${gender}.png`
    )
  )
  const manifest = {}
  async function encode(source, target, width, height) {
    const input = await readFile(source)
    const extension = path.extname(source).slice(1)
    const encoded = await page.evaluate(
      async ({ data, width, height }) => {
        const image = new Image()
        image.src = data
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = image.width
        sourceCanvas.height = image.height
        const sourceContext = sourceCanvas.getContext('2d')
        sourceContext.drawImage(image, 0, 0)
        const pixels = sourceContext.getImageData(0, 0, image.width, image.height).data
        let left = image.width,
          right = 0,
          top = image.height,
          bottom = 0
        for (let y = 0; y < image.height; y++) {
          for (let x = 0; x < image.width; x++) {
            if (pixels[(y * image.width + x) * 4 + 3] < 12) continue
            left = Math.min(left, x)
            right = Math.max(right, x)
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
        }
        const sourceWidth = Math.max(1, right - left + 1)
        const sourceHeight = Math.max(1, bottom - top + 1)
        const scale = Math.min((width - 4) / sourceWidth, (height - 4) / sourceHeight)
        const w = sourceWidth * scale,
          h = sourceHeight * scale
        context.drawImage(
          image,
          left,
          top,
          sourceWidth,
          sourceHeight,
          (width - w) / 2,
          height - h - 2,
          w,
          h
        )
        return canvas.toDataURL('image/webp', 0.82).split(',')[1]
      },
      { data: `data:image/${extension};base64,${input.toString('base64')}`, width, height }
    )
    const output = Buffer.from(encoded, 'base64')
    await writeFile(target, output)
    return output.length
  }
  let bytes = 0
  for (const source of cutouts) {
    const filename = `${path.parse(source).name}.webp`
    try {
      bytes += await encode(source, `${folder}/${filename}`, 240, 360)
      manifest[path.basename(source)] = `assets/tribunal/characters/${filename}`
    } catch {
      const formal = `public/assets/formal_attires/${path.basename(source).replace(/_informal.*$/i, '_formal.png')}`
      if (!existsSync(formal)) throw new Error(`Undecodable source without fallback: ${source}`)
      bytes += await encode(formal, `${folder}/${filename}`, 240, 360)
      manifest[path.basename(source)] = `assets/tribunal/characters/${filename}`
      console.warn(`Using the existing formal cutout for ${path.basename(source)}.`)
    }
  }
  const roomBytes = await encode(
    'public/assets/diary-room/tribunal-sequester.webp',
    'public/assets/tribunal/sequester.webp',
    480,
    720
  )
  await writeFile(
    'src/components/TribunalDecisionCinematic/artwork.json',
    JSON.stringify(manifest, null, 2) + '\n'
  )
  console.log(
    `${cutouts.length} cutouts: ${Math.round(bytes / 1024)} KiB total; room: ${Math.round(roomBytes / 1024)} KiB. Each scene loads at most five cutouts.`
  )
} finally {
  await browser.close()
}
