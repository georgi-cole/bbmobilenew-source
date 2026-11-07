import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const validator = fileURLToPath(new URL('./validate-store-release-env.mjs', import.meta.url))
const releaseEnvironment = {
  VITE_BUILD_TARGET: 'release',
  VITE_VIP_DEV_ENTITLEMENT: 'false',
  VITE_SUPABASE_ENABLED: 'false',
  VITE_BIG_EYE_AI_ENABLED: 'false',
  VITE_ADMOB_MODE: 'off',
  VITE_PRIVACY_POLICY_URL: 'https://game.example.org/privacy',
  VITE_TERMS_URL: 'https://game.example.org/terms',
  VITE_SUPPORT_URL: 'https://game.example.org/support',
}

function validate(platform, overrides = {}, localOverrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'the-big-eye-store-env-'))
  const serialize = (values) =>
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
  try {
    writeFileSync(join(directory, `.env.${platform}`), serialize(releaseEnvironment))
    writeFileSync(join(directory, '.env.local'), serialize(localOverrides))
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_'))
    )
    const result = spawnSync(process.execPath, [validator, platform], {
      cwd: directory,
      env: { ...env, ...overrides },
      encoding: 'utf8',
    })
    assert.ifError(result.error)
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.match(directory, /the-big-eye-store-env-/)
    rmSync(directory, { recursive: true, force: true })
  }
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: accepts an offline release and explicit platform overrides of developer defaults`, () => {
    const result = validate(
      platform,
      {},
      {
        VITE_VIP_DEV_ENTITLEMENT: 'true',
        VITE_SUPABASE_ENABLED: 'true',
      }
    )
    assert.equal(result.status, 0, result.output)
  })

  for (const target of ['admin', 'test', 'mobile-dev']) {
    test(`${platform}: rejects the ${target} target from a process override`, () => {
      const result = validate(platform, { VITE_BUILD_TARGET: target })
      assert.equal(result.status, 1)
      assert.match(result.output, /VITE_BUILD_TARGET must be release/)
    })
  }

  test(`${platform}: rejects inherited cloud collection even when AI is disabled`, () => {
    const result = validate(platform, { VITE_SUPABASE_ENABLED: 'true' })
    assert.equal(result.status, 1)
    assert.match(result.output, /Cloud backup and analytics are enabled/)
  })

  test(`${platform}: rejects a Diary Room endpoint independently of the AI flag`, () => {
    const result = validate(platform, {
      VITE_BIG_EYE_VIP_API_URL: 'https://api.example.org',
      VITE_BIG_EYE_AI_ENABLED: 'false',
    })
    assert.equal(result.status, 1)
    assert.match(result.output, /online Diary Room endpoint must be unset/)
  })

  test(`${platform}: rejects development entitlements and demo advertising`, () => {
    const result = validate(platform, {
      VITE_VIP_DEV_ENTITLEMENT: 'true',
      VITE_ADMOB_MODE: 'test',
    })
    assert.equal(result.status, 1)
    assert.match(result.output, /VITE_VIP_DEV_ENTITLEMENT must not be true/)
    assert.match(result.output, /test ads are development-only/)
  })

  test(`${platform}: requires live publisher IDs for each advertising format`, () => {
    const result = validate(platform, {
      VITE_ADMOB_MODE: 'live',
      VITE_ADMOB_APP_ID: 'ca-app-pub-3940256099942544~1458002511',
    })
    assert.equal(result.status, 1)
    for (const key of ['APP', 'INTERSTITIAL', 'REWARDED']) {
      assert.match(result.output, new RegExp(`VITE_ADMOB_${key}_ID must be your real`))
    }
  })

  test(`${platform}: accepts complete live advertising configuration`, () => {
    const result = validate(platform, {
      VITE_ADMOB_MODE: 'live',
      VITE_ADMOB_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
      VITE_ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1234567890123456/1234567891',
      VITE_ADMOB_REWARDED_ID: 'ca-app-pub-1234567890123456/1234567892',
    })
    assert.equal(result.status, 0, result.output)
  })
}
