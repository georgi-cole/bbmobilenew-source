import { build } from 'vite'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, totalmem } from 'node:os'
import { format, resolveConfig } from 'prettier'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const label = option('label', 'current')
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple label')
const samples = Number(option('samples', '7'))
const cpuRate = Number(option('cpu-rate', '6'))
const fullApp = option('full-app', 'true') === 'true'
const skipBuild = option('skip-build', 'false') === 'true'
const diagnostics = option('diagnostics', 'false') === 'true'
const archives = Number(option('archives', '20'))
const profileCounts = option('counts', '1,2,3,5').split(',').map(Number)
if (
  !profileCounts.length ||
  profileCounts.some((count) => ![1, 2, 3, 5].includes(count)) ||
  new Set(profileCounts).size !== profileCounts.length
)
  throw new Error('Counts must be unique values from 1,2,3,5')
if (
  !Number.isInteger(samples) ||
  samples < 3 ||
  samples > 30 ||
  !Number.isFinite(cpuRate) ||
  cpuRate < 1 ||
  !Number.isInteger(archives) ||
  archives < 0 ||
  archives > 1000
)
  throw new Error('Invalid sample count or CPU rate')
const output = resolve(root, 'artifacts/profile-performance')
const buildDir = resolve(root, option('build-dir', 'artifacts/profile-performance/dist'))
if (!buildDir.startsWith(`${output}/`) && !buildDir.startsWith(`${output}\\`))
  throw new Error('Benchmark builds must stay inside artifacts/profile-performance')
await mkdir(output, { recursive: true })
if (!skipBuild)
  await build({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    mode: 'release',
    base: '/',
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      rollupOptions: {
        input: fullApp
          ? [resolve(root, 'index.html'), resolve(root, 'scripts/profile-performance/index.html')]
          : resolve(root, 'scripts/profile-performance/index.html'),
      },
    },
  })
if (option('build-only', 'false') === 'true') process.exit(0)
if (
  !existsSync(resolve(buildDir, 'scripts/profile-performance/index.html')) ||
  (fullApp && !existsSync(resolve(buildDir, 'index.html')))
)
  throw new Error('Build the benchmark before using --skip-build=true')
const server = createServer(async (request, response) => {
  try {
    let path = resolve(buildDir, `.${new URL(request.url, 'http://localhost').pathname}`)
    if (!path.startsWith(`${buildDir}/`) && !path.startsWith(`${buildDir}\\`))
      throw new Error('Invalid path')
    if (!existsSync(path)) {
      const publicRoot = resolve(root, 'public')
      path = resolve(publicRoot, `.${new URL(request.url, 'http://localhost').pathname}`)
      if (!path.startsWith(`${publicRoot}/`) && !path.startsWith(`${publicRoot}\\`))
        throw new Error('Invalid asset path')
    }
    if (!(await stat(path)).isFile()) throw new Error('Missing file')
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[extname(path)] ?? 'application/octet-stream'
    )
    response.setHeader(
      'Cache-Control',
      extname(path) === '.html' ? 'no-store' : 'public, max-age=3600'
    )
    response.end(await readFile(path))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
const url = `http://127.0.0.1:${server.address().port}/scripts/profile-performance/index.html`
const appUrl = `http://127.0.0.1:${server.address().port}/index.html`
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find(existsSync)
const browser = await chromium.launch({ executablePath, headless: true })
const results = []
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
try {
  for (let sample = 0; sample < samples; sample += 1) {
    // Rotate the order to reduce warm-cache and thermal/order bias.
    const counts = profileCounts
    const order = [
      ...counts.slice(sample % counts.length),
      ...counts.slice(0, sample % counts.length),
    ]
    for (const count of order) {
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(url)
      await page.waitForFunction(() => window.profileBenchmark)
      const fixture = await page.evaluate((fixture) => window.profileBenchmark.seed(fixture), {
        count,
        archives,
      })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
      await page.reload()
      await page.waitForFunction(() => window.profileBenchmark)
      const startup = await page.evaluate(() => ({
        ...window.profileBenchmark.startup,
        ...window.profileBenchmark.diagnostics(),
      }))
      await cdp.send('HeapProfiler.collectGarbage')
      const startupHeap = await cdp.send('Runtime.getHeapUsage')
      const resume = await page.evaluate(() => window.profileBenchmark.resume())
      await cdp.send('HeapProfiler.collectGarbage')
      const resumedHeap = await cdp.send('Runtime.getHeapUsage')
      const autosave = await page.evaluate(() => window.profileBenchmark.autosave())
      if (errors.length) throw new Error(errors.join('\n'))
      let app = null
      if (fullApp) {
        await page.close()
        const appPage = await context.newPage()
        appPage.on('pageerror', (error) => errors.push(error.message))
        const appCdp = await context.newCDPSession(appPage)
        await appPage.addInitScript(() => {
          let seed = 0x4f1bbcdc
          Math.random = () => {
            let value = (seed += 0x6d2b79f5)
            value = Math.imul(value ^ (value >>> 15), value | 1)
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296
          }
          sessionStorage.setItem('bb:homeHubSplashShownThisSession', 'true')
          localStorage.setItem('bb:allowLocation', 'denied')
          localStorage.setItem('bb:enableSound', 'denied')
          localStorage.setItem('bbmobilenew_season_tutorial_v1:benchmark-player-1', 'done')
          localStorage.setItem(
            'bbmobilenew:player-safety:v1',
            JSON.stringify({
              version: 1,
              ageBand: 'adult',
              guardianPlayPermission: false,
              optionalFeatures: {
                location: false,
                analytics: false,
                onlineServices: false,
                ads: false,
              },
            })
          )
          HTMLMediaElement.prototype.play = () => Promise.resolve()
        })
        await appPage.goto(appUrl, { waitUntil: 'domcontentloaded' })
        await appPage
          .getByRole('navigation', { name: 'Main menu', exact: true })
          .waitFor({ timeout: 60000 })
        await appCdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
        if (diagnostics) {
          await appCdp.send('Profiler.enable')
          await appCdp.send('Profiler.start')
        }
        await appPage.reload({ waitUntil: 'domcontentloaded' })
        await appPage
          .getByRole('navigation', { name: 'Main menu', exact: true })
          .waitFor({ timeout: 60000 })
        const readyMs = await appPage.evaluate(() => performance.now())
        const startupProfile = diagnostics ? await appCdp.send('Profiler.stop') : null
        await appCdp.send('HeapProfiler.collectGarbage')
        const appHeap = await appCdp.send('Runtime.getHeapUsage')
        if (diagnostics) await appCdp.send('Profiler.start')
        const playStarted = await appPage.evaluate(() => performance.now())
        await appPage
          .getByRole('navigation', { name: 'Main menu', exact: true })
          .getByRole('button', { name: 'Play', exact: true })
          .click()
        const resumeStarted = await appPage.evaluate(() => performance.now())
        await appPage.getByRole('button', { name: 'Continue Last', exact: true }).click()
        const clickFinishedMs = diagnostics
          ? await appPage.evaluate((began) => performance.now() - began, resumeStarted)
          : null
        await appPage
          .getByRole('navigation', { name: 'Main navigation', exact: true })
          .waitFor({ timeout: 60000 })
        const uiResumeMs = await appPage.evaluate(
          (began) => performance.now() - began,
          resumeStarted
        )
        const fullEntryMs = await appPage.evaluate(
          (began) => performance.now() - began,
          playStarted
        )
        if (diagnostics) {
          const resumeProfile = await appCdp.send('Profiler.stop')
          const resources = await appPage.evaluate(() =>
            performance.getEntriesByType('resource').map((entry) => ({
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
              bytes: entry.encodedBodySize,
            }))
          )
          const diagnosticDir = resolve(output, 'diagnostics/dist')
          await mkdir(diagnosticDir, { recursive: true })
          await writeFile(
            resolve(diagnosticDir, `${label}-${count}-${sample}.json`),
            JSON.stringify({
              startupProfile,
              resumeProfile,
              resources,
              readyMs,
              uiResumeMs,
              fullEntryMs,
              clickFinishedMs,
            })
          )
        }
        await appCdp.send('HeapProfiler.collectGarbage')
        const gameHeap = await appCdp.send('Runtime.getHeapUsage')
        app = {
          readyMs,
          uiResumeMs,
          fullEntryMs,
          startupJsHeapBytes: appHeap.usedSize,
          resumedJsHeapBytes: gameHeap.usedSize,
        }
      }
      if (errors.length) throw new Error(errors.join('\n'))
      results.push({
        sample,
        count,
        fixture,
        startup,
        startupJsHeapBytes: startupHeap.usedSize,
        resumedJsHeapBytes: resumedHeap.usedSize,
        ...resume,
        autosave,
        app,
      })
      console.log(
        `${label}: sample ${sample + 1}/${samples}, ${count} profiles: storage startup ${startup.persistenceStartupMs.toFixed(1)} ms, resume ${resume.resumeMs.toFixed(1)} ms${app ? `; visible startup ${app.readyMs.toFixed(1)} ms, visible resume ${app.uiResumeMs.toFixed(1)} ms` : ''}`
      )
      await context.close()
    }
  }
  const summary = profileCounts.map((count) => {
    const rows = results.filter((row) => row.count === count)
    return {
      profiles: count,
      persistenceStartupMedianMs: percentile(
        rows.map((row) => row.startup.persistenceStartupMs),
        0.5
      ),
      runtimeStartupMedianMs: percentile(
        rows.map((row) => row.startup.runtimeStartupMs),
        0.5
      ),
      resumeMedianMs: percentile(
        rows.map((row) => row.resumeMs),
        0.5
      ),
      resumeRangeMs: [
        Math.min(...rows.map((row) => row.resumeMs)),
        Math.max(...rows.map((row) => row.resumeMs)),
      ],
      autosaveSyncP95Ms: percentile(
        rows.flatMap((row) => row.autosave.synchronousMs),
        0.95
      ),
      autosaveFlushP95Ms: percentile(
        rows.flatMap((row) => row.autosave.flushMs),
        0.95
      ),
      autosaveFrameGapP95Ms: percentile(
        rows.flatMap((row) => row.autosave.frameGapsMs),
        0.95
      ),
      startupJsHeapMedianBytes: percentile(
        rows.map((row) => row.startupJsHeapBytes),
        0.5
      ),
      resumedJsHeapMedianBytes: percentile(
        rows.map((row) => row.resumedJsHeapBytes),
        0.5
      ),
      cachedBytes: rows[0].startup.cachedBytes,
      fixtureBytes: rows[0].fixture.bytes,
      ...(fullApp
        ? {
            appReadyMedianMs: percentile(
              rows.map((row) => row.app.readyMs),
              0.5
            ),
            appResumeMedianMs: percentile(
              rows.map((row) => row.app.uiResumeMs),
              0.5
            ),
            appFullEntryMedianMs: percentile(
              rows.map((row) => row.app.fullEntryMs),
              0.5
            ),
            appStartupJsHeapMedianBytes: percentile(
              rows.map((row) => row.app.startupJsHeapBytes),
              0.5
            ),
            appResumedJsHeapMedianBytes: percentile(
              rows.map((row) => row.app.resumedJsHeapBytes),
              0.5
            ),
          }
        : {}),
    }
  })
  const report = {
    label,
    measuredAt: new Date().toISOString(),
    environment: {
      browser: browser.version(),
      hostCpu: cpus()[0]?.model,
      hostRamBytes: totalmem(),
      cpuRate,
      samples,
      fullApp,
      viewport: '360x800',
      build: 'production app and separate production runtime harness',
      fixture: `two generated populated run slots per profile; 400 feed entries per slot; ${archives} completed seasons and 100 wallet records per profile`,
      limitations:
        'CPU throttling is not physical low-end hardware. Heap is JavaScript only; excludes native/GPU/process RAM. Runtime startup measures storage and store imports. App startup waits for the visible main menu; app resume waits for gameplay navigation. Warm HTTP cache; fresh browser context per observation. Synthetic bounded-history fixtures are not a substitute for a long-season gameplay trace.',
    },
    summary,
    results,
  }
  const reportPath = resolve(output, `${label}.json`)
  await writeFile(
    reportPath,
    await format(JSON.stringify(report), { ...(await resolveConfig(reportPath)), parser: 'json' })
  )
  console.table(summary)
  console.log(`Report: ${reportPath}`)
} finally {
  await browser.close()
  await new Promise((resolveClosed) => server.close(resolveClosed))
}
