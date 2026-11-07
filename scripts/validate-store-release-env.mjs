import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const platform = process.argv[2]
if (platform !== 'android' && platform !== 'ios') {
  console.error('Usage: node scripts/validate-store-release-env.mjs <android|ios>')
  process.exit(2)
}

const filePath = resolve(`.env.${platform}`)
if (!existsSync(filePath) && !existsSync(`${filePath}.local`)) {
  console.error(
    `Missing .env.${platform}. Copy .env.${platform}.example, replace every placeholder, and keep the real file private.`
  )
  process.exit(1)
}

// Match Vite's actual build configuration, including .local and process overrides.
const values = { ...loadEnv(platform, process.cwd(), ''), ...process.env }

const issues = []
const requiredPublicUrls = ['VITE_PRIVACY_POLICY_URL', 'VITE_TERMS_URL', 'VITE_SUPPORT_URL']

function isProductionHttpsUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname !== 'example.com' &&
      !url.hostname.endsWith('.example.com')
    )
  } catch {
    return false
  }
}

function isPublishableSupabaseKey(value) {
  if (/^sb_publishable_[a-zA-Z0-9_-]{20,}$/.test(value)) return true
  try {
    const parts = value.split('.')
    return (
      parts.length === 3 &&
      parts.every((part) => /^[a-zA-Z0-9_-]+$/.test(part)) &&
      JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon'
    )
  } catch {
    return false
  }
}

for (const key of requiredPublicUrls) {
  if (!isProductionHttpsUrl(values[key] ?? '')) {
    issues.push(`${key} must be a real public HTTPS URL (not example.com).`)
  }
}

if (values.VITE_VIP_DEV_ENTITLEMENT === 'true') {
  issues.push('VITE_VIP_DEV_ENTITLEMENT must not be true in a store build.')
}

if (values.VITE_BUILD_TARGET && values.VITE_BUILD_TARGET !== 'release') {
  issues.push(
    'VITE_BUILD_TARGET must be release in a store build; developer targets unlock paid features.'
  )
}

for (const flag of ['VITE_SUPABASE_ENABLED', 'VITE_PLAYER_ACCOUNTS_ENABLED']) {
  if (values[flag] !== 'true') issues.push(`${flag} must be true for store cloud profiles.`)
}
const supabaseUrl = values.VITE_SUPABASE_URL?.trim() ?? ''
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl)) {
  issues.push('VITE_SUPABASE_URL must be the HTTPS URL of the deployed Supabase project.')
}
if (!isPublishableSupabaseKey(values.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '')) {
  issues.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key.')
}

const adsMode = values.VITE_ADMOB_MODE || 'off'
if (!['off', 'live'].includes(adsMode)) {
  issues.push(
    'VITE_ADMOB_MODE must be off or live in a store build; test ads are development-only.'
  )
}
if (adsMode === 'live') {
  for (const [key, separator] of [
    ['VITE_ADMOB_APP_ID', '~'],
    ['VITE_ADMOB_INTERSTITIAL_ID', '/'],
    ['VITE_ADMOB_REWARDED_ID', '/'],
  ]) {
    const value = values[key] || ''
    if (
      !new RegExp(`^ca-app-pub-\\d{16}${separator}\\d{10}$`).test(value) ||
      value.startsWith('ca-app-pub-3940256099942544')
    ) {
      issues.push(`${key} must be your real ${platform} AdMob ID, not a Google demo ID.`)
    }
  }
}

for (const key of ['VITE_BIG_EYE_VIP_API_URL', 'VITE_REMOTE_CONFIG_URL']) {
  if (values[key] && !isProductionHttpsUrl(values[key])) {
    issues.push(`${key} must use a real production HTTPS URL when configured.`)
  }
}

if (values.VITE_BIG_EYE_AI_ENABLED === 'true') {
  const apiKey = platform === 'android' ? 'VITE_ANDROID_API_BASE_URL' : 'VITE_IOS_API_BASE_URL'
  if (!isProductionHttpsUrl(values[apiKey] ?? '')) {
    issues.push(`${apiKey} is required and must use production HTTPS when online AI is enabled.`)
  }
}

if (issues.length > 0) {
  console.error(`Store environment validation failed for ${platform}:`)
  for (const issue of issues) console.error(`- ${issue}`)
  process.exit(1)
}

console.log(`Store environment validation passed for ${platform}.`)
