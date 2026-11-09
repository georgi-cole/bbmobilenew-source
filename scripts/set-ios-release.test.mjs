import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const command = fileURLToPath(new URL('./set-ios-release.mjs', import.meta.url))
const sequencePath = 'store-assets/icon-progression/sequence.json'
const catalogPath = 'ios/App/App/Assets.xcassets'
const icons = ['AppIcon', ...Array.from({ length: 7 }, (_, i) => `StoryIconStage0${i + 2}`)]

function releaseFixture(t, { missingIcon } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'big-eye-ios-release-'))
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  })

  mkdirSync(join(directory, dirname(sequencePath)), { recursive: true })
  copyFileSync(sequencePath, join(directory, sequencePath))
  for (const icon of icons) {
    if (icon === missingIcon) continue
    const setPath = join(catalogPath, `${icon}.appiconset`)
    mkdirSync(join(directory, setPath), { recursive: true })
    copyFileSync(join(setPath, 'Contents.json'), join(directory, setPath, 'Contents.json'))
  }

  const config = join(directory, 'ios/App/Release.xcconfig')
  writeFileSync(
    config,
    'MARKETING_VERSION = 1.0.0\nASSETCATALOG_COMPILER_APPICON_NAME = AppIcon\nASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = NO\n'
  )

  return {
    config,
    read: () => readFileSync(config, 'utf8'),
    set(version) {
      const result = spawnSync(process.execPath, [command, version], {
        cwd: directory,
        encoding: 'utf8',
      })
      assert.ifError(result.error)
      return result
    },
  }
}

test('advances one frame per new version, keeps retries stable, and wraps after frame eight', (t) => {
  const fixture = releaseFixture(t)
  const versions = ['1.0.4', '1.1.0', '1.10.0', '2.0.0', '2.0.1', '2.1.0', '3.0.0', '3.1.0']

  versions.forEach((version, index) => {
    const result = fixture.set(version)
    assert.equal(result.status, 0, result.stderr)
    const selectedIcon = icons[(index + 1) % icons.length]
    const config = fixture.read()
    assert.ok(config.includes(`MARKETING_VERSION = ${version}\n`))
    assert.ok(config.includes(`ASSETCATALOG_COMPILER_APPICON_NAME = ${selectedIcon}\n`))
    assert.ok(config.includes('ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = NO\n'))
    assert.equal(fixture.set(version).status, 0)
    assert.equal(fixture.read(), config)
  })
})

test('rejects malformed and older versions without changing the release settings', (t) => {
  const fixture = releaseFixture(t)
  const config = fixture.read()
  assert.match(fixture.set('1.1.0-beta').stderr, /three-part/)
  assert.match(fixture.set('0.9.9').stderr, /higher than/)
  assert.equal(fixture.read(), config)
  assert.equal(existsSync(`${fixture.config}.next`), false)
})

test('keeps the current release intact if the next frame is missing', (t) => {
  const fixture = releaseFixture(t, { missingIcon: 'StoryIconStage02' })
  const config = fixture.read()
  const result = fixture.set('1.0.1')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /StoryIconStage02 is missing/)
  assert.equal(fixture.read(), config)
  assert.equal(existsSync(`${fixture.config}.next`), false)
})

test('leaves another release command’s draft alone', (t) => {
  const fixture = releaseFixture(t)
  const draft = `${fixture.config}.next`
  writeFileSync(draft, 'another release in progress')
  const result = fixture.set('1.0.1')
  assert.equal(result.status, 1)
  assert.equal(readFileSync(draft, 'utf8'), 'another release in progress')
  assert.ok(fixture.read().includes('MARKETING_VERSION = 1.0.0\n'))
})
