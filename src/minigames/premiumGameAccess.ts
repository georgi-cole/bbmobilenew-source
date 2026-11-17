import { getGame, type GameRegistryEntry } from './registry'

export type PremiumGameUpgrade = 'presentation' | 'variant' | 'replacement'

/** Use the current catalogue when an older competition snapshot predates an upgrade. */
export function getPremiumGameUpgrade(game: GameRegistryEntry): PremiumGameUpgrade | null {
  const entry = getGame(game.key) ?? game
  if (entry.retired) return null
  const replacement = entry.premiumReplacementKey && getGame(entry.premiumReplacementKey)
  return replacement && !replacement.retired ? 'replacement' : (entry.premiumExperience ?? null)
}

/** Resolves a canonical competition entry without changing its saved game key. */
export function resolvePremiumGameForAccess(
  game: GameRegistryEntry,
  hasPremiumChallengesAccess: boolean
): GameRegistryEntry {
  if (!hasPremiumChallengesAccess) return game
  const entry = getGame(game.key) ?? game
  const replacement = entry.premiumReplacementKey && getGame(entry.premiumReplacementKey)
  return !entry.retired && replacement && !replacement.retired ? replacement : game
}
