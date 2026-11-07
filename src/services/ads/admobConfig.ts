export interface AdMobConfig {
  mode: 'test' | 'live'
  interstitialId: string
  rewardedId: string
}

const DEMO_UNITS = {
  ios: {
    interstitialId: 'ca-app-pub-3940256099942544/4411468910',
    rewardedId: 'ca-app-pub-3940256099942544/1712485313',
  },
  android: {
    interstitialId: 'ca-app-pub-3940256099942544/1033173712',
    rewardedId: 'ca-app-pub-3940256099942544/5224354917',
  },
}

/** Advertising is disabled unless a native build explicitly enables it. */
export function resolveAdMobConfig(
  platform: string,
  env: Record<string, string | undefined>
): AdMobConfig | null {
  if (platform !== 'ios' && platform !== 'android') return null
  if (env.VITE_ADMOB_MODE === 'test') return { mode: 'test', ...DEMO_UNITS[platform] }
  if (env.VITE_ADMOB_MODE !== 'live') return null
  const interstitialId = env.VITE_ADMOB_INTERSTITIAL_ID?.trim() ?? ''
  const rewardedId = env.VITE_ADMOB_REWARDED_ID?.trim() ?? ''
  const isLiveUnit = (id: string) =>
    /^ca-app-pub-\d{16}\/\d{10}$/.test(id) && !id.startsWith('ca-app-pub-3940256099942544/')
  if (!isLiveUnit(interstitialId) || !isLiveUnit(rewardedId)) return null
  return { mode: 'live', interstitialId, rewardedId }
}
