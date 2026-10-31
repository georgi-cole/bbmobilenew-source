import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir, copyFile, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { setMacArchiveScriptModes } from './cinematic-performance/ios/archive-script-modes.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const argument = process.argv.find((value) => value.startsWith('--artifact='))?.slice(11)
if (!argument) throw new Error('Pass --artifact=<prepared isolated iOS artifact>')
const artifact = resolve(root, argument)
if (!artifact.startsWith(resolve(root, 'renders/presentation-device-tests') + sep))
  throw new Error('An isolated staging artifact is required')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
const receipt = JSON.parse(await readFile(resolve(artifact, 'mac-project-receipt.json'), 'utf8'))
if (
  metadata.platform !== 'ios' ||
  metadata.releaseApproved !== false ||
  receipt.sourceArtifact?.instrumentationFingerprint !== metadata.instrumentationFingerprint ||
  receipt.sourceArtifact?.sourceFingerprint !== metadata.sourceFingerprint ||
  !/^[a-f0-9]{64}$/.test(metadata.sourceFingerprint) ||
  !/^com\.georgicole\.thebigeye\.q(?:base|candidate)[a-f0-9]{8}$/.test(metadata.packageId)
)
  throw new Error('The matching native harness must be updated before export')
const packageName = `${metadata.variant}-${metadata.sourceFingerprint.slice(0, 12)}`
const originalSourceFingerprint =
  metadata.installationIdentitySourceFingerprint ?? metadata.sourceFingerprint
const originalPackageName = `${metadata.variant}-${originalSourceFingerprint.slice(0, 12)}`
const original = resolve(root, 'renders/presentation-mac-tests', originalPackageName)
const originalMetadata = JSON.parse(
  await readFile(resolve(original, 'device-test-artifact.json'), 'utf8')
)
const originalReceipt = JSON.parse(
  await readFile(resolve(original, 'mac-project-receipt.json'), 'utf8')
)
if (
  originalMetadata.sourceFingerprint !== originalSourceFingerprint ||
  originalMetadata.packageId !== metadata.packageId ||
  originalMetadata.baseRevision !== metadata.baseRevision ||
  originalReceipt.nativeHarnessFingerprint !== receipt.nativeHarnessFingerprint
)
  throw new Error('An update must preserve the isolated installation and native test harness')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function treeFingerprint(directory, omit = () => false) {
  const hash = createHash('sha256')
  async function visit(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const name = `${prefix}${entry.name}`
      const absolute = resolve(path, entry.name)
      if ((await lstat(absolute)).isSymbolicLink())
        throw new Error('Updates cannot traverse native package links')
      if (entry.isDirectory()) await visit(absolute, `${name}/`)
      else if (!omit(name))
        hash
          .update(name)
          .update('\0')
          .update(await readFile(absolute))
          .update('\0')
    }
  }
  await visit(directory)
  return hash.digest('hex')
}
const staticPublic = (name) => name === 'index.html' || /^assets\/[^/]+\.(js|css)$/.test(name)
const staticPublicFingerprint = await treeFingerprint(
  resolve(artifact, 'ios/App/App/public'),
  staticPublic
)
const generatedAndroidBuild = (name) => /(?:^|\/)android\/(?:build|\.gradle)\//.test(name)
const nativeDependencyFingerprint = await treeFingerprint(
  resolve(artifact, 'native-dependencies'),
  generatedAndroidBuild
)
if (
  staticPublicFingerprint !==
    (await treeFingerprint(resolve(original, 'ios/App/App/public'), staticPublic)) ||
  nativeDependencyFingerprint !==
    (await treeFingerprint(resolve(original, 'native-dependencies'), generatedAndroidBuild)) ||
  sha256(await readFile(resolve(artifact, 'ios/App/App/capacitor.config.json'))) !==
    sha256(await readFile(resolve(original, 'ios/App/App/capacitor.config.json')))
)
  throw new Error('Static assets, SDKs or native configuration changed; export a full package')
const proof = JSON.parse(await readFile(resolve(original, 'copied-media-proof.json'), 'utf8'))
for (const media of proof.verifiedMedia) {
  if (sha256(await readFile(resolve(artifact, 'ios/App/App/public', media.path))) !== media.sha256)
    throw new Error(`The original media changed: ${media.path}`)
}
const output = resolve(
  root,
  'renders/presentation-mac-updates',
  `${packageName}-${metadata.instrumentationFingerprint.slice(0, 8)}`
)
if (existsSync(output) || existsSync(`${output}.zip`))
  throw new Error('Preserve the existing update; export into a fresh version')
const payload = resolve(output, 'payload')
await mkdir(resolve(payload, 'ios/App/App/public/assets'), { recursive: true })
const files = [
  'device-test-artifact.json',
  'mac-project-receipt.json',
  'ios/App/App/public/index.html',
]
for (const item of await readdir(resolve(artifact, 'ios/App/App/public/assets'), {
  withFileTypes: true,
})) {
  if (item.isFile() && /\.(js|css)$/.test(item.name))
    files.push(`ios/App/App/public/assets/${item.name}`)
}
const checksums = []
for (const file of files) {
  if (file === 'mac-project-receipt.json')
    await writeFile(
      resolve(payload, file),
      JSON.stringify(
        {
          ...receipt,
          project: originalReceipt.project,
          preparedSourceProject: receipt.project,
          installationProjectPreserved: true,
          staticPublicFingerprint,
          nativeDependencyFingerprint,
        },
        null,
        2
      )
    )
  else await copyFile(resolve(artifact, file), resolve(payload, file))
  checksums.push(`${sha256(await readFile(resolve(payload, file)))}  ${file}`)
}
await writeFile(
  resolve(payload, 'copied-media-proof.json'),
  JSON.stringify(
    { ...proof, sourceArtifact: metadata, staticPublicFingerprint, nativeDependencyFingerprint },
    null,
    2
  )
)
checksums.push(
  `${sha256(await readFile(resolve(payload, 'copied-media-proof.json')))}  copied-media-proof.json`
)
await writeFile(
  resolve(payload, 'Run-on-Mac.command'),
  (
    await readFile(resolve(root, 'scripts/cinematic-performance/ios/Run-on-Mac.command'), 'utf8')
  ).replaceAll('\r\n', '\n')
)
checksums.push(
  `${sha256(await readFile(resolve(payload, 'Run-on-Mac.command')))}  Run-on-Mac.command`
)
await writeFile(resolve(payload, 'SHA256SUMS'), `${checksums.join('\n')}\n`)
const command = `#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
update_root="$PWD"
echo "Choose the extracted ${originalPackageName} folder from the original full package."
target="$(osascript -e 'POSIX path of (choose folder with prompt "Choose ${originalPackageName} from the original full package")')"
if [[ ! -f "$target/device-test-artifact.json" || ! -f "$target/ios/App/App.xcodeproj/project.pbxproj" ]]; then
  echo "This is not the original Xcode test package."; exit 1
fi
if ! grep -Eq '"sourceFingerprint"[[:space:]]*:[[:space:]]*"(${originalSourceFingerprint}|${metadata.sourceFingerprint})"' "$target/device-test-artifact.json" || ! grep -Fq '${metadata.packageId}' "$target/device-test-artifact.json"; then
  echo "The package belongs to another version. No files were changed."; exit 1
fi
if ! grep -Fq '${receipt.nativeHarnessFingerprint}' "$target/mac-project-receipt.json"; then
  echo "The native test project differs. No files were changed."; exit 1
fi
(cd payload && shasum -a 256 -c SHA256SUMS)
backup="$target/presentation-update-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup"
cp "$target/device-test-artifact.json" "$target/mac-project-receipt.json" "$target/copied-media-proof.json" "$backup/"
cp "$target/ios/App/App/public/index.html" "$backup/"
mkdir -p "$target/ios/App/App/public/assets"
cp payload/ios/App/App/public/assets/*.js "$target/ios/App/App/public/assets/"
cp payload/ios/App/App/public/assets/*.css "$target/ios/App/App/public/assets/"
cp payload/device-test-artifact.json "$target/"
cp payload/mac-project-receipt.json "$target/"
cp payload/copied-media-proof.json "$target/"
cp payload/Run-on-Mac.command "$target/"
chmod u+x "$target/Run-on-Mac.command"
cp payload/ios/App/App/public/index.html "$target/ios/App/App/public/"
(cd "$target" && shasum -a 256 -c "$update_root/payload/SHA256SUMS")
echo "Update verified. Xcode signing settings and media are preserved."
echo "Run testDeviceFixtureSmoke before collecting performance measurements."
open "$target/ios/App/App.xcodeproj"
`
await writeFile(resolve(output, 'Apply-update.command'), command, { mode: 0o755 })
await writeFile(
  resolve(output, 'READ-ME.txt'),
  [
    'THE BIG EYE — Mac test harness update',
    `For the original full package: ${originalPackageName}.zip`,
    `Instrumentation: ${metadata.instrumentationFingerprint}`,
    '',
    'Copy this small ZIP to the Mac and extract it. Close Xcode before applying.',
    'Open Apply-update.command and choose the extracted original package folder.',
    'If Finder does not run it, open Terminal in this update folder and run: bash Apply-update.command',
    'The script verifies the matching version and all copied files. It updates built game/test code and receipts.',
    'Your Xcode signing settings, native plugins, native tests and static media are preserved.',
    'Earlier performance captures must be repeated with this exact source and instrumentation version.',
    'Run testDeviceFixtureSmoke on the connected iPhone first. This package has not been compiled or tested on a Mac.',
    'This is an unapproved QA build; installation or smoke success does not pass the performance gate.',
    '',
  ].join('\n')
)
execFileSync(
  'tar',
  ['-a', '-cf', `${output}.zip`, '-C', resolve(output, '..'), output.split(sep).at(-1)],
  { cwd: root, stdio: 'inherit' }
)
const scriptModes = setMacArchiveScriptModes(`${output}.zip`)
console.log(
  JSON.stringify({
    archive: `${output}.zip`,
    files: checksums.length,
    ...scriptModes,
    actualPhysicalDevice: false,
  })
)
