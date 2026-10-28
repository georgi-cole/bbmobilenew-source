/**
 * adsService — centralized ad hook architecture for the game layer.
 *
 * Bridge contract:
 *   Game → native: window.GameAds?.showInterstitial(placement)
 *                  window.GameAds?.showRewarded(placement)
 *   Native → game: window.onAdRewardGranted(placement, payload?)
 *
 * The dedicated mobile-dev build keeps this same contract but simulates a
 * successful rewarded ad when no native ad bridge is installed.
 */

import type { AppDispatch, RootState } from '../../store/store'
import { recordAdShown } from '../../store/adsSlice'
import { hasEffectiveStoreEntitlement } from '../../vip/effectiveEntitlements'
import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'
import { setEnergyBankEntry } from '../../social/socialSlice'
import { canUseOptionalFeature, subscribePlayerSafety } from '../../safety/playerSafety'

export const SOCIAL_ENERGY_RECHARGE_REWARD = 6

export type AdPlacement =
  | 'competition_retry'
  | 'live_vote_auto'
  | 'safety_decision_auto'
  | 'final3_part1_break'
  | 'final3_part2_break'
  | 'final3_part3_break'
  | 'social_energy_recharge'
  | 'public_meter_audience_insight'
  | 'eviction_vote_breakdown'
  | 'vox_nomination_breakdown'
  | 'vox_audience_preview'
  | 'favorite_player_audience_surge'
  | 'glass_bridge_hint'
  | 'big_spender_rescue'
  | 'survival_continue'
  | 'aftermath_unlock'

export const INTERSTITIAL_PLACEMENTS = new Set<AdPlacement>([
  'live_vote_auto',
  'safety_decision_auto',
  'final3_part1_break',
  'final3_part2_break',
  'final3_part3_break',
])

export const DAILY_LIMITED_PLACEMENTS = new Set<AdPlacement>([
  'social_energy_recharge',
  'public_meter_audience_insight',
])

declare global {
  interface Window {
    GameAds?: {
      managesAdLifecycle?: boolean
      showInterstitial(placement: string): void | Promise<boolean>
      showRewarded(placement: string): void | Promise<boolean>
    }
    onAdRewardGranted?: (placement: string, payload?: Record<string, unknown>) => void
  }
}

type RewardHandler = (payload?: Record<string, unknown>) => void
const rewardHandlers = new Map<AdPlacement, RewardHandler>()
const dismissalHandlers = new Map<AdPlacement, () => void>()
subscribePlayerSafety(() => {
  if (!canUseOptionalFeature('ads')) clearPendingAdRewards()
})

export function clearRewardHandler(placement: AdPlacement): void {
  rewardHandlers.delete(placement)
  const dismissed = dismissalHandlers.get(placement)
  dismissalHandlers.delete(placement)
  dismissed?.()
}

export function clearPendingAdRewards(): void {
  for (const placement of [...rewardHandlers.keys()]) clearRewardHandler(placement)
}

export function initAdBridge(): void {
  window.onAdRewardGranted = (placement: string, payload?: Record<string, unknown>) => {
    if (!canUseOptionalFeature('ads')) {
      clearPendingAdRewards()
      return
    }
    if (import.meta.env.DEV) {
      console.log(`[ads] reward granted: ${placement}`, payload ?? {})
    }
    const handler = rewardHandlers.get(placement as AdPlacement)
    if (handler) {
      rewardHandlers.delete(placement as AdPlacement)
      dismissalHandlers.delete(placement as AdPlacement)
      handler(payload)
    } else if (import.meta.env.DEV) {
      console.log(
        `[ads] reward granted: ${placement} — no handler registered (ad may have been dismissed)`
      )
    }
  }
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isAdDailyLimitReached(placement: AdPlacement, state: RootState): boolean {
  if (!DAILY_LIMITED_PLACEMENTS.has(placement)) return false
  const lastUsed = state.ads?.dailyUsage[placement]
  return lastUsed === todayDateString()
}

export function canShowAd(
  placement: AdPlacement,
  state: RootState,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canUseOptionalFeature('ads')) return false
  const hasNoAdsPack =
    (state.ads?.hasNoAdsPack ?? false) || hasEffectiveStoreEntitlement(state.vip, 'noAds')

  if (INTERSTITIAL_PLACEMENTS.has(placement) && hasNoAdsPack) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: No Ads Pack owned`)
    }
    return false
  }

  if (placement === 'competition_retry' && options?.isFinal3Week) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: final-3 week`)
    }
    return false
  }

  if (isAdDailyLimitReached(placement, state)) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} blocked: daily limit reached`)
    }
    return false
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] ${placement} eligible`)
  }
  return true
}

export function showInterstitial(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  options?: { isFinal3Week?: boolean }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (!window.GameAds?.showInterstitial) {
    if (IS_MOBILE_DEV_BUILD) {
      dispatch(recordAdShown(placement))
      return true
    }
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} interstitial skipped: native bridge absent`)
    }
    return false
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] requesting interstitial: ${placement}`)
  }
  try {
    const result = window.GameAds.showInterstitial(placement)
    if (result) {
      void result
        .then((shown) => {
          if (shown) dispatch(recordAdShown(placement))
        })
        .catch((error: unknown) => console.warn(`[ads] ${placement} failed`, error))
      return true
    }
  } catch (error) {
    console.warn(`[ads] ${placement} interstitial bridge failed; request was not recorded`, error)
    return false
  }
  dispatch(recordAdShown(placement))
  return true
}

export function showRewarded(
  placement: AdPlacement,
  state: RootState,
  dispatch: AppDispatch,
  onReward: (payload?: Record<string, unknown>) => void,
  options?: { isFinal3Week?: boolean; onDismissed?: () => void }
): boolean {
  if (!canShowAd(placement, state, options)) return false
  if (rewardHandlers.has(placement)) {
    if (import.meta.env.DEV) {
      console.log(`[ads] ${placement} rewarded skipped: request already pending`)
    }
    return false
  }

  const socialRechargePlayerId =
    placement === 'social_energy_recharge'
      ? state.game.players.find((player) => player.isUser)?.id
      : undefined
  const rewardHandler: RewardHandler = (payload) => {
    dispatch(recordAdShown(placement))
    onReward(payload)
    if (placement === 'social_energy_recharge' && socialRechargePlayerId) {
      dispatch(
        setEnergyBankEntry({
          playerId: socialRechargePlayerId,
          value: SOCIAL_ENERGY_RECHARGE_REWARD,
        })
      )
    }
  }

  if (!window.GameAds?.showRewarded) {
    if (!IS_MOBILE_DEV_BUILD) {
      if (import.meta.env.DEV) {
        console.log(`[ads] ${placement} rewarded skipped: native bridge absent`)
      }
      return false
    }

    rewardHandlers.set(placement, rewardHandler)
    if (options?.onDismissed) dismissalHandlers.set(placement, options.onDismissed)
    window.setTimeout(() => {
      if (rewardHandlers.get(placement) === rewardHandler) {
        window.onAdRewardGranted?.(placement, { source: 'mobile-dev-simulator' })
      }
    }, 0)
    return true
  }

  if (import.meta.env.DEV) {
    console.log(`[ads] requesting rewarded: ${placement}`)
  }
  rewardHandlers.set(placement, rewardHandler)
  if (options?.onDismissed) dismissalHandlers.set(placement, options.onDismissed)
  try {
    const result = window.GameAds.showRewarded(placement)
    if (result) {
      const dismiss = () => {
        if (rewardHandlers.get(placement) !== rewardHandler) return
        clearRewardHandler(placement)
      }
      void result
        .then((earned) => {
          // A cleared handler belongs to an old screen/run or privacy decision.
          if (rewardHandlers.get(placement) !== rewardHandler) return
          if (earned && canUseOptionalFeature('ads')) {
            window.onAdRewardGranted?.(placement, { source: 'admob' })
          } else dismiss()
        })
        .catch((error: unknown) => {
          console.warn(`[ads] ${placement} failed`, error)
          dismiss()
        })
    }
  } catch (error) {
    clearRewardHandler(placement)
    console.warn(`[ads] ${placement} rewarded bridge failed; request was not recorded`, error)
    return false
  }
  return true
}
