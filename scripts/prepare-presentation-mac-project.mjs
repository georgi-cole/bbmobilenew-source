import { execFileSync } from 'node:child_process'
import { readFile, writeFile, cp, mkdir, symlink, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { addDeviceTestTarget } from './cinematic-performance/ios/add-device-test-target.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const argument = process.argv.find((value) => value.startsWith('--artifact='))?.slice(11)
if (!argument) throw new Error('Pass --artifact=<isolated iOS device-test output>')
const artifact = resolve(root, argument)
const ownedRoot = resolve(root, 'renders/presentation-device-tests')
if (!artifact.startsWith(ownedRoot + sep))
  throw new Error('Only an isolated device-test artifact can be packaged')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
if (
  metadata.kind !== 'isolated-presentation-device-test-artifact' ||
  metadata.platform !== 'ios' ||
  metadata.releaseApproved !== false
)
  throw new Error('Not an unapproved iOS test artifact')
if (!/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(metadata.packageId))
  throw new Error('The app must use an isolated QA identifier')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 200 * 1024 * 1024 })
if (git('diff', 'HEAD', '--name-only', '--', 'ios').toString().trim())
  throw new Error('Review local iOS native changes before creating a reference project')
if (existsSync(resolve(artifact, 'ios')))
  throw new Error('The copied native project already exists; use a new artifact')
const archive = resolve(artifact, 'native-ios-source.tar')
await writeFile(archive, git('archive', '--format=tar', 'HEAD', '--', 'ios'))
execFileSync('tar', ['-xf', archive, '-C', artifact], { cwd: root, stdio: 'inherit' })

const sourcePackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await writeFile(
  resolve(artifact, 'package.json'),
  JSON.stringify(
    {
      name: 'presentation-device-test',
      version: '0.0.0',
      private: true,
      dependencies: sourcePackage.dependencies,
    },
    null,
    2
  )
)
const linkedModules = resolve(artifact, 'node_modules')
if (existsSync(linkedModules)) {
  if ((await realpath(linkedModules)) !== (await realpath(resolve(root, 'node_modules'))))
    throw new Error('Unexpected test dependency link')
} else {
  await symlink(
    resolve(root, 'node_modules'),
    linkedModules,
    process.platform === 'win32' ? 'junction' : 'dir'
  )
}
// This prepares the native resource and plugin configuration. It does not
// sign, install, publish or contact another person's device.
execFileSync(
  process.execPath,
  [resolve(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'ios'],
  { cwd: artifact, stdio: 'inherit' }
)
execFileSync(process.execPath, [resolve(root, 'scripts/normalize-capacitor-swift-path.mjs')], {
  cwd: artifact,
  stdio: 'inherit',
})

const packagePath = resolve(artifact, 'ios/App/CapApp-SPM/Package.swift')
let swiftPackage = await readFile(packagePath, 'utf8')
const localPackagePaths = [...swiftPackage.matchAll(/path:\s*"([^"]*node_modules\/([^"]+))"/g)]
if (localPackagePaths.length !== 4)
  throw new Error('Expected the four configured local native plugins')
const nativePackages = localPackagePaths.map((match) => match[2])
for (const name of [...new Set(nativePackages)]) {
  const source = resolve(root, 'node_modules', name)
  const destination = resolve(artifact, 'native-dependencies', name)
  if (
    !source.startsWith(resolve(root, 'node_modules') + sep) ||
    !destination.startsWith(resolve(artifact, 'native-dependencies') + sep)
  )
    throw new Error('Invalid native package path')
  await mkdir(resolve(destination, '..'), { recursive: true })
  await cp(source, destination, { recursive: true, dereference: true })
}
swiftPackage = swiftPackage.replace(
  /path:\s*"[^"]*node_modules\/([^"]+)"/g,
  (_match, name) => `path: "../../../native-dependencies/${name}"`
)
await writeFile(packagePath, swiftPackage)
const project = await addDeviceTestTarget({
  projectPath: resolve(artifact, 'ios/App/App.xcodeproj/project.pbxproj'),
  packageId: metadata.packageId,
  displayName: metadata.displayName,
})
const nativeHarnessHash = createHash('sha256')
for (const path of [
  'scripts/prepare-presentation-mac-project.mjs',
  'scripts/cinematic-performance/ios/add-device-test-target.mjs',
  'scripts/cinematic-performance/ios/PresentationDeviceTests.swift',
  'scripts/cinematic-performance/ios/Run-on-Mac.command',
]) {
  nativeHarnessHash
    .update(path)
    .update('\0')
    .update(await readFile(resolve(root, path)))
    .update('\0')
}
const nativeHarnessFingerprint = nativeHarnessHash.digest('hex')
await writeFile(
  resolve(artifact, 'mac-project-receipt.json'),
  JSON.stringify(
    {
      kind: 'copied-presentation-xcode-test-project',
      sourceArtifact: metadata,
      nativeSourceRevision: git('rev-parse', 'HEAD').toString().trim(),
      project,
      nativeHarnessFingerprint,
      copiedNativePackages: [...new Set(nativePackages)],
      exportWhitelist: [
        'ios',
        'native-dependencies',
        'device-test-artifact.json',
        'mac-project-receipt.json',
      ],
      excluded: ['node_modules', 'web', 'native-ios-source.tar'],
      actualPhysicalDevice: false,
      signed: false,
      testedOnMac: false,
      next: 'Validate the copied project, export only the whitelist, then build and run the smoke test on the user Mac before collecting device performance evidence.',
    },
    null,
    2
  )
)
console.log(
  JSON.stringify({ artifact, project, actualPhysicalDevice: false, testedOnMac: false }, null, 2)
)
