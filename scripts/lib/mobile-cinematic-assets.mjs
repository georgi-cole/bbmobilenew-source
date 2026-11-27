import { constants } from 'node:fs'
import { appendFile, copyFile, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const MiB = 1024 * 1024
export const MOBILE_WEB_BUDGET_BYTES = 155 * MiB
const ROOT_FILES = new Set(['favicon.svg', 'manifest.json'])
const LEGACY_HUB_FILES = new Set([
  'css/houseguests-modal.css',
  'css/intro-hub.css',
  'js/data/houseguests.js',
  'js/houseguest-profile.js',
  'js/ui/houseguestsModal.js',
  'js/ui/introHub.js',
])
const HOSTED_FILES = new Set(['assets/credits/big-eye-cinematic-background.mp4'])
const MEDIA_TYPES = /\.(?:svg|webp|wp2|jxl|png|jpe?g|mp3|wav|mp4|json)$/i
const QA_CHUNK =
  /^assets\/(?:CinematicPreview|PhonePreviewPage|GameDebug|ConfessionalLab|BroadcastManager|GameManager|RemoteManager|SettingsAdmin(?:Route)?|DebugPanel|QaManagerShortcuts|TwistsTestPage)-/

function isBundledPublicFile(relative) {
  if (ROOT_FILES.has(relative) || LEGACY_HUB_FILES.has(relative)) return true
  if (/\/(?:readme)(?:\.[^/]+)?$/i.test(relative)) return false
  if (relative.startsWith('assets/')) {
    return (
      MEDIA_TYPES.test(relative) &&
      !HOSTED_FILES.has(relative) &&
      relative !== 'assets/audio.config.json' &&
      relative !== 'assets/glossy_bottom_bar/navbar_shell_preview.svg'
    )
  }
  return /^(?:legal|minigames|evictionmark)\//.test(relative)
}

async function listFiles(directory, prefix = '') {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected asset symlink: ${prefix}${entry.name}`)
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory())
      files.push(...(await listFiles(path.join(directory, entry.name), `${relative}/`)))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

function assertSeparateDirectories(source, output) {
  for (const relative of [path.relative(source, output), path.relative(output, source)]) {
    if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      throw new Error('Mobile output must be separate from public source assets.')
    }
  }
}

function assetGroup(relative) {
  const [first, second, third] = relative.split('/')
  if (first === 'assets' && third) return `assets/${second}`
  if (first === 'assets' && /\.(?:js|css)$/.test(relative)) return 'Compiled JS and CSS'
  if (first === 'minigames' && third) return `minigames/${second}`
  return third || second ? first : 'App entry files'
}

/** Vite writes compiled modules first. Stage only approved runtime public assets alongside them. */
export async function stageMobilePublicAssets(root, outputDirectory, manifest) {
  const source = await realpath(path.join(root, 'public'))
  const output = await realpath(outputDirectory)
  assertSeparateDirectories(source, output)
  const vip = new Set(manifest.files.map((file) => file.path))
  const alreadyBuilt = new Set(await listFiles(output))
  for (const relative of alreadyBuilt) {
    if (QA_CHUNK.test(relative)) throw new Error(`QA module still bundled: ${relative}`)
  }
  let retainedFiles = 0
  let skippedPublicBytes = 0
  for (const relative of await listFiles(source)) {
    const from = path.join(source, relative)
    if (vip.has(relative) || !isBundledPublicFile(relative)) {
      if (alreadyBuilt.has(relative)) throw new Error(`Excluded asset still bundled: ${relative}`)
      skippedPublicBytes += (await stat(from)).size
      continue
    }
    const to = path.join(output, relative)
    await mkdir(path.dirname(to), { recursive: true })
    await copyFile(from, to, constants.COPYFILE_EXCL)
    retainedFiles += 1
  }

  const groups = new Map()
  let totalBytes = 0
  for (const relative of await listFiles(output)) {
    const { size } = await stat(path.join(output, relative))
    totalBytes += size
    const group = assetGroup(relative)
    groups.set(group, (groups.get(group) ?? 0) + size)
  }
  const format = (bytes) => `${(bytes / MiB).toFixed(2)} MiB`
  const heading = `Mobile web payload: ${format(totalBytes)} of ${format(MOBILE_WEB_BUDGET_BYTES)}`
  const lines = [
    `### ${heading}`,
    '',
    `Copied ${retainedFiles} public files. Excluded ${format(manifest.totalBytes)} of optional VIP artwork and ${format(skippedPublicBytes - manifest.totalBytes)} of other public files.`,
    '',
    '| Bundle path | Uncompressed size |',
    '| --- | ---: |',
    ...[...groups]
      .sort((a, b) => b[1] - a[1])
      .map(([group, bytes]) => `| ${group} | ${format(bytes)} |`),
    '',
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  if (totalBytes > MOBILE_WEB_BUDGET_BYTES)
    throw new Error(heading + ' exceeds the mobile bundle budget.')
  return { retainedFiles, skippedPublicBytes, totalBytes }
}
