// Run against a local dev server after replacing cutout artwork:
// node tools/measure-cutout-grounding.cjs http://127.0.0.1:5173/bbmobilenew/ [--check]
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('@playwright/test')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'src/utils/cutout-grounding.json')

async function main() {
  const base = process.argv[2]
  if (!base || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(base))
    throw new Error('Supply the local dev-server URL, including its base path.')
  const publicDir = path.join(root, 'public')
  const targets = new Set()
  for (const dir of ['Informal_attires', 'formal_attires'])
    for (const file of await fs.readdir(path.join(publicDir, 'assets', dir)))
      if (/\.(png|webp)$/i.test(file)) targets.add('assets/' + dir + '/' + file)
  for (const dir of await fs.readdir(path.join(publicDir, 'assets/player_characters')))
    for (const file of ['casual.webp', 'formal.webp']) {
      const relative = 'assets/player_characters/' + dir + '/' + file
      try {
        await fs.access(path.join(publicDir, relative))
        targets.add(relative)
      } catch {
        /* Not a character folder. */
      }
    }
  for (const sex of ['female', 'male', 'neutral'])
    targets.add('assets/full_body_fallback_' + sex + '.png')
  const catalog = JSON.parse(
    await fs.readFile(path.join(root, 'src/cinematic/ceremonies/cast.json'), 'utf8')
  )
  catalog.characters.forEach((actor) => targets.add(actor.poses.front.src))
  const browser = await chromium.launch({ headless: true })
  let measured
  try {
    const page = await browser.newPage()
    const measureUrl = base.replace(/\/?$/, '/') + '__cutout-measure__'
    await page.route(measureUrl, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' })
    )
    await page.goto(measureUrl)
    measured = await page.evaluate(
      async ({ base, targets }) => {
        const result = {}
        for (const relative of targets) {
          const image = new Image()
          await new Promise((resolve, reject) => {
            image.onload = resolve
            image.onerror = () => reject(new Error('Cannot decode ' + relative))
            image.src = new URL(relative, base).href
          })
          const canvas = document.createElement('canvas')
          canvas.width = Math.min(512, image.naturalWidth)
          canvas.height = Math.round((canvas.width * image.naturalHeight) / image.naturalWidth)
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let bottom = canvas.height
          for (let y = canvas.height - 1; y >= 0; y--) {
            let opaque = 0
            for (let x = 0; x < canvas.width; x++)
              if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) opaque++
            if (opaque > 1) {
              bottom = y + 1
              break
            }
          }
          result[relative] = {
            aspect: Number((image.naturalWidth / image.naturalHeight).toFixed(6)),
            feetY: Number((bottom / canvas.height).toFixed(6)),
          }
        }
        return result
      },
      { base: base.replace(/\/?$/, '/'), targets: [...targets].sort() }
    )
  } finally {
    await browser.close()
  }
  if (process.argv.includes('--check')) {
    const current = JSON.parse(await fs.readFile(output, 'utf8'))
    const stale = Object.keys(measured).filter(
      (key) =>
        !current[key] ||
        current[key].aspect !== measured[key].aspect ||
        Math.abs(current[key].feetY - measured[key].feetY) > 0.003
    )
    if (stale.length || Object.keys(current).length !== Object.keys(measured).length)
      throw new Error('Regenerate cutout feet: ' + stale.join(', '))
  } else await fs.writeFile(output, JSON.stringify(measured, null, 2) + '\n')
  console.log(
    'Measured ' +
      Object.keys(measured).length +
      ' cutout anchors; no runtime image scanning needed.'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
