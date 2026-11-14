import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createVipCinematicPackManifest } from './lib/vip-cinematic-pack.mjs'
import {
  excludeMobileCinematicAssets,
  verifyMobileCinematicAssets,
} from './lib/mobile-cinematic-assets.mjs'

test('mobile packaging excludes every walking frame and retains all Standard media byte for byte', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'mobile-cinematic-assets-'))
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('mobile-cinematic-assets-'))
    await rm(root, { recursive: true, force: true })
  })
  const write = async (file, data) => {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data)
  }
  await write('src/cinematic/ceremonies/cast.json', '{"characters":[]}')
  for (let i = 0; i < 8; i++)
    await write(
      `public/assets/ceremonies/characters/aria/walk/frame-${i}.webp`,
      Buffer.from([i, 1, 2])
    )
  for (const file of [
    'assets/ceremonies/shared/winner-stage.webp',
    'assets/ceremonies/final-decision/monitor.webp',
    'assets/music/final_three_week.mp3',
    'assets/sounds/exit.wav',
    'assets/credits/big-eye-cinematic-background.mp4',
    'assets/skins/aria.webp',
    'assets/ceremonies/characters/aria/timing.js',
  ])
    await write(`public/${file}`, `original bytes for ${file}`)
  const manifest = await createVipCinematicPackManifest(root)
  const output = path.join(root, 'dist')
  await cp(path.join(root, 'public'), output, { recursive: true })
  await assert.rejects(verifyMobileCinematicAssets(root, output, manifest), /still bundled/)
  const result = await excludeMobileCinematicAssets(root, output, manifest)
  assert.deepEqual(result, { excludedFiles: 8, excludedBytes: 24, retainedFiles: 7 })
  for (const file of manifest.files) {
    await assert.rejects(readFile(path.join(output, file.path)), { code: 'ENOENT' })
    assert.equal((await readFile(path.join(root, 'public', file.path))).length, 3)
  }
  await assert.rejects(
    excludeMobileCinematicAssets(root, path.join(root, 'public'), manifest),
    /separate/
  )
  await writeFile(path.join(output, 'assets/music/final_three_week.mp3'), 'damaged')
  await assert.rejects(
    verifyMobileCinematicAssets(root, output, manifest),
    /Bundled public asset changed/
  )
})
