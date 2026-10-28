import { build } from 'vite'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, 'test-results/release-performance')
const outDir = resolve(output, 'build')
assert(outDir.startsWith(output + sep))
const cpu = Number(process.env.PERFORMANCE_CPU_RATE ?? 1)
assert(Number.isFinite(cpu) && cpu >= 1)
const rows = [],
  errors = [],
  violations = []
const budget = (actual, limit, message) => {
  if (actual > limit) violations.push(`${message}: ${actual.toFixed(1)} > ${limit}`)
}
// This observer exists only in this disposable build. Normal release/native
// builds do not import the simulation fixture or expose mutable store access.
const observe = {
  name: 'release-performance-fixture',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return
    return (
      code +
      `
import * as perfGame from './store/gameSlice';
import * as perfSocial from './social/socialSlice';
import * as perfSettings from './store/settingsSlice';
import * as perfProfiles from './store/profilesSlice';
import * as perfChallenge from './store/challengeSlice';
import * as perfOpinion from './publicOpinion/publicOpinionSlice';
import * as perfPersistence from './store/saveStatePersistence';
import {getSnapshotSerializationDiagnostics as perfSerialization} from './store/snapshotSerialization';
import {socialAIDriver as perfDriver} from './social/socialAIDriver';
import {withRunAutosaveSuspended as perfSuspend} from './store/runAutosaveGate';
import {launchSeasonWithContestant as perfLaunch} from './modes/launchSeason';
import {simulateRealitySeason as perfSeason} from './social/realitySeasonSimulation';
import {getAllGames as perfGames} from './minigames/registry';
window.__releasePerf = {store,game:perfGame,social:perfSocial,settings:perfSettings,profiles:perfProfiles,challenge:perfChallenge,opinion:perfOpinion,persistence:perfPersistence,driver:perfDriver,suspend:perfSuspend,launch:perfLaunch,season:perfSeason,games:perfGames,serialization:perfSerialization};
`
    )
  },
}
await mkdir(output, { recursive: true })
await build({
  root,
  mode: 'release',
  logLevel: 'warn',
  plugins: [observe],
  build: { outDir, emptyOutDir: true, copyPublicDir: false, reportCompressedSize: false },
})
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
      /^\/bbmobilenew\/?/,
      '/'
    )
    if (!extname(path)) path = '/index.html'
    for (const base of [outDir, resolve(root, 'public')]) {
      const file = resolve(base, '.' + path)
      if (!file.startsWith(base + sep)) continue
      try {
        if (!(await stat(file)).isFile()) continue
        res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' })
        res.end(await readFile(file))
        return
      } catch {
        /* Try the public directory. */
      }
    }
    res.writeHead(404)
    res.end()
  } catch {
    res.writeHead(500)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
let browser
let runtimeErrorCount = 0
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PERFORMANCE_BROWSER_EXECUTABLE || undefined,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await context.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()
  )
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    runtimeErrorCount++
    if (errors.length < 64) errors.push(error.message)
  })
  await page.addInitScript(() => {
    const m = (window.__releaseMetrics = {
      active: false,
      startedAt: 0,
      tasks: [],
      frames: [],
      inputs: [],
      responses: [],
      pointerInputs: [],
      pointerResponses: [],
      clicks: [],
      epoch: 0,
      visibleAt: 0,
      frameCount: 0,
      maxFrame: 0,
      slowFrames: [],
    })
    for (const type of ['click', 'pointerdown'])
      document.addEventListener(
        type,
        (event) => {
          if (!m.active || document.hidden) return
          if (type === 'click' && m.clicks.length < 4096)
            m.clicks.push(event.target.closest?.('button')?.getAttribute('aria-label') ?? '')
          const at = event.timeStamp,
            epoch = m.epoch
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const responses = type === 'click' ? m.responses : m.pointerResponses
              if (m.active && !document.hidden && epoch === m.epoch && responses.length < 4096)
                responses.push(performance.now() - at)
            })
          )
        },
        true
      )
    new PerformanceObserver((l) => {
      if (m.active && !document.hidden)
        for (const e of l.getEntries())
          if (e.startTime >= Math.max(m.startedAt, m.visibleAt) && m.tasks.length < 4096)
            m.tasks.push(e.duration)
    }).observe({ type: 'longtask' })
    new PerformanceObserver((l) => {
      if (m.active && !document.hidden)
        for (const e of l.getEntries()) {
          const inputs = e.name === 'click' ? m.inputs : m.pointerInputs
          if (
            e.startTime >= Math.max(m.startedAt, m.visibleAt) &&
            (e.name === 'click' || e.name === 'pointerdown') &&
            e.interactionId &&
            inputs.length < 4096
          )
            inputs.push({ handler: e.processingEnd - e.processingStart, response: e.duration })
        }
    }).observe({ type: 'event', durationThreshold: 16 })
    let previous = 0
    const frame = (t) => {
      if (m.active && !document.hidden && previous) {
        const gap = t - previous
        if (gap >= 100 && m.slowFrames.length < 32)
          m.slowFrames.push({
            at: t - m.startedAt,
            gap,
            phase: window.__releasePerf?.store.getState().game.phase,
            round:
              document.querySelector('.qtr-vip__round-label')?.textContent?.trim() ??
              document.querySelector('.hoc-hud-stat strong')?.textContent?.trim(),
          })
        m.maxFrame = Math.max(m.maxFrame, gap)
        if (m.frames.length < 8192) m.frames.push(gap)
        else m.frames[m.frameCount % 8192] = gap
        m.frameCount++
      }
      previous = m.active && !document.hidden ? t : 0
      requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', () => {
      previous = 0
      m.epoch++
      m.visibleAt = performance.now()
    })
    requestAnimationFrame(frame)
  })
  await page.goto(`http://127.0.0.1:${port}/bbmobilenew/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__releasePerf)
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const a = window.__releasePerf,
      d = a.store.dispatch
    d(
      a.profiles.initProfiles({
        profiles: [
          {
            id: 'performance',
            name: 'Performance',
            avatar: '🧑',
            createdAt: new Date(0).toISOString(),
            bio: { age: '28', sex: 'Female' },
            eyeoleans: 2000,
            achievements: [],
          },
        ],
        activeProfileId: 'performance',
        isGuest: false,
      })
    )
    d(
      a.settings.setGameUX({
        dramaMode: true,
        dramaModeAdminOverride: true,
        castSize: 16,
        spectatorMode: false,
      })
    )
    d(a.settings.setAudio({ musicOn: true, sfxOn: true }))
    localStorage.setItem('bbmobilenew_season_tutorial_v1:performance', 'done')
    a.launch(
      d,
      'classic',
      { version: 1, name: 'Performance', avatar: '🧑', bio: { age: '28', sex: 'Female' } },
      []
    )
    a.driver.stop()
    window.__releaseBase = JSON.parse(JSON.stringify(a.store.getState()))
    location.hash = '/game'
  })
  const cdp = await context.newCDPSession(page)
  const start = async () => {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    await page.evaluate(() => {
      const m = window.__releaseMetrics
      m.tasks = []
      m.frames = []
      m.inputs = []
      m.frameCount = 0
      m.maxFrame = 0
      m.slowFrames = []
      m.responses = []
      m.pointerInputs = []
      m.pointerResponses = []
      m.clicks = []
      m.epoch++
      m.startedAt = performance.now()
      m.active = true
    })
  }
  const collect = async (name) => {
    await page.waitForTimeout(100)
    const row = await page.evaluate((name) => {
      const m = window.__releaseMetrics
      m.active = false
      const stats = (values) => {
        const sorted = [...values].sort((a, b) => a - b)
        return {
          count: sorted.length,
          p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
          max: sorted.at(-1) ?? 0,
        }
      }
      return {
        name,
        tasks: stats(m.tasks),
        frames: { ...stats(m.frames), max: m.maxFrame, total: m.frameCount },
        handlers: stats(m.inputs.map((x) => x.handler)),
        responses: stats(m.responses),
        nativeEventDuration: stats(m.inputs.map((x) => x.response)),
        pointerHandlers: stats(m.pointerInputs.map((x) => x.handler)),
        pointerResponses: stats(m.pointerResponses),
        nativePointerDuration: stats(m.pointerInputs.map((x) => x.response)),
        playClicks: m.clicks.filter((label) => label === 'Advance to next phase').length,
        targets: m.clicks.slice(0, 12),
        slowFrames: m.slowFrames,
        serialization: window.__releasePerf.serialization(),
        phase: window.__releasePerf.store.getState().game.phase,
        domNodes: document.getElementsByTagName('*').length,
      }
    }, name)
    rows.push(row)
    console.log(JSON.stringify(row))
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    return row
  }
  // Seeded Reality worlds stress retained late-season data without relying on
  // slow UI/debug shortcuts. Full gameplay equivalence is tested separately.
  for (const [name, days, active] of [
    ['early', 1, 16],
    ['late', 8, 10],
    ['final-three', 16, 3],
    ['long-run', 30, 16],
  ]) {
    await page.evaluate(() => {
      location.hash = '/'
    })
    await page.locator('.game-screen').waitFor({ state: 'detached' })
    await page.evaluate(
      ({ days, active }) => {
        const a = window.__releasePerf,
          d = a.store.dispatch,
          base = window.__releaseBase
        const report = a.season(424242, { days, castSize: 16 })
        const players = [
          base.game.players.find((p) => p.isUser),
          ...base.game.players.filter((p) => !p.isUser),
        ].map((p, i) => ({
          ...p,
          id: i === 0 ? 'human' : `ai-${i}`,
          isUser: i === 0,
          status: i < active ? 'active' : 'evicted',
        }))
        d(a.challenge.setPendingChallenge(null))
        d(
          a.game.hydrateGame({
            ...base.game,
            players,
            week: days,
            seed: 424242,
            phase: 'social_1',
            lohId: 'ai-1',
            nomineeIds: [],
            tvFeed: [],
            broadcastQueue: [],
          })
        )
        d(
          a.social.hydrateSocial({
            ...base.social,
            reality: report.domain,
            realitySimulation: report.simulation,
            relationships: {},
            actionHistory: [],
            energyBank: Object.fromEntries(players.map((player) => [player.id, 10])),
          })
        )
        d(
          a.social.commitRealityDomainUpdate({
            domain: report.domain,
            projectAllRelationships: true,
          })
        )
        a.driver.stop()
        d(a.game.clearBlockingFlags())
        const snapshot = a.persistence.createSavedSeasonSnapshot('performance', a.store.getState())
        if (!a.persistence.saveRunSnapshot('performance', snapshot)) throw new Error('Save failed')
        if (
          Object.values(report.domain.memoriesByOwner).some((m) => m.length > 160) ||
          report.domain.events.length > 500
        )
          throw new Error('Retention bound exceeded')
        location.hash = '/game'
      },
      { days, active }
    )
    await page.locator('.game-screen').waitFor()
    // Fixture construction allocates a whole synthetic season in one task.
    // Collect that preparation garbage before sampling actual gameplay work.
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(800)
    await start()
    for (let i = 0; i < 2; i++) {
      const play = page.getByRole('button', { name: 'Advance to next phase', exact: true })
      await play.waitFor({ timeout: 10000 })
      await play.tap({ timeout: 10000 })
      await page.waitForTimeout(300)
    }
    const row = await collect(name)
    assert.equal(row.playClicks, 2, `${name}: both taps must actually reach Play`)
    budget(row.handlers.max, 250, `${name}: Play handler`)
    budget(row.responses.max, 400, `${name}: Play response`)
    budget(row.frames.max, 400, `${name}: stalled frame`)
  }
  // Retained real-engine fixtures cover the actual AI/TV history that the pure
  // seasonal worlds above do not generate. Their profile and cast are synthetic.
  for (const day of [1, 8]) {
    const fixture = JSON.parse(
      gunzipSync(
        await readFile(
          resolve(root, `tests/fixtures/performance/classic-reality-day${day}.json.gz`)
        )
      )
    )
    assert.equal(fixture.synthetic, true)
    await page.evaluate(() => {
      location.hash = '/'
    })
    await page.locator('.game-screen').waitFor({ state: 'detached' })
    await page.evaluate((state) => {
      const a = window.__releasePerf,
        d = a.store.dispatch
      a.suspend(() => {
        d(a.challenge.setPendingChallenge(null))
        d(a.profiles.initProfiles(state.profiles))
        d(a.settings.importSettings(state.settings))
        d(a.game.hydrateGame(state.game))
        d(a.social.hydrateSocial(state.social))
        d(a.opinion.hydratePublicOpinion(state.publicOpinion))
      })
      a.driver.stop()
      localStorage.setItem('bbmobilenew_season_tutorial_v1:audit-player', 'done')
      location.hash = '/game'
    }, fixture.state)
    await page.locator('.game-screen').waitFor()
    await cdp.send('HeapProfiler.collectGarbage')
    await page.waitForTimeout(800)
    await start()
    await page.evaluate(() => window.__releasePerf.driver.start())
    await page.waitForFunction(() => !window.__releasePerf.driver.getStatus().running, undefined, {
      timeout: 60000,
    })
    const actions = await page.evaluate(
      () => window.__releasePerf.driver.getStatus().actionsExecuted
    )
    assert(actions > 0, `retained day ${day}: actual scheduled AI must execute`)
    const ai = await collect(`retained-day${day}-ai`)
    ai.actionsExecuted = actions
    budget(ai.frames.max, 250, `retained day ${day}: AI stalled frame`)
    await start()
    let lastPhase = await page.evaluate(() => window.__releasePerf.store.getState().game.phase)
    let phaseChanges = 0,
      taps = 0
    while (phaseChanges < 2 && taps < 10) {
      await page.getByRole('button', { name: 'Advance to next phase', exact: true }).tap()
      taps++
      await page.waitForTimeout(300)
      const phase = await page.evaluate(() => window.__releasePerf.store.getState().game.phase)
      if (phase !== lastPhase) {
        phaseChanges++
        lastPhase = phase
      }
    }
    const play = await collect(`retained-day${day}-play`)
    assert.equal(play.playClicks, taps)
    assert.equal(phaseChanges, 2, 'Retained-state Play must exercise two actual phase transitions')
    budget(play.handlers.max, 250, `retained day ${day}: Play handler`)
    budget(play.responses.max, 400, `retained day ${day}: Play response`)
    budget(play.frames.max, 400, `retained day ${day}: stalled frame`)
  }
  for (const key of ['cardClash', 'quickTap', 'quickTapVip', 'quickTapSeasons']) {
    // Clear prior phase effects before constructing a new competition. A player
    // cannot jump from an unfinished ceremony straight into another fixture.
    await page.evaluate(() => {
      location.hash = '/'
    })
    await page.locator('.game-screen').waitFor({ state: 'detached' })
    await page.evaluate((key) => {
      const a = window.__releasePerf,
        d = a.store.dispatch,
        base = window.__releaseBase
      d(a.challenge.setPendingChallenge(null))
      d(a.game.hydrateGame({ ...base.game, phase: 'loh_comp', pendingMinigame: null }))
      a.driver.stop()
      const premium = key === 'quickTapVip' || key === 'quickTapSeasons'
      d({
        type: 'vip/initialize/fulfilled',
        payload: {
          isActive: premium,
          entitlements: { premiumChallenges: premium, dramaMode: true },
          billingAvailable: false,
          products: {},
        },
      })
      const game = a.games().find((g) => g.key === (key === 'quickTapVip' ? 'quickTap' : key))
      d(
        a.challenge.setPendingChallenge({
          id: `perf-${key}`,
          game,
          seed: 424242,
          participants: base.game.players.map((p) => p.id),
          phase: 'rules',
          aiScores: {},
          prizeType: 'LOH',
        })
      )
      location.hash = '/game'
    }, key)
    await page.locator('.game-screen').waitFor()
    await start()
    await page.getByRole('button', { name: 'Start competition', exact: true }).click()
    await page.waitForTimeout(4000)
    const entry = await collect(`${key}-entry`)
    budget(entry.handlers.max, 250, `${key}: entry handler`)
    budget(entry.responses.max, 400, `${key}: entry response`)
    budget(entry.pointerResponses.max, 400, `${key}: entry pointer response`)
    budget(entry.frames.max, 400, `${key}: entry/countdown stalled frame`)
    if (key === 'cardClash') {
      await page.locator('.hoc-tool-choice--peek').click()
      await page.locator('.hoc-root[data-phase="playing"]').waitFor()
    }
    const target = page
      .locator(
        key === 'cardClash'
          ? '.hoc-card:not([disabled])'
          : key === 'quickTapVip' || key === 'quickTapSeasons'
            ? '.qtr-vip__tap-control'
            : 'canvas.qtr-canvas__canvas'
      )
      .first()
    await target.waitFor()
    const box = await target.boundingBox()
    assert(box)
    if (key === 'quickTapVip' || key === 'quickTapSeasons') {
      await page.getByRole('button', { name: 'Open minigame menu', exact: true }).click()
      await page.getByRole('menuitem', { name: /View rules/ }).click()
      await page.getByRole('button', { name: 'Return to game', exact: true }).click()
      await page.getByRole('button', { name: 'Open minigame menu', exact: true }).click()
      await page.getByRole('menuitem', { name: /Leave competition/ }).click()
      await page.getByRole('button', { name: 'Keep playing', exact: true }).click()
    }
    await start()
    let maxCardTiles = 0,
      exercisedMismatch = false
    if (key === 'cardClash') {
      const deadline = Date.now() + 120000
      while (Date.now() < deadline) {
        const tool = page.locator('.hoc-tool-choice--peek')
        if (await tool.isVisible()) {
          await tool.click()
          continue
        }
        const cards = page.locator('.hoc-board > .hoc-card')
        const board = await cards.evaluateAll((nodes) =>
          nodes.map((node, index) => ({
            index,
            key: node.querySelector('.hoc-card-front')?.textContent?.trim(),
            matched: node.dataset.matched === 'true',
          }))
        )
        if (board.length) {
          maxCardTiles = Math.max(maxCardTiles, board.length)
          const remaining = board.filter((card) => !card.matched)
          const first = remaining[0]
          if (first) {
            if (!(await cards.nth(first.index).isEnabled())) {
              await page.waitForTimeout(150)
              continue
            }
            const mismatch = board.length === 20 && !exercisedMismatch
            const second = remaining.find(
              (card) =>
                card.index !== first.index &&
                (mismatch ? card.key !== first.key : card.key === first.key)
            )
            assert(second, 'A remaining card needs a partner')
            await cards.nth(first.index).tap({ timeout: 10000 })
            await cards.nth(second.index).tap({ timeout: 10000 })
            if (mismatch) {
              exercisedMismatch = true
              await page.waitForTimeout(1600)
            } else await page.waitForTimeout(150)
            continue
          }
        }
        const next = page.getByRole('button', { name: 'Next round', exact: true })
        if (await next.isVisible()) {
          await next.click()
          continue
        }
        const opening = page.getByRole('button', { name: /Open the duel/i })
        if (await opening.isVisible()) {
          await opening.click()
          continue
        }
        if (
          await page
            .locator('.hoc-complete-title')
            .filter({ hasText: /wins Deck of Light/ })
            .count()
        )
          break
        await page.waitForTimeout(150)
      }
      assert(maxCardTiles >= 24, 'The card performance run must reach the portrait finale')
      assert(exercisedMismatch, 'The large card board must exercise a mismatch')
    } else if (key === 'quickTapVip' || key === 'quickTapSeasons') {
      const deadline = Date.now() + 100000,
        observedRounds = new Set()
      let attempts = 0
      while (Date.now() < deadline && (await page.locator('.qtr-vip__tap-control').count())) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.6)
        await page.waitForTimeout(70)
        if (attempts++ % 10 === 0 && (await page.locator('.qtr-vip__round-label').count()))
          observedRounds.add(await page.locator('.qtr-vip__round-label').innerText())
      }
      assert(
        [...observedRounds].some((label) => /3\s*\/\s*3/.test(label)),
        `${key}: all three rounds must run`
      )
      assert.equal(
        await page.locator('.qtr-vip__tap-control').count(),
        0,
        `${key}: the game must finish`
      )
    } else
      for (let i = 0; i < 40; i++) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.6)
        await page.waitForTimeout(70)
      }
    const row = await collect(key)
    if (key === 'cardClash') row.maxCardTiles = maxCardTiles
    budget(row.frames.p95, 80, `${key}: frame p95`)
    budget(row.frames.max, 250, `${key}: stalled frame`)
    budget(row.responses.max, 250, `${key}: input response`)
    assert(row.pointerResponses.count > 0, `${key}: actual pointer input must be sampled`)
    budget(row.pointerHandlers.max, 250, `${key}: pointer handler`)
    budget(row.pointerResponses.max, 250, `${key}: pointer response`)
    if (key === 'quickTapVip' || key === 'quickTapSeasons') {
      await page.locator('.qtr-vip__continue').click()
      await page.locator('.qtr-vip').waitFor({ state: 'detached' })
    } else {
      await page.evaluate(() => {
        window.__releasePerf.store.dispatch(
          window.__releasePerf.challenge.setPendingChallenge(null)
        )
      })
    }
    await page.waitForFunction(() => !document.body.classList.contains('minigame-portal-active'))
    await page.locator('.game-screen').waitFor({ state: 'visible' })
  }
  assert.deepEqual(errors, [], 'Browser runtime errors')
  assert.deepEqual(violations, [], 'Release performance budgets')
} finally {
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(
      { cpu, preparationGarbageCollected: true, rows, errors, runtimeErrorCount, violations },
      null,
      2
    )
  )
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
