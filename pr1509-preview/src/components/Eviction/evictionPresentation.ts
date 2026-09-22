import { BELLA_ID } from '../../features/twists/bellasWill'

export type EvictionPresentationVariant = 'standard' | 'bella_last_will'

/**
 * Presentation-only resolver for exit cinematics.
 *
 * Gameplay state must never branch on this value. It exists solely so special
 * housemates can receive authored exit choreography without duplicating
 * elimination rules across GameScreen, Final 3, shocks, or multi-exit flows.
 */
export function getEvictionPresentationVariant(
  playerId: string,
  overlayVariant: 'eviction' | 'return' = 'eviction'
): EvictionPresentationVariant {
  if (overlayVariant === 'eviction' && playerId === BELLA_ID) return 'bella_last_will'
  return 'standard'
}
