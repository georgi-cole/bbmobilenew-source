import { chromium, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const option = (name, fallback) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const artifactArgument = option('artifact')
const serial = option('serial')
const family = option('family', 'twin')
const cache = option('cache', 'cold')
const runCount = Number(option('runs', '7'))
if (!artifactArgument || !serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial))
  throw new Error('Pass --artifact=<isolated build> and --serial=<connected Android id>')
if (
  !['twin', 'credits'].includes(family) ||
  !['cold', 'warm'].includes(cache) ||
  !Number.isInteger(runCount) ||
  runCount < 1
)
  throw new Error('Invalid family, cache state or run count')
const artifact = resolve(root, artifactArgument)
if (!artifact.startsWith(resolve(root, 'renders/presentation-device-tests') + sep))
  throw new Error('Only isolated QA artifacts can run')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
const receipt = JSON.parse(
  await readFile(resolve(artifact, 'android-project-receipt.json'), 'utf8')
)
if (
  metadata.platform !== 'android' ||
  metadata.releaseApproved !== false ||
  !/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(metadata.packageId) ||
  receipt.packageId !== metadata.packageId
)
  throw new Error('An isolated Android test build is required')
const apk = resolve(artifact, receipt.apk)
if (
  !apk.startsWith(artifact + sep) ||
  createHash('sha256')
    .update(await readFile(apk))
    .digest('hex') !== receipt.apkSha256
)
  throw new Error('The APK no longer matches its receipt')
const sdk =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  (process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, 'Android/Sdk'))
const adb = option(
  'adb',
  sdk && resolve(sdk, `platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`)
)
if (!adb || !existsSync(adb)) throw new Error('An installed Android platform-tools/adb is required')
const command = (...args) =>
  execFileSync(adb, ['-s', serial, ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim()
if (command('get-state') !== 'device')
  throw new Error('Unlock the device and authorize USB debugging first')
const property = (name) => command('shell', 'getprop', name)
const device = {
  serial,
  manufacturer: property('ro.product.manufacturer'),
  model: property('ro.product.model'),
  hardware: property('ro.product.device'),
  androidVersion: property('ro.build.version.release'),
  sdk: property('ro.build.version.sdk'),
  buildFingerprint: property('ro.build.fingerprint'),
  emulatorProperty: property('ro.kernel.qemu'),
}
device.actualPhysicalDevice =
  device.emulatorProperty !== '1' &&
  !/^emulator-/.test(serial) &&
  !/sdk_gphone|emulator/i.test(`${device.model} ${device.hardware}`)
if (!device.actualPhysicalDevice)
  throw new Error('This runner collects physical-device evidence; use a separate simulator report')
const output = resolve(
  root,
  'renders/premium-presentation-audit',
  `android-${family}-${metadata.variant}-${new Date().toISOString().replace(/[:.]/g, '-')}`
)
await mkdir(output, { recursive: true })
const observation = (args) => {
  try {
    return { available: true, raw: command('shell', ...args) }
  } catch (error) {
    return { available: false, error: String(error) }
  }
}
const snapshot = () => ({
  at: new Date().toISOString(),
  memory: observation(['dumpsys', 'meminfo', metadata.packageId]),
  battery: observation(['dumpsys', 'battery']),
  thermal: observation(['dumpsys', 'thermalservice']),
  display: observation(['dumpsys', 'display']),
  webview: observation(['dumpsys', 'webviewupdate']),
  mediaCodec: observation(['dumpsys', 'media.codec']),
})
if (process.argv.includes('--install')) {
  // The identifier is validated above and cannot overwrite the normal game.
  command('install', '-r', apk)
}
if (!command('shell', 'pm', 'path', metadata.packageId).startsWith('package:'))
  throw new Error('Install this isolated APK first or pass --install')
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
async function connect() {
  command(
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${metadata.packageId}/com.georgicole.thebigeye.MainActivity`
  )
  let pid
  for (let attempt = 0; attempt < 30; attempt += 1) {
    pid = command('shell', 'pidof', metadata.packageId).split(/\s+/)[0]
    if (/^\d+$/.test(pid)) break
    await wait(300)
  }
  if (!/^\d+$/.test(pid ?? '')) throw new Error('The QA app did not start')
  const port = Number(command('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`))
  if (!Number.isInteger(port) || port < 1)
    throw new Error('Could not forward the app WebView inspector')
  let browser
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 })
        break
      } catch (error) {
        if (attempt === 29) throw error
        await wait(500)
      }
    }
    const context = browser.contexts()[0]
    const page = context.pages().find((page) => /localhost/.test(page.url())) ?? context.pages()[0]
    if (!page) throw new Error('The native app WebView was not found')
    await page.waitForFunction(() => Boolean(window.__presentationDeviceTest), undefined, {
      timeout: 45000,
    })
    const build = await page.evaluate(() => window.__presentationDeviceTest.build)
    if (
      build.sourceFingerprint !== metadata.sourceFingerprint ||
      build.instrumentationFingerprint !== metadata.instrumentationFingerprint ||
      build.packageId !== metadata.packageId
    )
      throw new Error('The installed app is a different source build')
    return { browser, page, port }
  } catch (error) {
    await browser?.close().catch(() => {})
    command('forward', '--remove', `tcp:${port}`)
    throw error
  }
}
async function scene(page, index, skip) {
  const completion = page
    .evaluate(({ family, branch }) => window.__presentationDeviceTest.runScene(family, branch), {
      family,
      branch: index % 2 ? 'ali_enters' : 'combined',
    })
    .then(
      (value) => ({ value }),
      (error) => ({ error })
    )
  if (skip) {
    await expect(page.getByText('QA scene ready', { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await page
      .getByRole('button', { name: family === 'credits' ? 'Skip credits' : 'Skip', exact: true })
      .click()
  }
  const result = await completion
  if (result.error) throw result.error
}
async function gameplay(page, phase) {
  const completion = page
    .evaluate((phase) => window.__presentationDeviceTest.timedGame(phase), phase)
    .then(
      (value) => ({ value }),
      (error) => ({ error })
    )
  const canvas = page.getByRole('button', { name: 'QA timed game canvas', exact: true })
  await expect(canvas).toBeVisible({ timeout: 25000 })
  for (let tap = 0; tap < 20; tap += 1) {
    await canvas.click()
    await wait(150)
  }
  const result = await completion
  if (result.error) throw result.error
}
await writeFile(
  resolve(output, 'setup.json'),
  JSON.stringify(
    {
      device,
      metadata,
      receipt,
      cache,
      family,
      runCount,
      inputMethod: 'CDP-injected taps; not digitizer-to-photon latency',
      nativeBuildKind: 'debug wrapper, production web runtime',
    },
    null,
    2
  )
)
for (let run = 1; run <= runCount; run += 1) {
  command('shell', 'am', 'force-stop', metadata.packageId)
  if (cache === 'cold' && command('shell', 'pm', 'clear', metadata.packageId) !== 'Success')
    throw new Error('Could not reset this isolated QA app for the cold-cache profile')
  const { browser, page, port } = await connect()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  const native = []
  try {
    if (cache === 'warm') await scene(page, 0, true)
    native.push({ stage: 'before', observation: snapshot() })
    await page.evaluate(() => window.__presentationDeviceTest.startRecording())
    await gameplay(page, 'before')
    for (let cycle = 0; cycle < 20; cycle += 1) {
      await scene(page, cycle, cycle % 4 >= 2)
      native.push({ stage: `cycle-${cycle + 1}`, observation: snapshot() })
      console.log(JSON.stringify({ run, cycle: cycle + 1, family, variant: metadata.variant }))
    }
    await gameplay(page, 'after')
    const capture = await page.evaluate(
      (nativeMetadata) => window.__presentationDeviceTest.finishRecording(nativeMetadata),
      {
        ...device,
        coldOrWarm: `${cache} QA-app cache; fresh native process; later scene cycles warm`,
        repeatedRunIndex: run,
        sourceRevision: metadata.baseRevision,
        dependencyFingerprint: createHash('sha256')
          .update(await readFile(resolve(artifact, 'source-package-lock.json')))
          .digest('hex'),
        webviewOrBrowser: `Android WebView ${browser.version()}`,
        operatingSystem: `Android ${device.androidVersion}; SDK ${device.sdk}`,
        thermalState: 'See timestamped native dumpsys snapshots; not inferred from JavaScript',
        measurementLimitations:
          'CDP and recorder overhead; native debug wrapper. OS snapshots occur between settled scenes. No claim of hardware decoder selection, GPU attribution, unplugged battery drain or physical touch latency.',
      }
    )
    native.push({ stage: 'after', observation: snapshot() })
    await writeFile(
      resolve(output, `${family}-${metadata.variant}-${run}.json`),
      JSON.stringify({ ...capture, nativeObservations: native, errors }, null, 2)
    )
    const resources = capture.summary.endResources
    if (
      errors.length ||
      capture.failures.length ||
      capture.cycles.length !== 20 ||
      capture.cycles.filter((cycle) => cycle.outcome === 'skip').length !== 10 ||
      (metadata.variant === 'candidate' && capture.cycles.some((cycle) => !cycle.decoded)) ||
      [
        'activePresentationRoots',
        'activePresentationVideos',
        'attachedPresentationVideoSources',
        'pendingMediaPreparation',
      ].some((field) => resources[field] !== 0)
    )
      throw new Error('The device run failed its fixture or teardown checks; retain raw evidence')
  } catch (error) {
    await writeFile(
      resolve(output, `run-${run}-failure.json`),
      JSON.stringify({ error: String(error), errors, native }, null, 2)
    )
    throw error
  } finally {
    await browser.close().catch(() => {})
    command('forward', '--remove', `tcp:${port}`)
    command('shell', 'am', 'force-stop', metadata.packageId)
  }
}
console.log(
  JSON.stringify(
    {
      output,
      actualPhysicalDevice: true,
      acceptanceComplete: false,
      remaining:
        'Review native observations, interruption/fault/settings matrix, sustained session and matched baseline/candidate comparison.',
    },
    null,
    2
  )
)
