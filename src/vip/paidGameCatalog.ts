import { getAllGames, getGame } from '../minigames/registryBase'

/** Paid minigame versions, derived from the same registry used by game launch. */
export const PREMIUM_GAME_VARIANTS = getAllGames().filter(
  (game) => !game.retired && game.premiumExperience
)

export const PREMIUM_CHALLENGE_REMASTERS = getAllGames().flatMap((game) => {
  if (game.retired || !game.premiumReplacementKey) return []
  const replacement = getGame(game.premiumReplacementKey)
  return replacement && !replacement.retired ? [replacement] : []
})

export const PREMIUM_GAME_UPGRADES = [...PREMIUM_GAME_VARIANTS, ...PREMIUM_CHALLENGE_REMASTERS]
export const PREMIUM_GAME_LABEL = `${PREMIUM_GAME_UPGRADES.length} premium minigame versions`
