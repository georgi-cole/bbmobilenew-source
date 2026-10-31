import { build, loadConfigFromFile } from 'vite'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, copyFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, relative, sep, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const option = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const platform = option('platform', 'android')
const variant = option('variant', 'candidate')
const revision = option('baseline', 'origin/main')
const updateArgument = option('update-artifact')
const identityArgument = option('package-id-from-artifact')
if (!['android', 'ios'].includes(platform) || !['baseline', 'candidate'].includes(variant))
  throw new Error('Use android/ios and baseline/candidate')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 100 * 1024 * 1024 })
const baseRevision = git('rev-parse', '--verify', revision).toString().trim()
if (!/^[0-9a-f]{40}$/.test(baseRevision))
  throw new Error('A full baseline Git revision is required')
const outputBase = resolve(root, 'renders/presentation-device-tests')
const output = updateArgument
  ? resolve(root, updateArgument)
  : resolve(outputBase, `${platform}-${variant}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
if (!output.startsWith(outputBase + sep))
  throw new Error('Test artifacts must remain inside their output directory')
await mkdir(output, { recursive: true })
const list = (bytes) => bytes.toString().split('\0').filter(Boolean)
const tracked = list(
  git('ls-tree', '-r', '--name-only', '-z', baseRevision, '--', 'src', 'index.html')
).filter((name) => /\.(?:[cm]?[jt]sx?|css|json|html|svg)$/.test(name))
const currentTracked = list(git('ls-files', '-z', '--', 'src', 'index.html')).filter((name) =>
  /\.(?:[cm]?[jt]sx?|css|json|html|svg)$/.test(name)
)
const untracked = list(git('ls-files', '-z', '--others', '--exclude-standard', '--', 'src')).filter(
  (name) => /\.(?:[cm]?[jt]sx?|css|json|svg)$/.test(name)
)
const baselineSources = new Map()
const blobs = spawnSync('git', ['cat-file', '--batch'], {
  cwd: root,
  input: tracked.map((name) => `${baseRevision}:${name}\n`).join(''),
  maxBuffer: 100 * 1024 * 1024,
})
if (blobs.status !== 0) throw new Error(blobs.stderr.toString())
let cursor = 0
for (const name of tracked) {
  const lineEnd = blobs.stdout.indexOf(10, cursor)
  const size = Number(blobs.stdout.subarray(cursor, lineEnd).toString().split(' ')[2])
  if (!Number.isFinite(size)) throw new Error(`Missing baseline source ${name}`)
  cursor = lineEnd + 1
  baselineSources.set(
    resolve(root, name).replaceAll('\\', '/'),
    blobs.stdout.subarray(cursor, cursor + size).toString('utf8')
  )
  cursor += size + 1
}
const hash = createHash('sha256').update(baseRevision)
for (const name of variant === 'baseline'
  ? tracked
  : [...new Set([...currentTracked, ...untracked])]
      .filter((name) => existsSync(resolve(root, name)))
      .sort()) {
  const bytes =
    variant === 'baseline'
      ? baselineSources.get(resolve(root, name).replaceAll('\\', '/'))
      : await readFile(resolve(root, name))
  hash.update(name).update('\0').update(bytes).update('\0')
}
hash.update(await readFile(resolve(root, 'package-lock.json')))
hash.update(await readFile(resolve(root, 'vite.config.ts')))
hash.update(await readFile(resolve(root, 'capacitor.config.ts')))
const changedPublic = list(git('diff', baseRevision, '--name-only', '-z', '--', 'public'))
const newPublic = list(git('ls-files', '-z', '--others', '--exclude-standard', '--', 'public'))
const mediaInputs = [
  ...new Set([
    ...changedPublic,
    ...newPublic,
    'public/assets/sounds/cinematic/Twin_shock_presentation.mp4',
  ]),
].sort()
for (const name of mediaInputs) {
  if (variant === 'baseline') {
    const blob = spawnSync('git', ['show', `${baseRevision}:${name}`], {
      cwd: root,
      maxBuffer: 100 * 1024 * 1024,
    })
    if (blob.status === 0) hash.update(name).update('\0').update(blob.stdout).update('\0')
  } else if (existsSync(resolve(root, name))) {
    hash
      .update(name)
      .update('\0')
      .update(await readFile(resolve(root, name)))
      .update('\0')
  }
}
const sourceFingerprint = hash.digest('hex')
let retainedIdentity
if (identityArgument) {
  const identityPath = resolve(root, identityArgument)
  if (!identityPath.startsWith(outputBase + sep))
    throw new Error('A retained QA identity must come from an owned staging artifact')
  retainedIdentity = JSON.parse(
    await readFile(resolve(identityPath, 'device-test-artifact.json'), 'utf8')
  )
  if (
    retainedIdentity.kind !== 'isolated-presentation-device-test-artifact' ||
    retainedIdentity.platform !== platform ||
    retainedIdentity.variant !== variant ||
    retainedIdentity.baseRevision !== baseRevision ||
    retainedIdentity.releaseApproved !== false ||
    !/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(retainedIdentity.packageId)
  )
    throw new Error('Only a matching isolated QA installation identity may be retained')
}
if (updateArgument) {
  const prior = JSON.parse(await readFile(resolve(output, 'device-test-artifact.json'), 'utf8'))
  if (
    prior.kind !== 'isolated-presentation-device-test-artifact' ||
    prior.platform !== platform ||
    prior.variant !== variant ||
    prior.baseRevision !== baseRevision ||
    prior.sourceFingerprint !== sourceFingerprint ||
    prior.releaseApproved !== false
  )
    throw new Error(
      'Only the QA harness may update an artifact with identical app sources and media'
    )
  await copyFile(
    resolve(output, 'web/index.html'),
    resolve(output, `web/index.previous-${prior.instrumentationFingerprint.slice(0, 12)}.html`)
  )
  await writeFile(
    resolve(output, `previous-device-test-${prior.instrumentationFingerprint.slice(0, 12)}.json`),
    JSON.stringify(prior, null, 2)
  )
}
const metadata = {
  kind: 'isolated-presentation-device-test-artifact',
  platform,
  variant,
  baseRevision,
  sourceFingerprint,
  builtAt: new Date().toISOString(),
  productionRuntime: true,
  timedGameSelection:
    'Existing classic Quick Tap lab override enabled only by this isolated QA transform; identical for baseline and candidate. Real countdown, duration and scoring are retained.',
  releaseApproved: false,
  actualPhysicalDevice: false,
  packageId:
    retainedIdentity?.packageId ??
    `com.georgicole.thebigeye.q${variant === 'baseline' ? 'base' : 'candidate'}${sourceFingerprint.slice(0, 8)}`,
  installationIdentitySourceFingerprint: retainedIdentity?.sourceFingerprint,
  displayName: `The Big Eye ${variant} QA`,
  limitation:
    'A build is not device evidence. Physical hardware, OS/WebView, native measurements and the required acceptance matrix must be captured by the device runner.',
}
const recorder = await readFile(resolve(root, 'scripts/cinematic-performance/recorder.js'), 'utf8')
const fixtureSource = await readFile(
  resolve(root, 'scripts/cinematic-performance/device-fixture-entry.js'),
  'utf8'
)
const fixtureStateSource = await readFile(
  resolve(root, 'scripts/cinematic-performance/fixture-state.mjs'),
  'utf8'
)
metadata.instrumentationFingerprint = createHash('sha256')
  .update(recorder)
  .update(fixtureSource)
  .update(fixtureStateSource)
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex')
const fixture = fixtureSource.replace('__PRESENTATION_DEVICE_TEST_META__', JSON.stringify(metadata))
const annotations = `new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) {
  if (!(node instanceof Element)) continue;
  for (const [selector, name] of Object.entries({'.credits-container':'credits','.twin-intro':'twin-shock-intro','.twin-shock-reveal':'twin-shock-reveal','.tv-announcement-wrap':'tv-announcement'})) {
    if (node.matches(selector)) node.dataset.presentationRoot=name;
    node.querySelectorAll(selector).forEach(element=>element.dataset.presentationRoot=name);
  }
}}).observe(document,{childList:true,subtree:true});`
const bootstrap = `sessionStorage.setItem('bb:homeHubSplashShownThisSession','true');localStorage.setItem('bbmobilenew_settings_v1',JSON.stringify({audio:{musicOn:false,sfxOn:false},gameUX:{animations:true}}));${annotations}\n${recorder}`
const virtualId = '\0presentation-device-fixture'
const web = resolve(output, 'web')
await build({
  root,
  mode: platform,
  define: {
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify('mobile-dev'),
    'import.meta.env.VITE_FEATURE_TWIN_SHOCK_DEVICE_TEST': JSON.stringify('true'),
    'import.meta.env.VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT': JSON.stringify('true'),
  },
  build: { outDir: web, copyPublicDir: !updateArgument, emptyOutDir: !updateArgument },
  plugins: [
    {
      name: 'isolated-presentation-device-fixture',
      enforce: 'pre',
      resolveId(id) {
        if (id === '/__presentation_device_fixture__.js') return virtualId
      },
      load(id) {
        if (id === virtualId) return fixture
        if (variant === 'baseline') {
          const cleanId = id.split('?')[0].replaceAll('\\', '/')
          const source = baselineSources.get(cleanId)
          if (source !== undefined && cleanId.endsWith('.svg')) {
            if (/[?&]raw(?:&|$)/.test(id)) return `export default ${JSON.stringify(source)}`
            const reference = this.emitFile({ type: 'asset', name: basename(cleanId), source })
            return `export default import.meta.ROLLUP_FILE_URL_${reference}`
          }
          return source
        }
      },
      transform(code, id) {
        const cleanId = id.split('?')[0].replaceAll('\\', '/')
        if (
          cleanId === resolve(root, 'src/screens/MinigameLab/MinigameLab.tsx').replaceAll('\\', '/')
        ) {
          const guard = /quickTapVariantPreview:\s*import\.meta\.env\.DEV\s*&&/g
          if ([...code.matchAll(guard)].length !== 2)
            throw new Error('Review both lab Quick Tap QA selectors before measuring this source')
          return { code: code.replace(guard, 'quickTapVariantPreview:'), map: null }
        }
        if (
          cleanId !==
          resolve(root, 'src/components/MinigameHost/MinigameHost.tsx').replaceAll('\\', '/')
        )
          return
        const guard =
          "import.meta.env.DEV && typeof gameOptions.quickTapVariantPreview === 'boolean'"
        if (code.split(guard).length !== 2)
          throw new Error('Review the classic Quick Tap QA selector before measuring this source')
        // Native mobile-dev grants premium access. Enable only the already
        // existing lab selection in this QA artifact so both versions measure
        // the specified standard game. No normal build loads this transform.
        return {
          code: code.replace(guard, "typeof gameOptions.quickTapVariantPreview === 'boolean'"),
          map: null,
        }
      },
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return {
            html:
              variant === 'baseline'
                ? baselineSources.get(resolve(root, 'index.html').replaceAll('\\', '/'))
                : html,
            tags: [
              {
                tag: 'meta',
                attrs: { name: 'robots', content: 'noindex,nofollow,noarchive' },
                injectTo: 'head-prepend',
              },
              { tag: 'script', children: bootstrap, injectTo: 'head-prepend' },
              {
                tag: 'script',
                attrs: { type: 'module', src: '/__presentation_device_fixture__.js' },
                injectTo: 'body',
              },
            ],
          }
        },
      },
    },
  ],
})
// Public assets are copied by Vite. Restore changed tracked assets for the
// original baseline, including the original credits encode and soundtrack.
if (variant === 'baseline' && !updateArgument) {
  for (const name of changedPublic) {
    const original = spawnSync('git', ['show', `${baseRevision}:${name}`], {
      cwd: root,
      maxBuffer: 100 * 1024 * 1024,
    })
    if (original.status !== 0) throw new Error(`Cannot restore baseline asset ${name}`)
    const destination = resolve(web, relative('public', name))
    if (!destination.startsWith(web + sep)) throw new Error('Invalid baseline asset output')
    await mkdir(resolve(destination, '..'), { recursive: true })
    await writeFile(destination, original.stdout)
  }
  for (const name of newPublic) {
    const destination = resolve(web, relative('public', name))
    if (!destination.startsWith(web + sep)) throw new Error('Invalid test-only asset output')
    if (existsSync(destination)) await unlink(destination)
  }
}
await writeFile(resolve(output, 'device-test-artifact.json'), JSON.stringify(metadata, null, 2))
const loadedNativeConfig = await loadConfigFromFile(
  { command: 'build', mode: platform },
  resolve(root, 'capacitor.config.ts'),
  root
)
if (!loadedNativeConfig || loadedNativeConfig.config.server?.url)
  throw new Error('Device tests require the local packaged Capacitor configuration')
await writeFile(
  resolve(output, 'capacitor.config.json'),
  JSON.stringify(
    {
      ...loadedNativeConfig.config,
      appId: metadata.packageId,
      appName: metadata.displayName,
      webDir: 'web',
    },
    null,
    2
  )
)
await copyFile(resolve(root, 'package-lock.json'), resolve(output, 'source-package-lock.json'))
console.log(JSON.stringify({ output, metadata }, null, 2))
