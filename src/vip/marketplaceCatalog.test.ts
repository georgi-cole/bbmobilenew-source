import { describe, expect, it } from 'vitest'
import { getAllGames, getGame } from '../minigames/registryBase'
import {
  EXPANSION_PRODUCT_KEYS,
  GAME_MODE_PRODUCT_KEYS,
  getStoreProductDefinition,
  STANDALONE_PRODUCT_KEYS,
  STORE_PRODUCT_CATALOG,
  UTILITY_PRODUCT_KEYS,
  VIP_BENEFIT_DETAILS,
} from './vipConfig'
import { PREMIUM_GAME_LABEL, PREMIUM_GAME_UPGRADES } from './paidGameCatalog'

describe('marketplace catalog contracts', () => {
  it('lists every active premium variant and valid replacement exactly once', () => {
    const expectedKeys = getAllGames().flatMap((game) =>
      game.retired
        ? []
        : game.premiumReplacementKey
          ? [game.premiumReplacementKey]
          : game.premiumExperience
            ? [game.key]
            : []
    )
    expect(PREMIUM_GAME_UPGRADES.map((game) => game.key).sort()).toEqual(expectedKeys.sort())
    expect(new Set(expectedKeys).size).toBe(expectedKeys.length)
    for (const game of getAllGames().filter((game) => game.premiumReplacementKey)) {
      const replacement = getGame(game.premiumReplacementKey!)
      expect(replacement, game.key).toBeDefined()
      expect(replacement?.vipOnly, game.key).toBe(true)
      expect(replacement?.retired, game.key).toBe(false)
    }
  })

  it('includes the Deck and Quick Tap upgrades alongside the remasters', () => {
    expect(PREMIUM_GAME_UPGRADES.map((game) => game.key)).toEqual(
      expect.arrayContaining([
        'cardClash',
        'houseOfDarkness',
        'quickTap',
        'quickTapSeasons',
        'castleRescueRemastered',
        'castleRescue2Remastered',
      ])
    )
    const pack = getStoreProductDefinition('premiumChallenges')
    expect(pack.badge).toBe(PREMIUM_GAME_LABEL)
    expect(pack.shortTagline).toContain(PREMIUM_GAME_LABEL)
    for (const game of PREMIUM_GAME_UPGRADES) expect(pack.benefits).toContain(game.title)
  })

  it('shows every released standalone exactly once on a shelf and in VIP', () => {
    const shelves = [...GAME_MODE_PRODUCT_KEYS, ...EXPANSION_PRODUCT_KEYS, ...UTILITY_PRODUCT_KEYS]
    expect([...shelves].sort()).toEqual([...STANDALONE_PRODUCT_KEYS].sort())
    expect(new Set(shelves).size).toBe(shelves.length)
    for (const key of STANDALONE_PRODUCT_KEYS) {
      const product = getStoreProductDefinition(key)
      expect(VIP_BENEFIT_DETAILS).toContainEqual({
        title: product.vipBenefitLabel ?? product.title,
        detail: product.shortTagline,
      })
    }
    expect(shelves).not.toContain('tribunalHouse')
    expect(getStoreProductDefinition('vip').benefits).not.toContain('Tribunal Mode')
  })

  it('has unique billing IDs and complete released product presentations', () => {
    expect(new Set(STORE_PRODUCT_CATALOG.map((product) => product.key)).size).toBe(
      STORE_PRODUCT_CATALOG.length
    )
    expect(new Set(STORE_PRODUCT_CATALOG.map((product) => product.productId)).size).toBe(
      STORE_PRODUCT_CATALOG.length
    )
    for (const product of STORE_PRODUCT_CATALOG.filter((product) => product.availableInRelease)) {
      for (const field of [
        'title',
        'description',
        'shortTagline',
        'fullDescription',
        'badge',
        'accessInstructions',
      ] as const) {
        expect(product[field].trim(), `${product.key}.${field}`).not.toBe('')
      }
      expect(product.benefits.length, product.key).toBeGreaterThan(0)
    }
  })
})
