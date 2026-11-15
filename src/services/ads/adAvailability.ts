import { IS_MOBILE_DEV_BUILD } from '../../config/buildTarget'
import {
  canUseOptionalFeature,
  getPlayerSafety,
  subscribePlayerSafety,
} from '../../safety/playerSafety'

let requestFailure: string | null = null
const listeners = new Set<() => void>()

export function setAdRequestFailure(message: string | null): void {
  if (requestFailure === message) return
  requestFailure = message
  listeners.forEach((listener) => listener())
}

export function subscribeAdAvailability(listener: () => void): () => void {
  listeners.add(listener)
  const stopSafety = subscribePlayerSafety(listener)
  return () => {
    listeners.delete(listener)
    stopSafety()
  }
}

/** A failed request remains retryable; this explains it without granting a reward. */
export function getAdAvailabilityMessage(): string | null {
  const safety = getPlayerSafety()
  if (!safety) return 'Enter your age in Settings → Advertising privacy to set up ad rewards.'
  if (safety.ageBand !== 'adult') return 'Ad rewards are unavailable for players under 18.'
  if (!canUseOptionalFeature('ads'))
    return 'Optional advertising is off. Enable it in Settings → Advertising privacy to use ad rewards.'
  if (!IS_MOBILE_DEV_BUILD && !window.GameAds)
    return 'Ads are not available in this build. Update the app and try again.'
  return requestFailure
}
