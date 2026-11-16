import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from '@capacitor-community/admob'
import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'
import { canUseAdultServices, subscribePlayerSafety } from '../../safety/playerSafety'
import { resolveAdMobConfig, type AdMobConfig } from './admobConfig'
import type { AdPlacement } from './adsService'
import { getAdAvailabilityMessage, setAdRequestFailure } from './adAvailability'

let busy = false
let initialized = false
let consentReady = false
let privacyGeneration = 0

async function authorize(config: AdMobConfig): Promise<boolean> {
  if (!canUseAdultServices()) return false
  const generation = privacyGeneration
  // Google's demo app IDs have no publisher UMP message. Live ads always use UMP.
  if (config.mode === 'live' && !consentReady) {
    let consent = await AdMob.requestConsentInfo()
    if (!canUseAdultServices() || generation !== privacyGeneration) return false
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm()
    }
    consentReady = consent.canRequestAds
    if (!consentReady) {
      setAdRequestFailure(
        'Advertising permission is not ready. Open Advertising privacy choices and try again.'
      )
      return false
    }
  }
  if (!canUseAdultServices() || generation !== privacyGeneration) return false
  if (!initialized) {
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.Teen })
    initialized = true
  }
  return canUseAdultServices() && generation === privacyGeneration
}

async function present(
  config: AdMobConfig,
  rewarded: boolean,
  placement: string,
  isAllowed: () => boolean
): Promise<boolean> {
  if (busy || !canUseAdultServices() || !isAllowed()) return false
  busy = true
  const generation = privacyGeneration
  const listeners: PluginListenerHandle[] = []
  let earned = false
  let stage = 'privacy'
  try {
    setAdRequestFailure(null)
    if (!(await authorize(config)) || !isAllowed()) return false
    stage = 'loading'
    const options = {
      adId: rewarded ? config.rewardedId : config.interstitialId,
      // Test mode already selects Google's platform-specific demo unit IDs.
      // The plugin's isTesting override substitutes an Android interstitial ID
      // on iOS in 8.2.1, so always preserve the explicit ID selected above.
      isTesting: false,
      npa: true,
    }
    if (rewarded) await AdMob.prepareRewardVideoAd(options)
    else await AdMob.prepareInterstitial(options)
    if (!canUseAdultServices() || generation !== privacyGeneration || !isAllowed()) return false

    // showRewardVideoAd resolves when earned, while dismissal can also happen
    // without a reward. Keep the native slot occupied until the ad actually closes.
    let finish!: (shownOrEarned: boolean) => void
    const closed = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    stage = 'presentation'
    const failedToShow = () => {
      setAdRequestFailure('The ad could not open. Please try again.')
      finish(false)
    }
    if (rewarded) {
      listeners.push(
        await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
          earned = true
        })
      )
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(earned)))
      listeners.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, failedToShow))
      void AdMob.showRewardVideoAd({ adId: options.adId }).then(() => {
        earned = true
      }, failedToShow)
    } else {
      listeners.push(
        await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish(true))
      )
      listeners.push(await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, failedToShow))
      void AdMob.showInterstitial({ adId: options.adId }).catch(failedToShow)
    }
    const completed = await closed
    return completed && canUseAdultServices() && generation === privacyGeneration
  } catch (error) {
    setAdRequestFailure(
      stage === 'privacy'
        ? 'Advertising privacy choices could not load. Check your connection and try again.'
        : 'No ad is available right now. Check your connection and try again.'
    )
    console.warn(`[ads] ${placement} ${stage} unavailable`, error)
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
    setAdRequestFailure(null)
    if (!canUseAdultServices()) consentReady = false
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

/** The adult explicitly checks setup before returning to a reward prompt. */
export async function checkAdMobAvailability(): Promise<string | null> {
  if (!canUseAdultServices() || !window.GameAds) return getAdAvailabilityMessage()
  if (busy) return 'An ad request is already in progress. Please try again when it finishes.'
  const config = resolveAdMobConfig(Capacitor.getPlatform(), import.meta.env)
  if (!config) return getAdAvailabilityMessage()
  busy = true
  try {
    setAdRequestFailure(null)
    await authorize(config)
    return getAdAvailabilityMessage()
  } catch (error) {
    console.warn('[ads] advertising setup unavailable', error)
    setAdRequestFailure(
      'Advertising privacy choices could not load. Check your connection and try again.'
    )
    return getAdAvailabilityMessage()
  } finally {
    busy = false
  }
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
