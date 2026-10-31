import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { cpus, totalmem, platform, release } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const getOption = (name, fallback = '') =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const url = getOption('url')
const label = getOption('label', 'candidate')
const cacheState = getOption('cache', 'cold')
if (!url) throw new Error('Pass --url=http://127.0.0.1:4173/bbmobilenew/')
if (!/^[a-z0-9-]+$/.test(label))
  throw new Error('Use a lowercase label with letters, numbers, and hyphens.')
if (!['cold', 'warm'].includes(cacheState)) throw new Error('Pass --cache=cold or --cache=warm.')

const outputDir = resolve(root, 'artifacts/cinematic-performance')
await mkdir(outputDir, { recursive: true })
const outputPath = resolve(outputDir, `${label}.json`)
if (!outputPath.startsWith(`${outputDir}/`) && !outputPath.startsWith(`${outputDir}\\`)) {
  throw new Error('Performance reports must stay inside artifacts/cinematic-performance.')
}

const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const executablePath = executableCandidates.find((candidate) => existsSync(candidate))
const launchOptions = executablePath ? { executablePath } : {}
const browser = await chromium.launch({ headless: false, ...launchOptions })
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true })
const page = await context.newPage()
const recorder = await readFile(resolve(root, 'scripts/cinematic-performance/recorder.js'), 'utf8')
const gitRevision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim()
const gitStatus = spawnSync('git', ['status', '--short'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim()
const metadata = {
  label,
  capturedAt: new Date().toISOString(),
  url,
  sourceRevision: gitRevision || null,
  workingTreeDirty: Boolean(gitStatus),
  device: getOption('device', 'unspecified browser host'),
  operatingSystem: getOption('os', `${platform()} ${release()}`),
  webviewOrBrowser: `Chromium ${browser.version()}`,
  fixtureAndSeed: getOption('fixture', 'manual gameplay fixture; seed not recorded'),
  animationSettings: getOption('settings', 'record manually'),
  coldOrWarm: `${cacheState} browser cache`,
  thermalState: getOption('thermal', 'not recorded'),
  repeatedRunIndex: getOption('run', '1'),
  hostCpu: cpus()[0]?.model ?? 'unknown',
  hostRamBytes: totalmem(),
  actualPhysicalDevice: false,
  buildKind: 'operator-selected browser URL; verify build identity separately',
  dependencyFingerprint: createHash('sha256')
    .update(await readFile(resolve(root, 'package-lock.json')))
    .digest('hex'),
  instrumentationFingerprint: createHash('sha256')
    .update(recorder)
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
  visibilityInterruption: 'operator-driven browser background/resume',
  measurementLimitations:
    'Chromium browser instrumentation only. It cannot observe native WebView process/GPU memory, hardware decoder behavior, device thermals, battery, or physical-device frame pacing. The injected timer/listener/RAF wrappers add a small, consistent measurement overhead.',
}

const missingMetadata = []
if (metadata.device === 'unspecified browser host') missingMetadata.push('device')
if (metadata.fixtureAndSeed === 'manual gameplay fixture; seed not recorded')
  missingMetadata.push('fixture and seed')
if (metadata.animationSettings === 'record manually') missingMetadata.push('animation settings')
if (metadata.thermalState === 'not recorded') missingMetadata.push('thermal state')

const terminal = createInterface({ input: stdin, output: stdout })
try {
  await page.addInitScript({ content: recorder })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  if (cacheState === 'warm') {
    await page.reload({ waitUntil: 'domcontentloaded' })
  }
  console.log('The test window is open. Wait until the game is settled at its starting screen.')
  await terminal.question('Press Enter here to start recording. ')
  await page.evaluate((runLabel) => window.__presentationPerf?.start(runLabel), label)
  await page.evaluate(() => window.__presentationPerf?.beginSegment('gameplay-before'))
  await terminal.question('Run the agreed timed minigame fixture, then press Enter here. ')
  await page.evaluate(() => {
    window.__presentationPerf?.endSegment()
    window.__presentationPerf?.beginSegment('presentations')
  })
  console.log(
    'Run 20 presentation cycles, mixing normal completion and Skip. During capture, exit a presentation route once and return to the same fixture, then background and foreground the app/window once.'
  )
  await terminal.question('Press Enter after the presentation cycles and interruptions. ')
  await page.evaluate(() => {
    window.__presentationPerf?.endSegment()
    window.__presentationPerf?.beginSegment('gameplay-after')
  })
  await terminal.question('Press Enter after the post-presentation gameplay has run. ')
  await page.waitForTimeout(300)
  const captured = await page.evaluate((runMetadata) => {
    return window.__presentationPerf?.stop(runMetadata) ?? null
  }, metadata)
  if (!captured) throw new Error('The presentation recorder did not initialize in the page.')

  const expectedCycles = Number(getOption('expected-cycles', '20'))
  const checks = {
    expectedPresentationCycles: expectedCycles,
    presentationCyclesObserved: captured.summary.presentationCycles,
    enoughCycles: captured.summary.presentationCycles >= expectedCycles,
    sawSkip: captured.summary.skippedPresentations > 0,
    sawNormalCompletion: captured.summary.normallyCompletedPresentations > 0,
    sawRouteExit: captured.summary.routeExits > 0,
    sawBackgroundResume:
      captured.summary.backgroundTransitions > 0 && captured.summary.foregroundTransitions > 0,
    noActivePresentationRootsAtEnd: captured.summary.endResources?.activePresentationRoots === 0,
    noActivePresentationVideosAtEnd: captured.summary.endResources?.activePresentationVideos === 0,
    noAttachedPresentationVideoSourcesAtEnd:
      captured.summary.endResources?.attachedPresentationVideoSources === 0,
    noPendingMediaPreparationAtEnd: captured.summary.endResources?.pendingMediaPreparation === 0,
    physicalDeviceGate: 'not evaluated by a Chromium browser run',
  }
  const report = { metadata, missingMetadata, checks, ...captured }
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ outputPath, checks, frameSummary: captured.summary }, null, 2))
} finally {
  terminal.close()
  await context.close()
  await browser.close()
}
