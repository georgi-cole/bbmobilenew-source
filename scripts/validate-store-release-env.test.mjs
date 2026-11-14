import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const validator = resolve('scripts/validate-store-release-env.mjs')
const valid = {
  VITE_SUPABASE_ENABLED: 'true',
  VITE_SUPABASE_URL: 'https://production-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_public_key',
  VITE_PLAYER_ACCOUNTS_ENABLED: 'true',
  VITE_PLAYER_SIGN_IN_ENABLED: 'true',
  VITE_PRIVACY_POLICY_URL: 'https://release.invalid/privacy',
  VITE_TERMS_URL: 'https://release.invalid/terms',
  VITE_SUPPORT_URL: 'https://release.invalid/support',
  VITE_BUILD_TARGET: 'release',
  VITE_VIP_DEV_ENTITLEMENT: 'false',
  VITE_ADMOB_MODE: 'off',
}

function validate(platform, overrides = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'store-account-env-'))
  try {
    writeFileSync(resolve(directory, `.env.${platform}`), '')
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_'))
    )
    return spawnSync(process.execPath, [validator, platform], {
      cwd: directory,
      env: { ...inherited, ...valid, ...overrides },
      encoding: 'utf8',
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

for (const platform of ['android', 'ios']) {
  test(`${platform} accepts the production account configuration`, () => {
    const result = validate(platform)
    assert.equal(result.status, 0, result.stderr)
  })
  for (const flag of [
    'VITE_SUPABASE_ENABLED',
    'VITE_PLAYER_SIGN_IN_ENABLED',
    'VITE_PLAYER_ACCOUNTS_ENABLED',
  ]) {
    test(`${platform} rejects disabled ${flag} instead of shipping hidden sign-in`, () => {
      const result = validate(platform, { [flag]: 'false' })
      assert.equal(result.status, 1)
      assert.match(result.stderr, new RegExp(flag))
    })
  }
  test(`${platform} rejects server credentials and placeholder account configuration`, () => {
    for (const overrides of [
      { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_bundle' },
      { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_REPLACE_ME' },
      { VITE_SUPABASE_URL: 'https://PROJECT_REF.supabase.co' },
    ]) {
      assert.equal(validate(platform, overrides).status, 1)
    }
  })
}
