import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile, chmod, readdir, lstat, link } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { setMacArchiveScriptModes } from './cinematic-performance/ios/archive-script-modes.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const argument = process.argv.find((value) => value.startsWith('--artifact='))?.slice(11)
if (!argument) throw new Error('Pass --artifact=<prepared iOS device-test output>')
const artifact = resolve(root, argument)
const ownedRoot = resolve(root, 'renders/presentation-device-tests')
if (!artifact.startsWith(ownedRoot + sep)) throw new Error('An isolated test artifact is required')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
const receipt = JSON.parse(await readFile(resolve(artifact, 'mac-project-receipt.json'), 'utf8'))
if (!receipt.nativeHarnessFingerprint || receipt.copiedNativePackages?.length !== 4)
  throw new Error('The native test harness and four local plugins must be verified before export')
if (
  metadata.platform !== 'ios' ||
  metadata.releaseApproved !== false ||
  receipt.kind !== 'copied-presentation-xcode-test-project'
)
  throw new Error('The copied iOS test project must be prepared first')
const exportDirectory = resolve(
  root,
  'renders/presentation-mac-tests',
  `${metadata.variant}-${metadata.sourceFingerprint.slice(0, 12)}-${metadata.instrumentationFingerprint.slice(0, 8)}`
)
const mediaPaths = [
  'assets/credits/big-eye-cinematic-background.mp4',
  'assets/sounds/cinematic/Twin_shock_presentation.mp4',
]
if (metadata.variant === 'candidate')
  mediaPaths.push(
    'assets/twin-shock/twin-shock-intro-v1.mp4',
    'assets/twin-shock/twin-shock-intro-poster.webp',
    'assets/credits/credits-background-poster.webp'
  )
const verifiedMedia = []
for (const path of mediaPaths) {
  const [webBytes, nativeBytes] = await Promise.all([
    readFile(resolve(artifact, 'web', path)),
    readFile(resolve(artifact, 'ios/App/App/public', path)),
  ])
  const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
  if (sha256(webBytes) !== sha256(nativeBytes))
    throw new Error(`The copied native media differs from its web build: ${path}`)
  verifiedMedia.push({ path, bytes: nativeBytes.length, sha256: sha256(nativeBytes) })
}
if (existsSync(exportDirectory))
  throw new Error(
    'This source already has an exported package; preserve it or use a fresh artifact'
  )
await mkdir(exportDirectory, { recursive: true })
// Export only reviewed resources. In particular, do not traverse the temporary
// Windows node_modules junction or include local build outputs and credentials.
for (const name of [
  'ios',
  'native-dependencies',
  'device-test-artifact.json',
  'mac-project-receipt.json',
]) {
  const source = resolve(artifact, name)
  if (!source.startsWith(artifact + sep)) throw new Error('Invalid export path')
  await cp(source, resolve(exportDirectory, name), {
    recursive: true,
    dereference: false,
    filter: async (input, destination) => {
      // These frozen media bytes are never edited by a harness-only update.
      // Share staging storage while the ZIP itself remains self-contained.
      if (
        input.startsWith(resolve(artifact, 'ios/App/App/public') + sep) &&
        /\.(mp4|mp3|webp|png|jpe?g|woff2?|ttf|wav|ogg)$/i.test(input) &&
        (await lstat(input)).isFile()
      ) {
        await mkdir(resolve(destination, '..'), { recursive: true })
        await link(input, destination)
        return false
      }
      return true
    },
  })
}
async function rejectLinks(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name)
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`Unexpected symbolic link in Mac package: ${path}`)
    if (item.isDirectory()) await rejectLinks(path)
  }
}
await rejectLinks(exportDirectory)
let runner = await readFile(
  resolve(root, 'scripts/cinematic-performance/ios/Run-on-Mac.command'),
  'utf8'
)
runner = runner.replaceAll('\r\n', '\n')
await writeFile(resolve(exportDirectory, 'Run-on-Mac.command'), runner, { mode: 0o755 })
await chmod(resolve(exportDirectory, 'Run-on-Mac.command'), 0o755)
await writeFile(
  resolve(exportDirectory, 'copied-media-proof.json'),
  JSON.stringify({ sourceArtifact: metadata, verifiedMedia, actualPhysicalDevice: false }, null, 2)
)
await writeFile(
  resolve(exportDirectory, 'READ-ME.txt'),
  [
    'THE BIG EYE — iPhone presentation test package',
    `Variant: ${metadata.variant}; source: ${metadata.sourceFingerprint}`,
    `Separate app identifier: ${metadata.packageId}`,
    '',
    '1. Copy this folder to the Mac. Open Xcode once and finish setup.',
    '2. Connect and unlock the iPhone; allow Trust and Developer Mode when asked.',
    '3. Open ios/App/App.xcodeproj. In Signing & Capabilities choose your Team for App and PresentationDeviceTests.',
    '4. Select scheme PresentationDeviceTests and your connected iPhone.',
    '5. In the Test navigator run testDeviceFixtureSmoke first, then testTwinVerdictsOnDevice.',
    '6. For unattended performance runs, open Run-on-Mac.command and select the matching family.',
    '   If Finder does not permit running it, open Terminal in this folder and run: bash Run-on-Mac.command',
    '7. Keep the results folder (including .xcresult and logs) and return it for review.',
    '',
    'No Remote Login or shared passwords are needed. The game already installed on the phone is preserved.',
    'Baseline and candidate must be tested on the same phone with the same settings, order and thermal/cache conditions.',
    'Both are release-renderer QA builds. They simulate purchases and must not be published.',
    'Do not run other heavy workloads during capture. Note phone temperature, charging, sound and motion settings.',
    'The native test records model/iOS/thermal/battery information. It rejects missing scene/resource evidence.',
    'Browser-only success, installation, or a simulator run is not a physical-device performance pass.',
    'Decoder/GPU/WebContent attribution and sustained battery/thermal behaviour still require OS/Instruments review.',
    'The Windows preparation has not compiled or signed this Xcode project. Start with the short smoke test.',
    '',
  ].join('\n')
)
const archive = `${exportDirectory}.zip`
execFileSync(
  'tar',
  ['-a', '-cf', archive, '-C', resolve(exportDirectory, '..'), exportDirectory.split(sep).at(-1)],
  { cwd: root, stdio: 'inherit' }
)
const scriptModes = setMacArchiveScriptModes(archive)
console.log(
  JSON.stringify(
    {
      archive,
      exportDirectory,
      ...scriptModes,
      releaseApproved: false,
      actualPhysicalDevice: false,
      testedOnMac: false,
    },
    null,
    2
  )
)
