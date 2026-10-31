// Injected only by the isolated device-test builder, never by normal app builds.
import { createElement } from 'react'
import { store } from '/src/store/store.ts'
import * as game from '/src/store/gameSlice.ts'
import * as profiles from '/src/store/profilesSlice.ts'
import { router } from '/src/routes.tsx'
import MinigameLab from '/src/screens/MinigameLab/MinigameLab.tsx'
import { createFixtureInitialGameState } from '/scripts/cinematic-performance/fixture-state.mjs'

if (
  import.meta.env.VITE_BUILD_TARGET !== 'mobile-dev' ||
  import.meta.env.VITE_FEATURE_TWIN_SHOCK_DEVICE_TEST !== 'true'
) {
  throw new Error('Device fixtures require an isolated presentation test artifact')
}
const build = __PRESENTATION_DEVICE_TEST_META__
const parent = router.routes.find((route) => route.children?.some((child) => child.path === 'game'))
if (!parent) throw new Error('The app layout route was not found')
router.patchRoutes(parent.id, [
  { id: 'presentation-device-minigame', path: 'minigame-lab', element: createElement(MinigameLab) },
])

let recording = false
let busy = false
let cycleIndex = 0
let completedActions = 0
let activeScene = null
const cycles = []
const failures = []
const panel = document.createElement('aside')
panel.style.cssText =
  'position:fixed;left:6px;right:6px;bottom:max(6px,env(safe-area-inset-bottom));z-index:2147483000;background:#111827;color:white;padding:8px;border-radius:10px;font:12px system-ui;display:flex;flex-wrap:wrap;gap:6px'
const status = document.createElement('output')
status.setAttribute('aria-label', 'QA test status')
status.textContent = 'Ready'
panel.append(status)
const ready = document.createElement('button')
ready.type = 'button'
ready.disabled = true
ready.textContent = 'QA ready 0'
ready.setAttribute('aria-label', 'QA ready 0')
panel.append(ready)
const reportBox = document.createElement('textarea')
reportBox.readOnly = true
reportBox.setAttribute('aria-label', 'QA performance report')
reportBox.style.cssText = 'display:none;width:100%;height:90px'
panel.append(reportBox)
document.body.append(panel)
const sceneReady = document.createElement('output')
sceneReady.style.cssText =
  'position:fixed;left:2px;top:2px;z-index:2147483001;font:8px system-ui;color:white;background:#111827;display:none'
sceneReady.textContent = 'QA scene ready'
document.body.append(sceneReady)
const exitButton = document.createElement('button')
exitButton.type = 'button'
exitButton.textContent = 'QA exit scene'
exitButton.style.cssText =
  'position:fixed;right:4px;top:4px;z-index:2147483001;font:10px system-ui;display:none'
exitButton.addEventListener('click', () => {
  if (activeScene) activeScene.outcome = 'route-exit'
  void router.navigate('/')
})
document.body.append(exitButton)
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
async function until(predicate, timeout = 15_000) {
  const deadline = performance.now() + timeout
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Timed out waiting for the device fixture')
    await wait(100)
  }
}
function setBusy(value) {
  busy = value
  panel.style.display = value ? 'none' : 'flex'
  status.textContent = value ? 'Running' : 'Ready'
}
async function action(run) {
  if (busy) return
  setBusy(true)
  try {
    const result = await run()
    completedActions += 1
    ready.textContent = `QA ready ${completedActions}`
    ready.setAttribute('aria-label', ready.textContent)
    return result
  } catch (error) {
    failures.push(String(error))
    status.textContent = `Failed: ${error}`
    throw error
  } finally {
    sceneReady.style.display = 'none'
    exitButton.style.display = 'none'
    setBusy(false)
    if (failures.length) status.textContent = `Failed: ${failures.at(-1)}`
  }
}
function button(title, run) {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = title
  element.setAttribute('aria-label', title)
  element.style.cssText =
    'padding:8px;color:white;background:#374151;border:1px solid #9ca3af;border-radius:6px'
  element.addEventListener('click', () => {
    void run().catch(() => {})
  })
  panel.append(element)
}
async function home() {
  await router.navigate('/')
  await until(() => Boolean(document.querySelector('nav[aria-label="Main menu"]')))
}
function seedTwin(branch) {
  store.dispatch(profiles.enterGuestMode())
  let state = createFixtureInitialGameState(game.createInitialGameState, 730)
  const initialSimulationSeed = state.seed
  const initialRosterIds = state.players.map((player) => player.id)
  state = {
    ...state,
    gameId: `device-${branch}-${cycleIndex}`,
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
    if (!evictee) throw new Error('Twin fixture needs an evicted roster slot')
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
    throw new Error('Wrong Twin fixture branch')
  store.dispatch(game.hydrateGame(state))
  return {
    rosterSize: state.players.length,
    resolution: state.twinShockResolution,
    initialSimulationSeed,
    initialRosterIds,
  }
}
async function runScene(family, branch = 'combined') {
  return action(async () => {
    const scene = { outcome: 'normal' }
    activeScene = scene
    const expected = family === 'twin' ? seedTwin(branch) : null
    await router.navigate(family === 'twin' ? '/game' : '/credits')
    const selector = family === 'twin' ? '.twin-intro' : '.credits-container'
    await until(() => Boolean(document.querySelector(selector)))
    const media = [...document.querySelector(selector).querySelectorAll('video')]
    let decoded = false
    let wasPrepared = false
    if (family === 'credits' || build.variant === 'candidate') {
      await until(() => {
        wasPrepared ||= media.some((video) => video.hasAttribute('src'))
        return (
          media.some((video) => video.readyState >= 2 && video.currentTime > 0 && !video.paused) ||
          (wasPrepared && media.every((video) => !video.hasAttribute('src')))
        )
      }, 5000)
      decoded = media.some(
        (video) => video.readyState >= 2 && video.currentTime > 0 && !video.paused
      )
    }
    sceneReady.style.display = 'block'
    exitButton.style.display = 'block'
    const playbackSources = media.map((video) => video.currentSrc || video.getAttribute('src'))
    await until(() => !document.querySelector(selector), family === 'credits' ? 65_000 : 25_000)
    if (family === 'twin' && scene.outcome !== 'route-exit') {
      await until(() => !store.getState().game.twinShock?.pendingRevealAnimation, 10_000)
      const result = store.getState().game
      if (
        result.players.length !== expected.rosterSize ||
        result.twinShockResolution !== expected.resolution
      )
        throw new Error('Twin result changed during presentation')
      if (result.players.some((player) => player.id === 'ali') !== (branch === 'ali_enters'))
        throw new Error('Twin roster identity changed')
      if (
        result.players.find((player) => player.id === 'lia')?.name !==
        (branch === 'combined' ? 'Lia & Ali' : 'Lia')
      )
        throw new Error('Twin display identity changed')
    }
    if (
      family === 'twin' &&
      scene.outcome === 'route-exit' &&
      !store.getState().game.twinShock?.pendingRevealAnimation
    )
      throw new Error('Route exit acknowledged an unfinished Twin scene')
    const sourceReleased = media.every((video) => video.paused && !video.hasAttribute('src'))
    if (build.variant === 'candidate' && !sourceReleased)
      throw new Error('A candidate video source survived its handoff')
    cycles.push({
      family,
      branch,
      initialSimulationSeed: expected?.initialSimulationSeed ?? null,
      rosterSeed: family === 'twin' ? 730 : null,
      initialRosterIds: expected?.initialRosterIds ?? null,
      resolvedRosterIds:
        family === 'twin' ? store.getState().game.players.map((player) => player.id) : null,
      outcome: scene.outcome,
      decoded,
      wasPrepared,
      playbackStatus: decoded
        ? 'decoded'
        : family === 'credits' || build.variant === 'candidate'
          ? 'bounded-fallback'
          : 'legacy-live',
      playbackSources,
      sourceReleased,
      sequence: ++cycleIndex,
    })
    activeScene = null
    sceneReady.style.display = 'none'
    exitButton.style.display = 'none'
    await home()
    await wait(300)
  })
}
async function timedGame(phase) {
  return action(async () => {
    window.__presentationPerf.beginSegment(`gameplay-${phase}`)
    await router.navigate(
      '/minigame-lab?game=quickTap&seed=730&players=4&skipRules=true&skipCountdown=false&quickTapVip=false'
    )
    await until(
      () => Boolean(document.querySelector('[data-testid="quick-tap-race-canvas"]')),
      20_000
    )
    if (document.querySelector('video[src]'))
      throw new Error('Video remained attached during timed gameplay')
    const canvas = document.querySelector('[data-testid="quick-tap-race-canvas"]')
    // QA-only accessibility label lets XCUITest tap the real game canvas.
    canvas.setAttribute('role', 'button')
    canvas.setAttribute('aria-label', 'QA timed game canvas')
    await until(() => Boolean(document.querySelector('.minigame-host-results')), 45_000)
    window.__presentationPerf.endSegment()
    await home()
  })
}
async function startRecording() {
  if (busy) throw new Error('A scene is still active')
  cycles.length = 0
  cycleIndex = 0
  completedActions = 0
  ready.textContent = 'QA ready 0'
  ready.setAttribute('aria-label', ready.textContent)
  failures.length = 0
  reportBox.style.display = 'none'
  recording = true
  window.__presentationPerf.start(`device-${build.variant}`)
}
async function finishRecording(nativeMetadata = {}) {
  if (busy || !recording) throw new Error('Recording cannot finish yet')
  await wait(300)
  const captured = window.__presentationPerf.stop({
    ...build,
    ...nativeMetadata,
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    fixtureAndSeed:
      'seed730; both Twin branches or credits; QuickTap four players, normal countdown, twenty physical/OS-injected taps before and after',
    actualPhysicalDevice: nativeMetadata.actualPhysicalDevice ?? false,
    deviceEvidence:
      'Raw JavaScript does not establish physical hardware. Native runner/device evidence is required.',
    animationSettings: store.getState().settings,
  })
  recording = false
  const result = { ...captured, cycles: [...cycles], failures: [...failures] }
  reportBox.value = JSON.stringify(result)
  reportBox.style.display = 'block'
  status.textContent = 'Report ready'
  return result
}

button('QA start recording', startRecording)
button('QA timed game before', () => timedGame('before'))
button('QA Twin combined', () => runScene('twin', 'combined'))
button('QA Twin Ali enters', () => runScene('twin', 'ali_enters'))
button('QA credits', () => runScene('credits'))
button('QA timed game after', () => timedGame('after'))
button('QA finish recording', () => finishRecording())
Object.defineProperty(window, '__presentationDeviceTest', {
  value: {
    build,
    startRecording,
    runScene,
    timedGame,
    finishRecording,
    getStatus: () => ({
      busy,
      recording,
      completedActions,
      cycles: [...cycles],
      failures: [...failures],
    }),
    getGame: () => structuredClone(store.getState().game),
    exitScene: () => {
      if (activeScene) activeScene.outcome = 'route-exit'
      return router.navigate('/')
    },
  },
})
document.addEventListener(
  'click',
  (event) => {
    if (!activeScene || !(event.target instanceof Element)) return
    const button = event.target.closest('button')
    if (
      button &&
      button.closest('.twin-intro, .credits-container') &&
      /skip/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`)
    )
      activeScene.outcome = 'skip'
  },
  true
)
