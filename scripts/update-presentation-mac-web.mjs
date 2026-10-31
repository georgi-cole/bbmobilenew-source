import { readFile, writeFile, readdir, copyFile, mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const argument = process.argv.find((value) => value.startsWith('--artifact='))?.slice(11)
if (!argument) throw new Error('Pass --artifact=<prepared isolated iOS artifact>')
const artifact = resolve(root, argument)
if (!artifact.startsWith(resolve(root, 'renders/presentation-device-tests') + sep))
  throw new Error('An isolated staging artifact is required')
const metadata = JSON.parse(await readFile(resolve(artifact, 'device-test-artifact.json'), 'utf8'))
const receiptPath = resolve(artifact, 'mac-project-receipt.json')
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
if (
  metadata.kind !== 'isolated-presentation-device-test-artifact' ||
  metadata.platform !== 'ios' ||
  metadata.releaseApproved !== false ||
  receipt.kind !== 'copied-presentation-xcode-test-project' ||
  receipt.sourceArtifact.packageId !== metadata.packageId ||
  receipt.sourceArtifact.sourceFingerprint !== metadata.sourceFingerprint
)
  throw new Error('The native project must have identical app sources and media')
const web = resolve(artifact, 'web')
const native = resolve(artifact, 'ios/App/App/public')
const copiedFiles = []
for (const entry of await readdir(resolve(web, 'assets'), { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(js|css)$/.test(entry.name)) continue
  await mkdir(resolve(native, 'assets'), { recursive: true })
  await copyFile(resolve(web, 'assets', entry.name), resolve(native, 'assets', entry.name))
  copiedFiles.push(`assets/${entry.name}`)
}
await copyFile(resolve(web, 'index.html'), resolve(native, 'index.html'))
receipt.previousInstrumentationFingerprint = receipt.sourceArtifact.instrumentationFingerprint
receipt.sourceArtifact = metadata
receipt.webHarnessUpdate = {
  copiedFiles,
  staticMediaReplaced: false,
  fingerprint: createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex'),
}
await writeFile(receiptPath, JSON.stringify(receipt, null, 2))
console.log(
  JSON.stringify(
    {
      artifact,
      updatedCodeFiles: copiedFiles.length + 1,
      sourceFingerprint: metadata.sourceFingerprint,
      instrumentationFingerprint: metadata.instrumentationFingerprint,
      actualPhysicalDevice: false,
      testedOnMac: false,
    },
    null,
    2
  )
)
