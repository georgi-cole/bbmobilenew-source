import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createVipCinematicPackManifest,
  exportVipCinematicPack,
  repositoryRoot,
} from './lib/vip-cinematic-pack.mjs'

const repository = 'georgi-cole/bbmobilenew-source'

export function verifyCinematicPack(bytes, manifest) {
  assert.equal(
    bytes.length,
    manifest.totalBytes,
    'Cinematic package size does not match this build'
  )
  let offset = 0
  for (const file of manifest.files) {
    const image = bytes.subarray(offset, offset + file.bytes)
    assert.equal(
      createHash('sha256').update(image).digest('hex'),
      file.sha256,
      `Cinematic image does not match this build: ${file.path}`
    )
    offset += file.bytes
  }
  assert.equal(offset, bytes.length, 'Cinematic package has unexpected trailing content')
}

export async function publishCinematicPack({
  manifest,
  packPath,
  manifestPath,
  sourceSha,
  runGh = (args) => execFileSync('gh', args, { encoding: 'utf8', windowsHide: true }),
  fetchImpl = fetch,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'An exact source commit is required')
  assert.match(manifest.revision, /^[a-f0-9]{64}$/)
  verifyCinematicPack(await readFile(packPath), manifest)
  const tag = `vip-cinematics-${manifest.revision}`
  const gh = (args) => runGh([...args, '--repo', repository])
  let release
  try {
    release = JSON.parse(await gh(['release', 'view', tag, '--json', 'isDraft,assets']))
  } catch (error) {
    // Authentication, permission and server failures must not be mistaken for a missing release.
    if (!/release not found|HTTP 404/i.test(`${error.message}\n${error.stderr ?? ''}`)) throw error
    await gh([
      'release',
      'create',
      tag,
      '--target',
      sourceSha,
      '--draft',
      '--latest=false',
      '--title',
      `VIP cinematic media ${manifest.revision.slice(0, 12)}`,
      '--notes',
      'Optional cinematic artwork verified against the exact mobile build manifest. Standard play, music and credits remain bundled.',
    ])
    release = { isDraft: true, assets: [] }
  }
  const missing = []
  if (!release.assets.some((asset) => asset.name === 'vip-cinematics.pack')) missing.push(packPath)
  if (!release.assets.some((asset) => asset.name === 'manifest.json')) missing.push(manifestPath)
  if (missing.length) await gh(['release', 'upload', tag, ...missing])
  if (release.isDraft) await gh(['release', 'edit', tag, '--draft=false', '--latest=false'])

  // Check the same anonymous, redirected URL used by installed iOS/Android apps.
  // Existing assets are immutable: a corrupt published package fails instead of being overwritten.
  const url = `https://github.com/${repository}/releases/download/${tag}/vip-cinematics.pack`
  for (let attempt = 0; ; attempt++) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(120_000) })
    if (response.status === 404 && attempt < 4) {
      await response.body?.cancel()
      await pause(2_000 * (attempt + 1))
      continue
    }
    if (response.status !== 200)
      throw new Error(`Public cinematic download returned HTTP ${response.status}`)
    verifyCinematicPack(Buffer.from(await response.arrayBuffer()), manifest)
    return { revision: manifest.revision, bytes: manifest.totalBytes, url }
  }
}

async function main() {
  const manifest = await createVipCinematicPackManifest()
  const pinned = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'src/cinematic/media/vipCinematicPackManifest.json'),
      'utf8'
    )
  )
  assert.deepEqual(manifest, pinned, 'Cinematic artwork changed without updating the app manifest')
  const output = path.join(
    process.env.RUNNER_TEMP ?? path.join(repositoryRoot, 'renders'),
    `cinematic-publication-${randomUUID()}`
  )
  await exportVipCinematicPack(repositoryRoot, output, manifest)
  const result = await publishCinematicPack({
    manifest,
    packPath: path.join(output, 'vip-cinematics.pack'),
    manifestPath: path.join(output, 'manifest.json'),
    sourceSha: process.env.GITHUB_SHA,
  })
  console.log(
    `Verified public cinematic package ${result.revision}: ${result.bytes} bytes. Store builds may proceed.`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
