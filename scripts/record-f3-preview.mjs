import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const output = path.join(root, 'preview-export', 'recordings')
const raw = path.join(output, 'webm')
await mkdir(raw, { recursive: true })
const assets = {
  background: '/src/assets/finale/final-power-battle-backyard.webp',
  eye: '/public/assets/ceremonies/final-decision/token.webp',
  monitor: '/public/assets/ceremonies/final-decision/monitor.webp',
  mist: '/public/assets/ceremonies/vfx/natural-mist-v2.webp',
  contestants: {
    dex: '/public/assets/ceremonies/characters/dex/ceremony-front.webp',
    aria: '/public/assets/ceremonies/characters/aria/ceremony-front.webp',
    ash: '/public/assets/ceremonies/characters/ash/ceremony-front.webp',
  },
}
const types = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
}
const pageHtml = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/preview-export/preview/f3-preview.css"></head><body style="margin:0;background:#05040b"><script src="/preview-export/preview/f3-preview.js"></script></body></html>'
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(pageHtml)
      return
    }
    const file = path.resolve(root, '.' + pathname)
    if (!file.startsWith(root + path.sep)) throw new Error('Path outside build')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('Not a file')
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
    createReadStream(file).pipe(res)
  } catch (_error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
})
await new Promise((resolve) => server.listen(8079, '127.0.0.1', resolve))

const scenarios = [
  { name: 'Big_Eye_Final3_Part1_Signal_Hunt', part: 1, viewer: 'jury', winnerId: 'ash' },
  { name: 'Big_Eye_Final3_Part2_Sequence_Builder', part: 2, viewer: 'qualified', winnerId: 'aria' },
  { name: 'Big_Eye_Final3_Part3_Classic', part: 3, viewer: 'jury', winnerId: 'aria' },
  { name: 'Big_Eye_Final3_Part3_Vox', part: 3, viewer: 'jury', vox: true, winnerId: 'aria' },
]
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
let failed = false

try {
  for (const item of scenarios) {
    const errors = []
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      recordVideo: { dir: raw, size: { width: 390, height: 844 } },
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico'))
        errors.push('HTTP ' + response.status() + ' ' + response.url())
    })
    await page.addInitScript((data) => { window.__f3Assets = data }, assets)
    try {
      await page.goto('http://127.0.0.1:8079/', { waitUntil: 'load', timeout: 20000 })
      await page.waitForFunction(() => typeof window.__f3Start === 'function', null, { timeout: 10000 })
      const setup = await page.evaluate((args) => window.__f3Start(args), item)
      await page.waitForSelector('section.f3-broadcast[data-ready="true"]', { timeout: 25000 })
      const stage = await page.locator('.f3-broadcast')
      await page.waitForFunction(
        () => document.querySelector('.f3-broadcast')?.dataset.stage === 'live',
        null,
        { timeout: 15000 }
      )
      await page.screenshot({ path: path.join(output, item.name + '_live.png') })
      await page.waitForFunction(
        () => document.querySelector('.f3-broadcast')?.dataset.stage === 'handoff',
        null,
        { timeout: 85000 }
      )
      await page.waitForTimeout(2450)
      await page.screenshot({ path: path.join(output, item.name + '_closing.png') })
      await page.waitForFunction(() => window.__f3Done === true, null, { timeout: 15000 })
      await page.waitForTimeout(150)
      const status = await page.evaluate(() => ({ done: window.__f3Done, stage: document.querySelector('.f3-broadcast')?.dataset.stage }))
      const video = page.video()
      await context.close()
      const webm = await video.path()
      const mp4 = path.join(output, item.name + '.mp4')
      const audio = path.join(root, 'public', 'assets', 'music', 'final_three_week.mp3')
      const ff = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', webm, '-stream_loop', '-1', '-i', audio,
        '-filter_complex', '[1:a]volume=0.28[a]',
        '-map', '0:v:0', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4,
      ], { encoding: 'utf8', timeout: 120000 })
      if (ff.status !== 0) throw new Error('ffmpeg: ' + ff.stderr)
      const probe = spawnSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nokey=1:noprint_wrappers=1', mp4,
      ], { encoding: 'utf8' })
      if (probe.status !== 0) throw new Error('ffprobe: ' + probe.stderr)
      const evidence = { file: path.basename(mp4), scenario: setup, ...status, probe: probe.stdout.trim(), errors }
      console.log(JSON.stringify(evidence))
      if (!status.done || errors.length) throw new Error('Scene incomplete or browser errors')
    } catch (error) {
      console.error('CAPTURE FAILED ' + item.name + ': ' + error.stack)
      console.error(errors)
      failed = true
      await context.close().catch(() => {})
    }
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
if (failed) process.exitCode = 1
