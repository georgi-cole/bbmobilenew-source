import { describe, expect, it } from 'vitest'
import { STORE_PRODUCT_CATALOG } from './vipConfig'
import { PREMIUM_GAME_UPGRADES } from './paidGameCatalog'

describe('marketplace catalog', () => {
  it('lists every premium minigame version in Premium Challenges', () => {
    const product = STORE_PRODUCT_CATALOG.find((entry) => entry.key === 'premiumChallenges')!
    expect(product.badge).toContain(String(PREMIUM_GAME_UPGRADES.length))
    expect(product.benefits).toEqual([
      ...PREMIUM_GAME_UPGRADES.map((game) => game.title),
      'Automatic replacement in every competition',
      'Original editions remain available without access',
    ])
  })

  it('keeps unique billing IDs and complete released product presentations', () => {
    expect(new Set(STORE_PRODUCT_CATALOG.map((product) => product.key)).size).toBe(
      STORE_PRODUCT_CATALOG.length
    )
    expect(new Set(STORE_PRODUCT_CATALOG.map((product) => product.productId)).size).toBe(
      STORE_PRODUCT_CATALOG.length
    )
    for (const product of STORE_PRODUCT_CATALOG.filter((entry) => entry.availableInRelease)) {
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
