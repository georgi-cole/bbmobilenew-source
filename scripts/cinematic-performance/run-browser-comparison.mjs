import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { platform, release, cpus, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPresentationSourceRefs } from './source-refs.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const option = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const runCount = Number(option('runs', '7'))
const cycleCount = Number(option('cycles', '20'))
const family = option('family', 'twin')
if (!['twin', 'credits'].includes(family)) throw new Error('Use --family=twin or credits')
if (![runCount, cycleCount].every((n) => Number.isInteger(n) && n > 0))
  throw new Error('Runs and cycles must be positive integers')
const captureId = `${family}-${new Date().toISOString().replace(/[:.]/g, '-')}`
const output = resolve(root, 'renders/premium-presentation-audit', captureId)
await mkdir(output, { recursive: true })
const {
  revision,
  baselineRef,
  baselineRevision,
  baselineSourcePaths: sourcePaths,
  candidateSourcePaths,
  publicPaths,
  candidateDirty,
} = readPresentationSourceRefs(root, option('baseline', 'origin/main'))
// Batch Git blobs avoid thousands of subprocesses. These are immutable baseline
// contents, including source files touched by unrelated generated-file hooks.
const blobs = spawnSync('git', ['cat-file', '--batch'], {
  cwd: root,
  input: sourcePaths.map((name) => `${baselineRevision}:${name}\n`).join(''),
  maxBuffer: 100 * 1024 * 1024,
})
if (blobs.status !== 0) throw new Error(blobs.stderr.toString())
const baseline = new Map()
let cursor = 0
for (const name of sourcePaths) {
  const lineEnd = blobs.stdout.indexOf(10, cursor)
  const header = blobs.stdout.subarray(cursor, lineEnd).toString()
  const size = Number(header.split(' ')[2])
  if (!Number.isFinite(size)) throw new Error(`Missing baseline blob: ${name}`)
  cursor = lineEnd + 1
  baseline.set(name, blobs.stdout.subarray(cursor, cursor + size))
  cursor += size + 1
}
const candidate = new Map()
for (const name of candidateSourcePaths) {
  if (existsSync(resolve(root, name))) candidate.set(name, await readFile(resolve(root, name)))
}
const baselinePublic = new Map()
const candidatePublic = new Map()
for (const name of publicPaths) {
  if (existsSync(resolve(root, name)))
    candidatePublic.set(name, await readFile(resolve(root, name)))
  const blob = spawnSync('git', ['show', `${baselineRevision}:${name}`], {
    cwd: root,
    maxBuffer: 100 * 1024 * 1024,
  })
  if (blob.status === 0) baselinePublic.set(name, blob.stdout)
}
const fingerprint = (sources, assets, sourceRevision) => {
  const hash = createHash('sha256').update(sourceRevision)
  for (const [name, bytes] of [...sources, ...assets].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name).update('\0').update(bytes).update('\0')
  }
  return hash.digest('hex')
}
const identities = {
  baseline: fingerprint(baseline, baselinePublic, baselineRevision),
  candidate: fingerprint(candidate, candidatePublic, revision),
  dependencies: createHash('sha256')
    .update(await readFile(resolve(root, 'package-lock.json')))
    .digest('hex'),
}
const recorder = await readFile(resolve(root, 'scripts/cinematic-performance/recorder.js'), 'utf8')
const fixtureStateSource = await readFile(
  resolve(root, 'scripts/cinematic-performance/fixture-state.mjs'),
  'utf8'
)
const instrumentationFingerprint = createHash('sha256')
  .update(recorder)
  .update(fixtureStateSource)
  .update(await readFile(resolve(root, 'scripts/cinematic-performance/source-refs.mjs')))
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex')
const selectors = {
  '.credits-container': 'credits',
  '.twin-intro': 'twin-shock-intro',
  '.twin-shock-reveal': 'twin-shock-reveal',
  '.tv-announcement-wrap': 'tv-announcement',
}
const annotateRoots = `(() => {
  const selectors = ${JSON.stringify(selectors)};
  const annotate = node => {
    if (!(node instanceof Element)) return;
    for (const [selector, name] of Object.entries(selectors)) {
      if (node.matches(selector)) node.dataset.presentationRoot = name;
      node.querySelectorAll(selector).forEach(root => root.dataset.presentationRoot = name);
    }
  };
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(annotate)))
    .observe(document, {childList:true, subtree:true});
})();`
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((name) => name && existsSync(name))
const servers = []
let browser
const log = (value) => console.log(JSON.stringify({ at: new Date().toISOString(), ...value }))

async function boundedDiagnostic(operation, label, timeoutMs = 5000) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms`)), timeoutMs)
        timer.unref()
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function frozenServer(variant, port) {
  const sources = variant === 'baseline' ? baseline : candidate
  const assets = variant === 'baseline' ? baselinePublic : candidatePublic
  const paths = new Map(
    [...sources].map(([name, bytes]) => [
      resolve(root, name).replaceAll('\\', '/'),
      bytes.toString('utf8'),
    ])
  )
  const server = await createServer({
    root,
    cacheDir: resolve(output, `vite-${variant}`),
    // Generated device packages and report pages are not fixture entry points.
    optimizeDeps: { entries: ['index.html'] },
    define: { 'import.meta.env.VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT': JSON.stringify('true') },
    plugins: [
      {
        name: 'frozen-performance-sources',
        enforce: 'pre',
        load(id) {
          if (
            id.split('?')[0].replaceAll('\\', '/') ===
            resolve(root, 'scripts/cinematic-performance/fixture-state.mjs').replaceAll('\\', '/')
          )
            return fixtureStateSource
          return paths.get(id.split('?')[0].replaceAll('\\', '/'))
        },
        transformIndexHtml: {
          order: 'pre',
          handler: () => sources.get('index.html').toString('utf8'),
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
            const name = `public/${pathname.replace(/^\/bbmobilenew\//, '').replace(/^\//, '')}`
            if (!publicPaths.includes(name)) return next()
            const bytes = assets.get(name)
            if (!bytes) {
              response.statusCode = 404
              response.end()
              return
            }
            response.setHeader(
              'Content-Type',
              name.endsWith('.mp4')
                ? 'video/mp4'
                : name.endsWith('.webp')
                  ? 'image/webp'
                  : 'application/json'
            )
            response.setHeader('Accept-Ranges', 'bytes')
            const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
            const start = range ? Number(range[1]) : 0
            const end =
              range && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
            if (start > end || start >= bytes.length) {
              response.statusCode = 416
              response.end()
              return
            }
            if (range) {
              response.statusCode = 206
              response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
            }
            response.setHeader('Content-Length', end - start + 1)
            response.end(bytes.subarray(start, end + 1))
          })
        },
      },
    ],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } },
  })
  await server.listen()
  servers.push(server)
  return `http://127.0.0.1:${port}/bbmobilenew/`
}

async function seedTwin(page, storeModuleUrl, branch, cycle) {
  return page.evaluate(
    async ({ storeModuleUrl, branch, cycle }) => {
      const base = new URL('./', location.href).href
      const { store } = await import(storeModuleUrl)
      const game = await import(`${base}src/store/gameSlice.ts`)
      const profiles = await import(`${base}src/store/profilesSlice.ts`)
      const { createFixtureInitialGameState } = await import(
        `${base}scripts/cinematic-performance/fixture-state.mjs`
      )
      store.dispatch(profiles.enterGuestMode())
      const initialState = createFixtureInitialGameState(game.createInitialGameState, 730)
      let state = initialState
      state = {
        ...state,
        gameId: `comparison-${branch}-${cycle}`,
        status: 'active',
        phase: 'eviction_results',
        week: 4,
        pendingEviction: null,
        voteResults: null,
        hasSeenConfessionalSpotlight: true,
        tvFeed: [],
        broadcastQueue: [],
        players: state.players.map((player) => ({
          ...player,
          status: player.id === 'lia' || player.isUser ? 'active' : player.status,
        })),
      }
      if (branch === 'combined') {
        state = game.default(state, game.advance())
        state = game.default(state, game.submitTwinShockAnswer('Maybe she has a twin sister?'))
      } else {
        const evictee = state.players.find((player) => !player.isUser && player.id !== 'lia')
        state = {
          ...state,
          week: 2,
          players: state.players.map((player) =>
            player.id === evictee.id
              ? {
                  ...player,
                  status: 'evicted',
                  evictedAtWeek: 1,
                  seasonPlacement: state.players.length,
                }
              : player
          ),
          twinShockConsumed: true,
          twinShockActivatedSeason: state.season,
          twinShock: {
            status: 'day4_asked_no_correct_guess',
            promptStage: null,
            queuedDay: 1,
            retryCount: 0,
            cluesShownDays: [],
            pendingRevealAnimation: null,
          },
        }
        state = game.default(state, game.advance())
        state = game.default(state, game.submitTwinShockAnswer('No idea'))
        state = game.default(state, game.submitTwinShockAnswer('I give up'))
      }
      if (state.twinShock?.pendingRevealAnimation?.type !== branch)
        throw new Error('Wrong Twin branch fixture')
      store.dispatch(game.hydrateGame(state))
      location.hash = '/game'
      return {
        initialSimulationSeed: initialState.seed,
        initialRosterIds: initialState.players.map((player) => player.id),
        resolvedRosterIds: state.players.map((player) => player.id),
        resolution: state.twinShockResolution,
      }
    },
    { storeModuleUrl, branch, cycle }
  )
}

async function gameplay(page, label) {
  await page.evaluate((label) => {
    window.__presentationPerf.beginSegment(label)
    location.hash =
      '/minigame-lab?game=quickTap&seed=730&players=4&skipRules=true&skipCountdown=false&quickTapVip=false'
  }, label)
  await expect(page.locator('.minigame-host-ready')).toBeVisible({ timeout: 15000 })
  const canvas = page.getByTestId('quick-tap-race-canvas')
  await expect(canvas).toBeVisible({ timeout: 15000 })
  for (let tap = 0; tap < 20; tap += 1) {
    await canvas.click()
    await page.waitForTimeout(150)
  }
  await expect(page.locator('.minigame-host-results')).toBeVisible({ timeout: 40000 })
  await page.evaluate(() => window.__presentationPerf.endSegment())
  await page.evaluate(() => {
    location.hash = '/'
  })
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
}

try {
  const urls = {
    baseline: 'http://127.0.0.1:4191/bbmobilenew/',
    candidate: 'http://127.0.0.1:4192/bbmobilenew/',
  }
  await writeFile(
    resolve(output, 'build-identities.json'),
    JSON.stringify({ revision, identities, urls, changedPublicAssets: publicPaths }, null, 2)
  )
  log({ event: 'frozen-sources-ready', output, revision, identities })
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  let serverVariant = null
  // Alternate the order between repetitions to reduce run-order bias. Captures
  // run sequentially: two competing browser workloads would distort frame data.
  const expectedRosters = new Map()
  const verifyFixture = (branch, fixture) => {
    expect(fixture.initialSimulationSeed).toBe(730)
    const identity = {
      initialRosterIds: fixture.initialRosterIds,
      resolvedRosterIds: fixture.resolvedRosterIds,
    }
    if (expectedRosters.has(branch)) expect(identity).toEqual(expectedRosters.get(branch))
    else expectedRosters.set(branch, identity)
  }
  for (let run = 1; run <= runCount; run += 1) {
    for (const variant of run % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
      if (serverVariant !== variant) {
        // Keep only one compiler/module graph alive. This occurs between browser
        // captures, without collecting or modifying the measured page's heap.
        while (servers.length) await servers.pop().close()
        if (typeof globalThis.gc === 'function') globalThis.gc()
        log({ event: 'compiler-released', hostMemory: process.memoryUsage() })
        await frozenServer(variant, variant === 'baseline' ? 4191 : 4192)
        serverVariant = variant
        log({ event: 'server-ready', variant, hostMemory: process.memoryUsage() })
      }
      const context = await browser.newContext({
        viewport: { width: 360, height: 800 },
        hasTouch: true,
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript({
        content: `sessionStorage.setItem('bb:homeHubSplashShownThisSession','true');localStorage.setItem('bbmobilenew_settings_v1',JSON.stringify({audio:{musicOn:false,sfxOn:false},gameUX:{animations:true}}));${annotateRoots}\n${recorder}`,
      })
      const label = `${family}-${variant}-${run}`
      let metadata = {
        label,
        sourceRevision: variant === 'baseline' ? baselineRevision : revision,
        baselineRef,
        baselineRevision,
        sourceFingerprint: identities[variant],
        instrumentationFingerprint,
        warmupReloadRetries: 0,
      }
      log({ event: 'run-started', label })
      try {
        await page.goto(urls[variant], { waitUntil: 'networkidle', timeout: 60000 })
        await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({
          timeout: 30000,
        })
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
        try {
          await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({
            timeout: 30000,
          })
        } catch (warmupError) {
          // Keep this bounded home-reload recovery outside the recorded
          // scene and gameplay sequence.
          metadata.warmupReloadRetries = 1
          log({ event: 'warmup-reload-retry', label, reason: String(warmupError) })
          await page.reload({ waitUntil: 'networkidle', timeout: 60000 })
          await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible({
            timeout: 30000,
          })
        }
        const storeModuleUrl = await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((url) => /\/src\/store\/store\.ts$/.test(new URL(url).pathname))
        )
        if (!storeModuleUrl) throw new Error('Missing app store module')
        metadata = {
          label,
          capturedAt: new Date().toISOString(),
          sourceRevision: variant === 'baseline' ? baselineRevision : revision,
          baselineRef,
          baselineRevision,
          sourceFingerprint: identities[variant],
          instrumentationFingerprint,
          dependencyFingerprint: identities.dependencies,
          warmupReloadRetries: metadata.warmupReloadRetries,
          workingTreeDirty: variant === 'candidate' && candidateDirty,
          device: `headless desktop browser; ${cpus()[0]?.model}; ${totalmem()} bytes RAM`,
          operatingSystem: `${platform()} ${release()}`,
          webviewOrBrowser: `Chromium ${browser.version()}`,
          fixtureAndSeed: `${family}; seed730; ${cycleCount} balanced normal/Skip sequences; QuickTap four players before/after`,
          fixtureIdentities: [],
          animationSettings: 'animations on; reduced motion off; music and SFX off',
          coldOrWarm: 'fresh context; home reloaded; first cinematic cold, subsequent cycles warm',
          thermalState: 'desktop thermals unobserved; alternating sequential runs',
          repeatedRunIndex: run,
          actualPhysicalDevice: false,
          buildKind: 'frozen Vite development source; React development runtime',
          fixtureServerPolicy: `one server at a time; entry=index.html; at most one home reload recovery before capture; locator main-world initialized before capture; Rust workers=${process.env.RAYON_NUM_THREADS ?? 'default'}; host GC=${typeof globalThis.gc === 'function' ? 'enabled' : 'default'}`,
          visibilityInterruption:
            'synthetic document.hidden/visibilitychange pair; not a native app background test',
          measurementLimitations:
            'Browser-only development comparison. No seeking/time acceleration. Frozen source and changed public assets; unchanged public assets use shared checkout. No native memory, decoder, heat or battery evidence.',
        }
        // Locator.evaluate installs Playwright's main-world event interceptors.
        // Initialize them symmetrically, before recording: only the video build
        // otherwise installs an extra set while evaluating its media element.
        await page.locator('body').evaluate((body) => body.isConnected)
        await page.evaluate((label) => window.__presentationPerf.start(label), label)
        await gameplay(page, 'gameplay-before')
        await page.evaluate(() => window.__presentationPerf.beginSegment('presentations'))
        for (let cycle = 0; cycle < cycleCount; cycle += 1) {
          const branch = cycle % 2 ? 'ali_enters' : 'combined'
          const outcome = cycle % 4 < 2 ? 'normal' : 'skip'
          let rootSelector
          if (family === 'twin') {
            const fixture = await seedTwin(page, storeModuleUrl, branch, cycle)
            metadata.fixtureIdentities.push({ cycle: cycle + 1, branch, ...fixture })
            verifyFixture(branch, fixture)
            rootSelector = '.twin-intro'
          } else {
            await page.evaluate(() => {
              location.hash = '/credits'
            })
            rootSelector = '.credits-container'
          }
          await expect(page.locator(rootSelector)).toBeVisible({ timeout: 15000 })
          if (variant === 'candidate' || family === 'credits') {
            const video = page.locator(`${rootSelector} video`)
            await expect
              .poll(
                () =>
                  video.evaluate(
                    (video) => video.readyState >= 2 && video.currentTime > 0 && !video.paused
                  ),
                { timeout: 5000 }
              )
              .toBe(true)
          }
          if (cycle === 2) {
            await page.evaluate(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true })
              document.dispatchEvent(new Event('visibilitychange'))
            })
            await page.waitForTimeout(750)
            await page.evaluate(() => {
              delete document.hidden
              document.dispatchEvent(new Event('visibilitychange'))
            })
          }
          if (outcome === 'skip') {
            await page.waitForTimeout(1000)
            await page.locator(`${rootSelector} button`).filter({ hasText: /Skip/ }).click()
          }
          await expect(page.locator(rootSelector)).toHaveCount(0, {
            timeout: family === 'credits' ? 65000 : 25000,
          })
          if (family === 'twin') {
            await expect
              .poll(
                () =>
                  page.evaluate(
                    async (url) =>
                      (await import(url)).store.getState().game.twinShock?.pendingRevealAnimation ??
                      null,
                    storeModuleUrl
                  ),
                { timeout: 8000 }
              )
              .toBeNull()
          }
          await page.waitForTimeout(300)
          log({ event: 'cycle-completed', label, cycle: cycle + 1, branch, outcome })
          await page.evaluate(() => {
            location.hash = '/'
          })
          await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
        }
        // Additional explicit route interruption, separate from the twenty
        // normal/Skip sequences. It must never be mistaken for a normal end.
        if (family === 'twin') {
          metadata.routeInterruptionFixture = await seedTwin(
            page,
            storeModuleUrl,
            'combined',
            cycleCount
          )
          verifyFixture('combined', metadata.routeInterruptionFixture)
        } else
          await page.evaluate(() => {
            location.hash = '/credits'
          })
        await expect(
          page.locator(family === 'twin' ? '.twin-intro' : '.credits-container')
        ).toBeVisible()
        await page.waitForTimeout(700)
        await page.evaluate(() => {
          location.hash = '/'
        })
        await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
        await page.evaluate(() => window.__presentationPerf.endSegment())
        await gameplay(page, 'gameplay-after')
        await page.waitForTimeout(1000)
        const captured = await page.evaluate(
          (metadata) => window.__presentationPerf.stop(metadata),
          metadata
        )
        const summary = captured.summary
        const checks = {
          fixtureSequences: cycleCount,
          expectedPresentationCycles: cycleCount * (family === 'twin' ? 2 : 1),
          enoughCycles: summary.presentationCycles >= cycleCount * (family === 'twin' ? 2 : 1),
          sawSkip: summary.skippedPresentations > 0,
          sawNormalCompletion: summary.normallyCompletedPresentations > 0,
          sawRouteExit: summary.routeExits > 0,
          sawBackgroundResume:
            summary.backgroundTransitions > 0 && summary.foregroundTransitions > 0,
          noActivePresentationRootsAtEnd: summary.endResources.activePresentationRoots === 0,
          noActivePresentationVideosAtEnd: summary.endResources.activePresentationVideos === 0,
          noAttachedPresentationVideoSourcesAtEnd:
            summary.endResources.attachedPresentationVideoSources === 0,
          noPendingMediaPreparationAtEnd: summary.endResources.pendingMediaPreparation === 0,
        }
        await writeFile(
          resolve(output, `${label}.json`),
          JSON.stringify({ ...captured, checks, missingMetadata: [], errors }, null, 2)
        )
        log({ event: 'run-finished', label, checks, errors, summary, segments: captured.segments })
        if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
      } catch (error) {
        const screenshotError = await boundedDiagnostic(
          () => page.screenshot({ path: resolve(output, `${label}-failure.png`), timeout: 5000 }),
          'Failure screenshot'
        ).then(
          () => null,
          (screenshotError) => String(screenshotError)
        )
        const diagnostics = await boundedDiagnostic(
          () =>
            page.evaluate((metadata) => {
              const videos = [...document.querySelectorAll('video')].map((video) => ({
                testId: video.dataset.testid,
                source: video.getAttribute('src'),
                currentSource: video.currentSrc,
                readyState: video.readyState,
                networkState: video.networkState,
                currentTime: video.currentTime,
                paused: video.paused,
                ended: video.ended,
                errorCode: video.error?.code ?? null,
                errorMessage: video.error?.message ?? null,
              }))
              return {
                videos,
                route: `${location.pathname}${location.hash}`,
                documentReadyState: document.readyState,
                appRootChildren: document.getElementById('root')?.childElementCount ?? 0,
                serviceWorkerScript: navigator.serviceWorker?.controller?.scriptURL ?? null,
                recentResources: performance
                  .getEntriesByType('resource')
                  .filter((entry) => /^https?:/.test(entry.name))
                  .slice(-40)
                  .map((entry) => ({
                    path: new URL(entry.name).pathname,
                    durationMs: entry.duration,
                    responseStatus: entry.responseStatus ?? null,
                  })),
                visibility: document.visibilityState,
                motionClasses: document.body.className,
                presentationRoots: [...document.querySelectorAll('[data-presentation-root]')].map(
                  (root) => ({ name: root.dataset.presentationRoot, className: root.className })
                ),
                partialCapture: window.__presentationPerf.stop(metadata),
              }
            }, metadata),
          'Failure page diagnostics'
        ).catch((diagnosticError) => ({ unavailable: String(diagnosticError) }))
        await writeFile(
          resolve(output, `${label}-failure.json`),
          JSON.stringify(
            { message: String(error), metadata, errors, screenshotError, diagnostics },
            null,
            2
          )
        )
        throw error
      } finally {
        await boundedDiagnostic(() => context.close(), 'Context teardown').catch(async (error) => {
          await boundedDiagnostic(() => browser.close(), 'Forced browser teardown', 10000)
          throw error
        })
      }
    }
  }
  log({ event: 'capture-complete', output })
} finally {
  await boundedDiagnostic(() => browser?.close(), 'Browser teardown', 10000)
  for (const server of servers) {
    await boundedDiagnostic(() => server.close(), 'Fixture server teardown', 10000)
  }
}
