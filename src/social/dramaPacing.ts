import { DRAMA_MODE_CONFIG } from './dramaModeConfig'
import type { DramaSocialNetwork } from './types'

const PUBLIC_DRAMA_ACTIONS = new Set(['go_public', 'public_callout', 'expose_secret', 'startFight'])

export interface DramaPacingAvailability {
  available: boolean
  reason: string
}

export function isPublicDramaAction(actionId: string): boolean {
  return PUBLIC_DRAMA_ACTIONS.has(actionId)
}

/**
 * One pacing gate shared by UI eligibility, AI execution and the Drama reducer.
 * Manual actions therefore cannot bypass the same public-event cap and cooldown
 * used by autonomous story progression.
 */
export function getPublicDramaActionAvailability(
  network: DramaSocialNetwork | undefined,
  week?: number
): DramaPacingAvailability {
  if (!network) return { available: false, reason: 'The Hub story is not available' }
  if (network.pacing.publicEventsThisWeek >= DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek) {
    return {
      available: false,
      reason: 'The Hub has already reached its public drama limit this week',
    }
  }
  if (
    week !== undefined &&
    week - network.pacing.lastPublicEventWeek < DRAMA_MODE_CONFIG.pacing.publicEventCooldownWeeks
  ) {
    return {
      available: false,
      reason: 'The Hub is still reacting to the last major public event',
    }
  }
  return { available: true, reason: '' }
}
