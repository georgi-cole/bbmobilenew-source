import type { GameRegistryEntry } from '../../../src/minigames/registry'

export function minigameCertificationName(game: GameRegistryEntry): string {
  return game.vipOnly ? `${game.title} (VIP edition)` : game.title
}
