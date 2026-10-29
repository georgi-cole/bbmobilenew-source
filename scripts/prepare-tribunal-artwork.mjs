// Offline preparation only: reuse the published cast; no pixel processing in gameplay.
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ].find(existsSync)
    : undefined)
const sources = (await readdir('public/assets/Informal_attires'))
  .filter((name) => /\.(png|webp)$/i.test(name))
  .map((name) => 'assets/Informal_attires/' + name)
for (let number = 1; number <= 35; number++) {
  sources.push('assets/player_characters/character ' + number + '/casual.webp')
}
const manifest = {}
let totalBytes = 0
const browser = await chromium.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage()
  await mkdir('public/assets/tribunal/cast', { recursive: true })
  for (const source of sources.sort()) {
    const input = await readFile('public/' + source)
    const result = await page.evaluate(
      async (data) => {
        const image = new Image()
        image.src = data
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        const { width, height } = pixels
        // Label opaque islands so isolated border noise cannot determine the crop.
        const labels = new Int32Array(width * height)
        const queue = new Int32Array(labels.length)
        const sizes = [0]
        for (let index = 0; index < labels.length; index++) {
          if (labels[index] || pixels.data[index * 4 + 3] < 32) continue
          const label = sizes.length
          let start = 0
          let end = 1
          queue[0] = index
          labels[index] = label
          while (start < end) {
            const at = queue[start++]
            const x = at % width
            const neighbors = [at - width, at + width]
            if (x > 0) neighbors.push(at - 1)
            if (x < width - 1) neighbors.push(at + 1)
            for (const next of neighbors) {
              if (next < 0 || next >= labels.length || labels[next]) continue
              if (pixels.data[next * 4 + 3] < 32) continue
              labels[next] = label
              queue[end++] = next
            }
          }
          sizes.push(end)
        }
        const threshold = Math.max(...sizes) * 0.003
        let left = width,
          top = height,
          right = 0,
          bottom = 0
        for (let index = 0; index < labels.length; index++) {
          if (!labels[index] || sizes[labels[index]] < threshold) {
            pixels.data[index * 4 + 3] = 0
            continue
          }
          const x = index % width
          const y = Math.floor(index / width)
          left = Math.min(left, x)
          right = Math.max(right, x)
          top = Math.min(top, y)
          bottom = Math.max(bottom, y)
        }
        if (right <= left || bottom <= top) throw new Error('Empty cutout')
        context.putImageData(pixels, 0, 0)
        const output = document.createElement('canvas')
        const scale = Math.min(600 / (bottom - top + 1), 400 / (right - left + 1))
        output.width = Math.max(1, Math.round((right - left + 1) * scale))
        output.height = Math.max(1, Math.round((bottom - top + 1) * scale))
        output
          .getContext('2d')
          .drawImage(
            canvas,
            left,
            top,
            right - left + 1,
            bottom - top + 1,
            0,
            0,
            output.width,
            output.height
          )
        return {
          data: output.toDataURL('image/webp', 0.84).split(',')[1],
          width: output.width,
          height: output.height,
        }
      },
      'data:image/' +
        (source.endsWith('.png') ? 'png' : 'webp') +
        ';base64,' +
        input.toString('base64')
    )
    const bytes = Buffer.from(result.data, 'base64')
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
    const file = 'assets/tribunal/cast/' + hash + '.webp'
    await writeFile('public/' + file, bytes)
    manifest[source] = { file, width: result.width, height: result.height }
    totalBytes += bytes.length
  }
  await writeFile('src/data/tribunalStageAssets.json', JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    sources.length +
      ' existing cutouts prepared; ' +
      Math.round(totalBytes / 1024) +
      ' KiB in total. Only the selected cast loads.'
  )
} finally {
  await browser.close()
}
