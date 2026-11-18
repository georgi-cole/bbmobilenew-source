import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { publishCinematicPack } from './publish-vip-cinematic-pack.mjs'

async function fixture(options = {}) {
  const folder = path.resolve('renders', `cinematic-publish-test-${randomUUID()}`)
  await mkdir(folder, { recursive: true })
  const images = [Buffer.from('first image'), Buffer.from('second image')]
  const pack = Buffer.concat(images)
  const manifest = {
    revision: 'a'.repeat(64),
    totalBytes: pack.length,
    files: images.map((image, index) => ({
      path: `assets/ceremonies/characters/bea/${index}.webp`,
      bytes: image.length,
      sha256: createHash('sha256').update(image).digest('hex'),
    })),
  }
  const packPath = path.join(folder, 'vip-cinematics.pack')
  const manifestPath = path.join(folder, 'manifest.json')
  await writeFile(packPath, options.localCorrupt ? Buffer.alloc(pack.length) : pack)
  await writeFile(manifestPath, JSON.stringify(manifest))
  let exists = options.exists ?? false
  let draft = options.draft ?? false
  let assets = options.assets ?? (exists ? ['vip-cinematics.pack', 'manifest.json'] : [])
  let attempts = 0
  const calls = []
  const runGh = async (args) => {
    calls.push(args)
    assert.equal(args.at(-1), 'georgi-cole/bbmobilenew-source')
    assert.ok(!args.includes('--clobber'))
    if (args[1] === 'view') {
      if (options.denied) throw new Error('HTTP 403 Forbidden')
      if (!exists) throw new Error('release not found')
      return JSON.stringify({ isDraft: draft, assets: assets.map((name) => ({ name })) })
    }
    if (args[1] === 'create') {
      assert.ok(args.includes('--draft'))
      assert.equal(args[args.indexOf('--target') + 1], 'c'.repeat(40))
      exists = true
      draft = true
    }
    if (args[1] === 'upload') assets = ['vip-cinematics.pack', 'manifest.json']
    if (args[1] === 'edit') {
      assert.ok(assets.includes('vip-cinematics.pack'))
      draft = false
    }
    return ''
  }
  const fetchImpl = async (url, init) => {
    calls.push(['fetch', url])
    assert.equal(draft, false, 'download cannot be checked before publication')
    assert.equal(init.headers, undefined, 'verify the anonymous download used by installed apps')
    assert.equal(
      url,
      `https://github.com/georgi-cole/bbmobilenew-source/releases/download/vip-cinematics-${manifest.revision}/vip-cinematics.pack`
    )
    if (attempts++ < (options.pending404s ?? 0)) return new Response('Not found', { status: 404 })
    return new Response(options.remoteCorrupt ? Buffer.alloc(pack.length) : pack)
  }
  const publish = () =>
    publishCinematicPack({
      manifest,
      packPath,
      manifestPath,
      sourceSha: 'c'.repeat(40),
      runGh,
      fetchImpl,
      pause: async () => {},
    })
  return { publish, calls }
}

test('publishes a missing revision before verifying every public image', async () => {
  const { publish, calls } = await fixture()
  const result = await publish()
  assert.equal(result.revision, 'a'.repeat(64))
  assert.deepEqual(
    calls.map((args) => (args[0] === 'fetch' ? 'fetch' : args[1])),
    ['view', 'create', 'upload', 'edit', 'fetch']
  )
})

test('existing valid immutable media is verified without uploads or replacements', async () => {
  const { publish, calls } = await fixture({ exists: true })
  await publish()
  assert.deepEqual(
    calls.map((args) => (args[0] === 'fetch' ? 'fetch' : args[1])),
    ['view', 'fetch']
  )
})

test('repairs an interrupted draft without creating a duplicate release', async () => {
  const { publish, calls } = await fixture({ exists: true, draft: true, assets: ['manifest.json'] })
  await publish()
  const upload = calls.find((args) => args[1] === 'upload')
  assert.ok(upload.some((arg) => arg.endsWith('vip-cinematics.pack')))
  assert.ok(!upload.some((arg) => arg.endsWith('manifest.json')))
  assert.ok(!calls.some((args) => args[1] === 'create'))
})

test('retries short public-CDN propagation delays but fails a persistent 404', async () => {
  const ready = await fixture({ exists: true, pending404s: 2 })
  await ready.publish()
  assert.equal(ready.calls.filter((args) => args[0] === 'fetch').length, 3)
  const missing = await fixture({ exists: true, pending404s: 10 })
  await assert.rejects(missing.publish(), /HTTP 404/)
})

test('rejects corrupt local media before publishing and corrupt remote media before store builds', async () => {
  const local = await fixture({ localCorrupt: true })
  await assert.rejects(local.publish(), /Cinematic image does not match/)
  assert.equal(local.calls.length, 0)
  const remote = await fixture({ exists: true, remoteCorrupt: true })
  await assert.rejects(remote.publish(), /Cinematic image does not match/)
  assert.ok(!remote.calls.some((args) => args[1] === 'upload'))
})

test('permission errors never create or replace a release', async () => {
  const { publish, calls } = await fixture({ denied: true })
  await assert.rejects(publish(), /403/)
  assert.equal(calls.length, 1)
})
