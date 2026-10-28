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

for (const key of requiredPublicUrls) {
  if (!isProductionHttpsUrl(values[key] ?? '')) {
    issues.push(`${key} must be a real public HTTPS URL (not example.com).`)
  }
}

if (values.VITE_VIP_DEV_ENTITLEMENT === 'true') {
  issues.push('VITE_VIP_DEV_ENTITLEMENT must not be true in a store build.')
}

if (values.VITE_BUILD_TARGET === 'mobile-dev') {
  issues.push('VITE_BUILD_TARGET=mobile-dev must not be used in a store build.')
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
  issues.push(
    'Online AI is enabled: update the privacy policy, privacy manifest, retention/deletion documentation, and both store privacy forms.'
  )
}

if (issues.length > 0) {
  console.error(`Store environment validation failed for ${platform}:`)
  for (const issue of issues) console.error(`- ${issue}`)
  process.exit(1)
}

console.log(`Store environment validation passed for ${platform}.`)
