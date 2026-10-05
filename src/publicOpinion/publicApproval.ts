import type { PlayerPublicProfile } from './types'

/**
 * Return the audience rating currently shown to the player, including active
 * story buzz. Temporary boosts never alter the saved season approval ledger.
 */
export function getEffectivePublicApproval(
  profile: PlayerPublicProfile | undefined,
  currentWeek: number
): number {
  if (!profile) return 50
  const temporaryDelta = (profile.temporaryApprovalBoosts ?? [])
    .filter((boost) => currentWeek < boost.expiresWeek)
    .reduce((sum, boost) => sum + boost.delta, 0)
  return Math.max(0, Math.min(100, profile.approval + temporaryDelta))
}
