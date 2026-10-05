export const EYEOLEAN_STORE_PRODUCT_KEYS = [
  'extra_vote',
  'remove_vote',
  'immunity',
  'protection',
] as const

export type EyeoleanStoreProductKey = (typeof EYEOLEAN_STORE_PRODUCT_KEYS)[number]

/**
 * A voting power must declare what it means in every supported full-season
 * ruleset. This is deliberately catalog data instead of UI copy: lifecycle
 * code uses it to decide whether a power may be armed or resolved.
 */
export type EyeoleanPowerSeasonMode = 'classic' | 'vox'
export type EyeoleanVotingMoment = 'eviction' | 'nomination'

export type EyeoleanPowerModeRule =
  | {
      available: true
      votingMoment: EyeoleanVotingMoment
      title: string
      detail: string
      armMessage: string
    }
  | {
      available: false
      unavailableReason: string
    }

export interface EyeoleanStoreProductDefinition {
  key: EyeoleanStoreProductKey
  title: string
  /** Price of the first purchase of this power in a season. */
  price: number
  /** Price of the second purchase of this power in the same season. */
  secondPrice: number
  /** Purchases and actual resolved uses are both season-capped. */
  maxSeasonPurchases: number
  maxSeasonUses: number
  shortDescription: string
  inventoryLabel: string
  /** Complete per-ruleset contract. New vote powers cannot omit a mode. */
  modeRules: Readonly<Record<EyeoleanPowerSeasonMode, EyeoleanPowerModeRule>>
}

/**
 * Experimental soft-currency catalog.
 *
 * Prices live here rather than in the UI so the wallet reducer never trusts
 * a client-supplied amount. These values are intentionally easy to rebalance.
 */
export const EYEOLEAN_STORE_PRODUCTS: Readonly<
  Record<EyeoleanStoreProductKey, EyeoleanStoreProductDefinition>
> = {
  extra_vote: {
    key: 'extra_vote',
    title: 'Extra Vote',
    price: 25_000,
    secondPrice: 40_000,
    maxSeasonPurchases: 2,
    maxSeasonUses: 2,
    secondPrice: 25_000,
    maxSeasonPurchases: 2,
    maxSeasonUses: 2,
    shortDescription: 'Adds one ballot to your next eligible vote.',
    inventoryLabel: 'Extra Votes',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'eviction',
        title: 'Extra Vote',
        detail: 'One extra ballot at an eligible elimination vote.',
        armMessage: 'Extra Vote armed for your next eligible elimination vote.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Extra Vote',
        detail: 'Cast a third secret nomination at your next eligible nomination.',
        armMessage: 'Extra Vote armed for your next eligible Vox nomination.',
      },
    },
  },
  remove_vote: {
    key: 'remove_vote',
    title: 'Remove a Vote',
    price: 15_000,
    shortDescription: 'Removes one vote against you from the next eligible result.',
    inventoryLabel: 'Vote Removals',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'eviction',
        title: 'Remove a Vote',
        detail: 'Cancel one vote against you at an eligible elimination vote.',
        armMessage:
          'Remove a Vote armed for the next eligible elimination vote where you are nominated.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Remove a Vote',
        detail: 'Cancel one secret nomination against you at an eligible nomination.',
        armMessage:
          'Remove a Vote armed for the next eligible Vox nomination where you are nominated.',
      },
    },
  },
  immunity: {
    key: 'immunity',
    title: 'Immunity',
    price: 150_000,
    secondPrice: 300_000,
    maxSeasonPurchases: 2,
    maxSeasonUses: 2,
    shortDescription:
      'Protects you from nominations for the full day. Public Mode auto-nominations still apply.',
    inventoryLabel: 'Immunity',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'nomination',
        title: 'Immunity',
        detail:
          'Once triggered, other players cannot nominate you again that day, including as a backup nominee.',
        armMessage: 'Immunity armed for the next eligible nomination day.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Immunity',
        detail:
          'Once triggered, other players cannot nominate you again that day, including as a backup nominee.',
        armMessage: 'Immunity armed for the next eligible nomination day.',
      },
    },
  },
  protection: {
    key: 'protection',
    title: 'Protection',
    price: 60_000,
    secondPrice: 90_000,
    maxSeasonPurchases: 2,
    maxSeasonUses: 2,
    shortDescription:
      'Protects one other player from nomination. Public Mode auto-nominations still apply.',
    inventoryLabel: 'Protection',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'nomination',
        title: 'Protection',
        detail:
          'Choose another player; once triggered, they cannot be nominated again that day, including as a backup nominee.',
        armMessage:
          'Protection armed for your selected player for the next eligible nomination day.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Protection',
        detail:
          'Choose another player; once triggered, they cannot be nominated again that day, including as a backup nominee.',
        armMessage:
          'Protection armed for your selected player for the next eligible nomination day.',
      },
    },
  },
}

export function getEyeoleanStoreProduct(
  key: EyeoleanStoreProductKey
): EyeoleanStoreProductDefinition {
  return EYEOLEAN_STORE_PRODUCTS[key]
}

/**
 * Return the canonical price for the next purchase of a power in the current
 * season. null means the season purchase stock has been exhausted.
 */
export function getEyeoleanStorePurchasePrice(
  key: EyeoleanStoreProductKey,
  purchasesThisSeason: number
): number | null {
  const product = getEyeoleanStoreProduct(key)
  const purchases = Math.max(0, Math.floor(purchasesThisSeason))
  if (purchases >= product.maxSeasonPurchases) return null
  return purchases === 0 ? product.price : product.secondPrice
}

export function getEyeoleanPowerModeRule(
  key: EyeoleanStoreProductKey,
  mode: EyeoleanPowerSeasonMode
): EyeoleanPowerModeRule {
  return getEyeoleanStoreProduct(key).modeRules[mode]
}
