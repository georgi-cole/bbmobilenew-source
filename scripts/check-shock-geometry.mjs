import { build } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'

// Exercise the real shadow-root renderer, approved CSS, masks and decoded art.
// Route local assets in-process so the diagnostic also works without localhost.
// This is browser evidence, not a replacement for the final WKWebView smoke test.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, 'test-results/shock-geometry')
await mkdir(output, { recursive: true })
const bundle = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  define: { 'import.meta.env.BASE_URL': JSON.stringify('https://cinema.test/') },
  build: {
    write: false,
    lib: {
      entry: resolve(root, 'src/cinematic/ceremonies/renderer.js'),
      name: 'ShockGeometry',
      formats: ['iife'],
    },
  },
})
const chunk = (Array.isArray(bundle) ? bundle : [bundle])
  .flatMap((result) => result.output ?? [])
  .find((entry) => entry.type === 'chunk')
assert(chunk, 'Renderer bundle must contain executable code')
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((candidate) => candidate && existsSync(candidate))
const browser = await chromium.launch({ headless: true, executablePath })
const records = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('https://cinema.test/**', async (route) => {
    const publicRoot = resolve(root, 'public')
    const file = resolve(
      publicRoot,
      decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
    )
    if (!file.startsWith(publicRoot + sep) || !existsSync(file)) return route.abort()
    await route.fulfill({ body: await readFile(file), contentType: 'image/webp' })
  })
  await page.setContent('<base href="https://cinema.test/"><style>body{margin:0}</style>')
  await page.addScriptTag({ content: chunk.code })
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
    { width: 390, height: 667 },
  ]) {
    await page.setViewportSize(viewport)
    for (const variant of ['democracia', 'depression', 'twinShock', 'doubleEviction', 'generic']) {
      await page.evaluate(async (variant) => {
        window.geometryClip?.stop()
        // Shock scenes use shared art, with no contestant portraits. The real
        // resource planner still requires the standard cast shape.
        const pose = { src: '', width: 1, height: 1 }
        const actor = {
          id: 'geometry-fixture',
          name: 'Geometry fixture',
          poses: Object.fromEntries(
            [
              'front',
              'safety-knight',
              'decision-back',
              'exit-back',
              'royal-seated',
              'royal-standing',
            ].map((key) => [key, pose])
          ),
        }
        window.geometryClip = window.ShockGeometry.createClip()
        await window.geometryClip.prepare('shock', { a: actor, b: actor, c: actor }, variant)
        window.geometryClip.mount(
          document.body,
          () => {},
          () => {},
          variant,
          { retainLastFrame: true }
        )
        window.geometryClip.pause()
      }, variant)
      for (const time of [220, 1400, 3300, 4650, 6000, 8000]) {
        const frame = await page.evaluate(async (time) => {
          const host = document.querySelector('.game-sample-film')
          const shadow = host.shadowRoot
          for (const animation of shadow.getAnimations()) {
            animation.pause()
            animation.currentTime = time
          }
          await new Promise(requestAnimationFrame)
          const geometry = (node) => {
            const rect = node.getBoundingClientRect()
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          }
          const layers = Object.fromEntries(
            ['.stage', '.shock-lens', '.shock-wall', '.shock-iris'].map((selector) => [
              selector,
              geometry(shadow.querySelector(selector)),
            ])
          )
          const image = shadow.querySelector('.shock-wall')
          return {
            host: geometry(host),
            layers,
            image: { src: image.src, width: image.naturalWidth, height: image.naturalHeight },
            visualViewport: {
              width: visualViewport.width,
              height: visualViewport.height,
              top: visualViewport.offsetTop,
            },
          }
        }, time)
        const label = `${variant} ${viewport.width}x${viewport.height} at ${time}ms`
        assert.equal(frame.host.y, 0, `${label}: host starts at viewport origin`)
        assert.equal(frame.layers['.stage'].y, 0, `${label}: stage starts at viewport origin`)
        assert.equal(frame.host.height, viewport.height, `${label}: host covers viewport`)
        assert.equal(frame.image.width, 720, `${label}: correct shared art decoded`)
        assert.equal(frame.image.height, 1080, `${label}: correct shared art decoded`)
        // Camera recoil rotates the lens before 580ms. After that the art plane
        // must preserve the mask's native 2:3 ratio and the iris's authored center.
        if (time >= 1400) {
          const lens = frame.layers['.shock-lens'],
            wall = frame.layers['.shock-wall'],
            iris = frame.layers['.shock-iris']
          assert(
            Math.abs(lens.width / lens.height - 2 / 3) < 0.001,
            `${label}: mask cannot letterbox`
          )
          assert(
            wall.y <= 0 && wall.y + wall.height >= viewport.height,
            `${label}: wall covers height`
          )
          const eyeX = lens.x + lens.width * 0.5,
            eyeY = lens.y + lens.height * (385 / 1500)
          assert(
            Math.abs(iris.x + iris.width / 2 - eyeX) < 0.75,
            `${label}: iris aligns horizontally`
          )
          assert(
            Math.abs(iris.y + iris.height / 2 - eyeY) < 0.75,
            `${label}: iris aligns vertically`
          )
        }
        records.push({ variant, viewport, time, ...frame })
        if (time === 4650)
          await page.screenshot({
            path: resolve(output, `${variant}-${viewport.width}x${viewport.height}.png`),
          })
      }
    }
  }
  assert.deepEqual(errors, [], 'Actual renderer must not throw browser errors')
  await writeFile(resolve(output, 'geometry.json'), JSON.stringify(records, null, 2))
  console.log(`${records.length} actual-renderer frames passed; evidence in ${output}`)
} finally {
  await browser.close()
}
