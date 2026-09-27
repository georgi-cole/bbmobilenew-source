import { describe, expect, it } from 'vitest'
import { createEmptyStoreEntitlements } from './vipStorage'
import {
  VIP_BASE_PRICE_CENTS,
  VIP_MIN_UPGRADE_PRICE_CENTS,
  getVipBillingProductId,
  getVipEligibleStandaloneSpendCents,
  getVipUpgradeTargetPriceCents,
  isVipBillingProductId,
  resolveVipUpgradeOffer,
} from './vipUpgrade'
import { VIP_PRODUCT_ID } from './vipConfig'

describe('VIP upgrade credit', () => {
  it('uses the regular VIP SKU when there is no qualifying standalone ownership', () => {
    const entitlements = createEmptyStoreEntitlements()

    expect(getVipEligibleStandaloneSpendCents(entitlements)).toBe(0)
    expect(resolveVipUpgradeOffer(entitlements)).toBeNull()
    expect(getVipBillingProductId(entitlements)).toBe(VIP_PRODUCT_ID)
  })

  it('credits 75% of standalone value and resolves to the nearest supported tier', () => {
    const entitlements = createEmptyStoreEntitlements()
    entitlements.survivalMode = true

    const offer = resolveVipUpgradeOffer(entitlements)

    expect(offer).not.toBeNull()
    expect(offer?.eligibleSpendCents).toBe(399)
    expect(offer?.creditCents).toBe(299)
    expect(offer?.targetPriceCents).toBe(1_200)
    expect(offer?.tier.priceCents).toBe(1_199)
    expect(isVipBillingProductId(offer!.tier.productId)).toBe(true)
  })

  it('stacks credit across multiple owned standalone products', () => {
    const entitlements = createEmptyStoreEntitlements()
    entitlements.dramaMode = true
    entitlements.survivalMode = true

    const offer = resolveVipUpgradeOffer(entitlements)

    expect(offer?.eligibleSpendCents).toBe(898)
    expect(offer?.creditCents).toBe(674)
    expect(offer?.targetPriceCents).toBe(825)
    expect(offer?.tier.priceCents).toBe(799)
  })

  it('includes No Ads in qualifying standalone spend', () => {
    const entitlements = createEmptyStoreEntitlements()
    entitlements.noAds = true

    expect(getVipEligibleStandaloneSpendCents(entitlements)).toBe(299)
    expect(resolveVipUpgradeOffer(entitlements)?.tier.priceCents).toBe(1_299)
  })

  it('does not credit unreleased Tribunal ownership', () => {
    const entitlements = createEmptyStoreEntitlements()
    entitlements.tribunalHouse = true

    expect(getVipEligibleStandaloneSpendCents(entitlements)).toBe(0)
    expect(resolveVipUpgradeOffer(entitlements)).toBeNull()
  })

  it('never prices a VIP upgrade below the configured floor', () => {
    const entitlements = createEmptyStoreEntitlements()
    entitlements.premiumChallenges = true
    entitlements.publicMode = true
    entitlements.noAds = true
    entitlements.survivalMode = true
    entitlements.cupidArrow = true
    entitlements.voxPopuli = true
    entitlements.dramaMode = true

    const offer = resolveVipUpgradeOffer(entitlements)

    expect(getVipUpgradeTargetPriceCents(offer!.eligibleSpendCents)).toBe(
      VIP_MIN_UPGRADE_PRICE_CENTS
    )
    expect(offer?.tier.priceCents).toBe(VIP_MIN_UPGRADE_PRICE_CENTS)
    expect(offer?.tier.priceCents).toBeLessThan(VIP_BASE_PRICE_CENTS)
  })
})
