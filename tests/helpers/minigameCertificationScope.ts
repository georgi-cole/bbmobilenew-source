import type { GameRegistryEntry } from '../../src/minigames/registry'

const ACTIVE_OUTSIDE_RANDOM_POOL = new Set(['finalThreeCircuit', 'downMemoryLane'])

/**
 * Defines the release-test catalog. Retired and legacy games are out of scope;
 * zero-weight entries are inactive unless they have an explicit VIP or finale
 * entry point.
 */
export function isInMinigameCertificationScope(game: GameRegistryEntry): boolean {
  if (game.retired || game.legacy) return false
  return game.weight > 0 || game.vipOnly === true || ACTIVE_OUTSIDE_RANDOM_POOL.has(game.key)
}
