import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnv } from 'vite'

const platform = process.argv[2]
if (!['ios', 'android'].includes(platform)) throw new Error('Expected platform: ios or android')
const env = { ...loadEnv(platform, process.cwd(), ''), ...process.env }
const mode = env.VITE_ADMOB_MODE || 'off'
if (!['off', 'test', 'live'].includes(mode))
  throw new Error('VITE_ADMOB_MODE must be off, test, or live')
const demo =
  platform === 'ios'
    ? 'ca-app-pub-3940256099942544~1458002511'
    : 'ca-app-pub-3940256099942544~3347511713'
const appId = mode === 'live' ? env.VITE_ADMOB_APP_ID?.trim() : demo
if (
  !/^ca-app-pub-\d{16}~\d{10}$/.test(appId ?? '') ||
  (mode === 'live' && appId.startsWith('ca-app-pub-3940256099942544'))
) {
  throw new Error('Set VITE_ADMOB_APP_ID to your platform-specific AdMob app ID (~ separator).')
}
if (mode === 'live') {
  for (const key of ['VITE_ADMOB_INTERSTITIAL_ID', 'VITE_ADMOB_REWARDED_ID']) {
    const value = env[key]?.trim() ?? ''
    if (
      !/^ca-app-pub-\d{16}\/\d{10}$/.test(value) ||
      value.startsWith('ca-app-pub-3940256099942544/')
    ) {
      throw new Error(`Set ${key} to your platform-specific ad unit ID (/ separator).`)
    }
  }
}
const file =
  platform === 'ios' ? 'ios/App/App/Info.plist' : 'android/app/src/main/res/values/admob.xml'
const current = readFileSync(file, 'utf8')
const pattern =
  platform === 'ios'
    ? /(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/
    : /(<string name="admob_app_id" translatable="false">)[^<]*(<\/string>)/
if (!pattern.test(current)) throw new Error(`Missing AdMob app ID entry in ${file}`)
const updated = current.replace(pattern, `$1${appId}$2`)
if (updated !== current) writeFileSync(file, updated)
console.log(`AdMob ${platform}: ${mode} mode configured.`)
