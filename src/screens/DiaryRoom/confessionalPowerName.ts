import type { GameState } from '../../types'

/**
 * The ceremony UI uses one name for the currently active safety power.
 * Keeping it separate from either visual shell prevents presentation drift.
 */
export function getConfessionalPowerName(game: GameState): string {
  const activeSpecialVeto = game.specialVeto?.activeType ?? null
  if (activeSpecialVeto === 'vip') return 'Double Trouble'
  if (activeSpecialVeto === 'diamond') return 'Halo Exchange'
  if (activeSpecialVeto === 'coup') return 'Detox'
  if (activeSpecialVeto === 'spotlight') return 'Force Majeure'
  return 'Power of Safety'
}
