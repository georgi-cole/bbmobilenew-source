import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createVipCinematicPackManifest } from './lib/vip-cinematic-pack.mjs'
import { stageMobilePublicAssets } from './lib/mobile-cinematic-assets.mjs'

test('mobile packages keep runtime assets and omit hosted media, QA and source files', async (t) => {
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
  const required = [
    'assets/ceremonies/shared/winner-stage.webp',
    'assets/ceremonies/final-decision/monitor.webp',
    'assets/music/final_three_week.mp3',
    'assets/sounds/exit.wav',
    'assets/credits/credits-background-poster.webp',
    'assets/skins/aria.webp',
    'js/ui/introHub.js',
    'minigames/twin-remastered/part1/index.html',
    'legal/privacy-policy.html',
  ]
  const excluded = [
    'assets/credits/big-eye-cinematic-background.mp4',
    'assets/buttons/preview.html',
    'assets/sounds/README.md',
    'assets/audio.config.json',
    'config/live-config.json',
    'bbmobilenew/js/ui/introHub.js',
    'iphone-simulator.html',
    'vite.svg',
  ]
  for (const file of [...required, ...excluded])
    await write(`public/${file}`, `original bytes for ${file}`)
  const manifest = await createVipCinematicPackManifest(root)
  const output = path.join(root, 'dist')
  await write('dist/assets/compiled.js', 'vite output')
  const result = await stageMobilePublicAssets(root, output, manifest)
  assert.equal(result.retainedFiles, required.length)
  assert.equal(await readFile(path.join(output, 'assets/compiled.js'), 'utf8'), 'vite output')
  for (const file of required) {
    assert.deepEqual(
      await readFile(path.join(output, file)),
      await readFile(path.join(root, 'public', file))
    )
  }
  for (const file of excluded)
    await assert.rejects(readFile(path.join(output, file)), { code: 'ENOENT' })
  for (const file of manifest.files) {
    await assert.rejects(readFile(path.join(output, file.path)), { code: 'ENOENT' })
    assert.equal((await readFile(path.join(root, 'public', file.path))).length, 3)
  }
  await assert.rejects(
    stageMobilePublicAssets(root, path.join(root, 'public'), manifest),
    /separate/
  )
  await write('other-output/iphone-simulator.html', 'stale preview')
  await assert.rejects(
    stageMobilePublicAssets(root, path.join(root, 'other-output'), manifest),
    /Excluded asset still bundled/
  )
  await write('qa-output/assets/RemoteManager-example.js', 'QA module')
  await assert.rejects(
    stageMobilePublicAssets(root, path.join(root, 'qa-output'), manifest),
    /QA module still bundled/
  )
})
