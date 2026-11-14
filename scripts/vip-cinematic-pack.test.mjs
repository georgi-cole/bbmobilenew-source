import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  createVipCinematicPackManifest,
  exportVipCinematicPack,
  isOptionalVipCinematicAsset,
} from './lib/vip-cinematic-pack.mjs'

test('exports future walking frames intact and leaves shared artwork, audio and credits behind', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vip-cinematic-pack-'))
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('vip-cinematic-pack-'))
    await rm(root, { recursive: true, force: true })
  })
  const write = async (relativePath, content) => {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  await write('src/cinematic/ceremonies/cast.json', '{\r\n  "characters": []\r\n}\r\n')
  const frames = Array.from(
    { length: 8 },
    (_, index) => `assets/ceremonies/characters/aria/walk/frame-${index + 1}.webp`
  )
  for (const [index, frame] of frames.entries()) {
    await write(`public/${frame}`, Buffer.from([index, 1, 2, 3]))
  }
  await write('public/assets/ceremonies/shared/winner-stage.webp', 'shared finale')
  await write('public/assets/ceremonies/characters/aria/timing.js', 'must stay in the app')
  await write('public/assets/music/final_three_week.mp3', 'bundled music')
  await write('public/assets/credits/big-eye-cinematic-background.mp4', 'bundled credits')
  const manifest = await createVipCinematicPackManifest(root)
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    frames
  )
  await write('src/cinematic/ceremonies/cast.json', '{\n  "characters": []\n}\n')
  assert.deepEqual(await createVipCinematicPackManifest(root), manifest)
  const output = path.join(root, 'export')
  await exportVipCinematicPack(root, output, manifest)
  const archive = await readFile(path.join(output, 'vip-cinematics.pack'))
  assert.equal(archive.length, manifest.totalBytes)
  let offset = 0
  for (const frame of frames) {
    const original = await readFile(path.join(root, 'public', frame))
    assert.deepEqual(archive.subarray(offset, offset + original.length), original)
    offset += original.length
    assert.deepEqual(
      await readFile(path.join(output, 'files', frame)),
      await readFile(path.join(root, 'public', frame))
    )
  }
  await assert.rejects(exportVipCinematicPack(root, output, manifest), { code: 'EEXIST' })
  for (const asset of [
    'assets/ceremonies/../music/theme.webp',
    'assets/ceremonies/shared/winner-stage.webp',
    'assets/ceremonies/characters/aria/timing.js',
    'assets/music/final_three_week.mp3',
    'assets/credits/big-eye-cinematic-background.mp4',
  ]) {
    assert.equal(isOptionalVipCinematicAsset(asset), false)
  }
  await write(`public/${frames[7]}`, Buffer.from([99, 1, 2, 3]))
  assert.notEqual((await createVipCinematicPackManifest(root)).revision, manifest.revision)
})
