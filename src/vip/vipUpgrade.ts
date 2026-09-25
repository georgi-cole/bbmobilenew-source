import { VIP_PRODUCT_ID, type StoreEntitlementKey } from './vipConfig'
import type { StoreEntitlements } from './vipStorage'

export const VIP_BASE_PRICE_CENTS = 1_499
export const VIP_MIN_UPGRADE_PRICE_CENTS = 499
export const VIP_UPGRADE_CREDIT_RATE = 0.75

/**
 * Canonical launch pricing used only to determine VIP upgrade credit.
 * The checkout still displays and charges the localized price returned by
 * Apple App Store or Google Play for the resolved billing product.
 */
export const VIP_STANDALONE_NOMINAL_PRICE_CENTS: Readonly<
  Partial<Record<StoreEntitlementKey, number>>
> = {
  premiumChallenges: 199,
  publicMode: 299,
  noAds: 299,
  survivalMode: 399,
  cupidArrow: 399,
  voxPopuli: 399,
  dramaMode: 499,
}

export interface VipUpgradeTier {
  priceCents: number
  productId: string
}

export interface VipUpgradeOffer {
  eligibleSpendCents: number
  creditCents: number
  targetPriceCents: number
  tier: VipUpgradeTier
}

function envProductId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/**
 * Native stores cannot accept an arbitrary runtime price for a non-consumable.
 * We therefore resolve the 75% credit calculation onto a small set of
 * preconfigured one-time VIP-upgrade products. The base VIP SKU is used when
 * the player owns no qualifying standalone products.
 */
export const VIP_UPGRADE_TIERS: readonly VipUpgradeTier[] = [
  {
    priceCents: 1_349,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_1349_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade1349'
    ),
  },
  {
    priceCents: 1_299,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_1299_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade1299'
    ),
  },
  {
    priceCents: 1_199,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_1199_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade1199'
    ),
  },
  {
    priceCents: 1_099,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_1099_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade1099'
    ),
  },
  {
    priceCents: 999,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_999_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade999'
    ),
  },
  {
    priceCents: 899,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_899_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade899'
    ),
  },
  {
    priceCents: 799,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_799_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade799'
    ),
  },
  {
    priceCents: 699,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_699_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade699'
    ),
  },
  {
    priceCents: 599,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_599_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade599'
    ),
  },
  {
    priceCents: 499,
    productId: envProductId(
      import.meta.env.VITE_VIP_UPGRADE_499_PRODUCT_ID,
      'com.georgicole.thebigeye.vip.upgrade499'
    ),
  },
] as const

export function getVipEligibleStandaloneSpendCents(
  entitlements: Partial<StoreEntitlements>
): number {
  return Object.entries(VIP_STANDALONE_NOMINAL_PRICE_CENTS).reduce(
    (total, [key, priceCents]) =>
      entitlements[key as StoreEntitlementKey] === true && typeof priceCents === 'number'
        ? total + priceCents
        : total,
    0
  )
}

export function getVipUpgradeCreditCents(eligibleSpendCents: number): number {
  return Math.max(0, Math.round(eligibleSpendCents * VIP_UPGRADE_CREDIT_RATE))
}

export function getVipUpgradeTargetPriceCents(eligibleSpendCents: number): number {
  return Math.max(
    VIP_MIN_UPGRADE_PRICE_CENTS,
    VIP_BASE_PRICE_CENTS - getVipUpgradeCreditCents(eligibleSpendCents)
  )
}

function nearestUpgradeTier(targetPriceCents: number): VipUpgradeTier {
  return VIP_UPGRADE_TIERS.reduce((best, tier) => {
    const bestDistance = Math.abs(best.priceCents - targetPriceCents)
    const tierDistance = Math.abs(tier.priceCents - targetPriceCents)
    if (tierDistance < bestDistance) return tier
    if (tierDistance === bestDistance && tier.priceCents > best.priceCents) return tier
    return best
  })
}

export function resolveVipUpgradeOffer(
  entitlements: Partial<StoreEntitlements>
): VipUpgradeOffer | null {
  const eligibleSpendCents = getVipEligibleStandaloneSpendCents(entitlements)
  if (eligibleSpendCents <= 0) return null

  const creditCents = getVipUpgradeCreditCents(eligibleSpendCents)
  const targetPriceCents = getVipUpgradeTargetPriceCents(eligibleSpendCents)
  return {
    eligibleSpendCents,
    creditCents,
    targetPriceCents,
    tier: nearestUpgradeTier(targetPriceCents),
  }
}

export function getVipBillingProductId(entitlements: Partial<StoreEntitlements>): string {
  return resolveVipUpgradeOffer(entitlements)?.tier.productId ?? VIP_PRODUCT_ID
}

export function isVipBillingProductId(productId: string): boolean {
  return (
    productId === VIP_PRODUCT_ID ||
    VIP_UPGRADE_TIERS.some((tier) => tier.productId === productId)
  )
}
