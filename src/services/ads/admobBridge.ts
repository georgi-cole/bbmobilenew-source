import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob'
import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'
import {
  canUseAdultServices,
  canUseOptionalFeature,
  subscribePlayerSafety,
} from '../../safety/playerSafety'
import { resolveAdMobConfig, type AdMobConfig } from './admobConfig'
import type { AdPlacement } from './adsService'

let busy = false
let initialized = false
let consentReady = false
let privacyGeneration = 0

async function authorize(config: AdMobConfig): Promise<boolean> {
  if (!canUseOptionalFeature('ads')) return false
  const generation = privacyGeneration
  // Google's demo app IDs have no publisher UMP message. Live ads always use UMP.
  if (config.mode === 'live' && !consentReady) {
    let consent = await AdMob.requestConsentInfo()
    if (!canUseOptionalFeature('ads') || generation !== privacyGeneration) return false
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm()
    }
    consentReady = consent.canRequestAds
    if (!consentReady) return false
  }
  if (!canUseOptionalFeature('ads') || generation !== privacyGeneration) return false
  if (!initialized) {
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen })
    initialized = true
  }
  return canUseOptionalFeature('ads') && generation === privacyGeneration
}

async function present(
  config: AdMobConfig,
  rewarded: boolean,
  placement: string,
  isAllowed: () => boolean
): Promise<boolean> {
  if (busy || !canUseOptionalFeature('ads') || !isAllowed()) return false
  busy = true
  const generation = privacyGeneration
  const listeners: PluginListenerHandle[] = []
  let earned = false
  try {
    if (!(await authorize(config)) || !isAllowed()) return false
    const options = {
      adId: rewarded ? config.rewardedId : config.interstitialId,
      isTesting: config.mode === 'test',
      npa: true,
    }
    if (rewarded) await AdMob.prepareRewardVideoAd(options)
    else await AdMob.prepareInterstitial(options)
    if (!canUseOptionalFeature('ads') || generation !== privacyGeneration || !isAllowed())
      return false

    // showRewardVideoAd resolves when earned, while dismissal can also happen
    // without a reward. Keep the native slot occupied until the ad actually closes.
    let finish!: (shownOrEarned: boolean) => void
    const closed = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    if (rewarded) {
      listeners.push(
        await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          earned = true
        })
      )
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(earned)))
      listeners.push(
        await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false))
      )
      void AdMob.showRewardVideoAd({ adId: options.adId }).then(
        () => {
          earned = true
        },
        () => finish(false)
      )
    } else {
      listeners.push(
        await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish(true))
      )
      listeners.push(
        await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish(false))
      )
      void AdMob.showInterstitial({ adId: options.adId }).catch(() => finish(false))
    }
    const completed = await closed
    return completed && canUseOptionalFeature('ads') && generation === privacyGeneration
  } catch (error) {
    console.warn(`[ads] ${placement} unavailable`, error)
    return false
  } finally {
    await Promise.allSettled(listeners.map((listener) => listener.remove()))
    busy = false
  }
}

/** Install the existing game contract without loading ads or prompting at startup. */
export function installAdMobBridge(isPlacementAllowed?: (placement: AdPlacement) => boolean): void {
  if (!Capacitor.isNativePlatform() || IS_MOBILE_DEV_BUILD || window.GameAds) return
  const config = resolveAdMobConfig(Capacitor.getPlatform(), import.meta.env)
  if (!config) return
  subscribePlayerSafety(() => {
    privacyGeneration += 1
    if (!canUseOptionalFeature('ads')) consentReady = false
  })
  window.GameAds = {
    managesAdLifecycle: true,
    showInterstitial: (placement) =>
      present(
        config,
        false,
        placement,
        () => isPlacementAllowed?.(placement as AdPlacement) ?? true
      ),
    showRewarded: (placement) =>
      present(
        config,
        true,
        placement,
        () => isPlacementAllowed?.(placement as AdPlacement) ?? true
      ),
  }
}

/** A pending ad from an old season must not appear over a newly started run. */
export function invalidateAdMobRequests(): void {
  privacyGeneration += 1
}

export function hasAdMobPrivacyOptions(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    !IS_MOBILE_DEV_BUILD &&
    resolveAdMobConfig(Capacitor.getPlatform(), import.meta.env)?.mode === 'live'
  )
}

/** UMP choices are reachable even after the local advertising switch is turned off. */
export async function openAdMobPrivacyOptions(): Promise<void> {
  if (!canUseAdultServices() || !hasAdMobPrivacyOptions() || busy)
    throw new Error(
      'Advertising privacy options are unavailable right now. Please try again later.'
    )
  busy = true
  try {
    await AdMob.requestConsentInfo()
    await AdMob.showPrivacyOptionsForm()
  } finally {
    consentReady = false
    privacyGeneration += 1
    busy = false
  }
}
