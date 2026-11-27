import { Capacitor, registerPlugin } from '@capacitor/core'
import type { AppEnvironment } from './appEnvironment'

type NativeDistribution = {
  channel: 'app_store' | 'testflight' | 'development' | 'google_play' | 'sideloaded' | 'unknown'
  source: string
  version?: string
  build?: string
}

type Referrer = {
  available: boolean
  source?: string
  medium?: string
  campaign?: string
  campaign_id?: string
  referrer_present?: boolean
  gclid_present?: boolean
  gbraid_present?: boolean
}

const AppDistribution = registerPlugin<{ getDistribution(): Promise<NativeDistribution> }>(
  'AppDistribution'
)
const InstallAttribution = registerPlugin<{
  getDistribution(): Promise<NativeDistribution>
  getAttribution(): Promise<Referrer>
}>('InstallAttribution')

export async function readAppDistribution(buildEnvironment: AppEnvironment) {
  const platform = Capacitor.getPlatform()
  const native = Capacitor.isNativePlatform()
  const buildChannel =
    buildEnvironment === 'production' ? (native ? 'store' : 'web') : buildEnvironment
  let distribution: NativeDistribution | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (native) {
      const bridge = platform === 'ios' ? AppDistribution : InstallAttribution
      distribution = await Promise.race([
        bridge.getDistribution(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(resolve, 3000)
        }),
      ])
    }
  } catch {
    // Older runtimes and missing native metadata remain unclassified.
  } finally {
    clearTimeout(timer)
  }
  const channel = distribution?.channel ?? (native ? 'unknown' : 'web')
  const explicitTest = buildEnvironment !== 'production'
  const test = explicitTest || channel === 'testflight' || channel === 'development'
  const production = !test && (channel === 'app_store' || channel === 'google_play')
  return {
    platform,
    appVersion: distribution?.version ?? import.meta.env.VITE_APP_VERSION ?? 'unknown',
    appBuild: distribution?.build,
    fields: {
      distribution_channel: channel,
      distribution_source: distribution?.source ?? (native ? 'unavailable' : 'browser'),
      build_channel: buildChannel,
      traffic_class: test ? 'test' : production ? 'production' : 'unclassified',
      is_test_install: test ? true : production ? false : null,
    },
  }
}

export async function readPlayInstallAttribution() {
  try {
    const result = await InstallAttribution.getAttribution()
    if (!result.available) return null
    return {
      install_source: result.source ?? 'unknown',
      install_medium: result.medium,
      install_campaign: result.campaign,
      install_campaign_id: result.campaign_id,
      referrer_present: result.referrer_present === true,
      gclid_present: result.gclid_present === true,
      gbraid_present: result.gbraid_present === true,
    }
  } catch {
    return null
  }
}
