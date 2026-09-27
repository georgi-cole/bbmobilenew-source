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
  price: number
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
    price: 10_000,
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
    price: 100_000,
    shortDescription:
      'Protects you from nomination once. Public Mode auto-nominations still apply.',
    inventoryLabel: 'Immunity',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'nomination',
        title: 'Immunity',
        detail: 'Other players cannot nominate you at the next eligible nomination ceremony.',
        armMessage: 'Immunity armed for your next eligible nomination ceremony.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Immunity',
        detail: 'Other players cannot nominate you at the next eligible nomination ceremony.',
        armMessage: 'Immunity armed for your next eligible nomination ceremony.',
      },
    },
  },
  protection: {
    key: 'protection',
    title: 'Protection',
    price: 50_000,
    shortDescription:
      'Protects one other player from nomination. Public Mode auto-nominations still apply.',
    inventoryLabel: 'Protection',
    modeRules: {
      classic: {
        available: true,
        votingMoment: 'nomination',
        title: 'Protection',
        detail: 'Choose another player; they cannot be nominated at the next eligible ceremony.',
        armMessage: 'Protection armed for your selected player at the next eligible ceremony.',
      },
      vox: {
        available: true,
        votingMoment: 'nomination',
        title: 'Protection',
        detail: 'Choose another player; they cannot be nominated at the next eligible ceremony.',
        armMessage: 'Protection armed for your selected player at the next eligible ceremony.',
      },
    },
  },
}

export function getEyeoleanStoreProduct(
  key: EyeoleanStoreProductKey
): EyeoleanStoreProductDefinition {
  return EYEOLEAN_STORE_PRODUCTS[key]
}

export function getEyeoleanPowerModeRule(
  key: EyeoleanStoreProductKey,
  mode: EyeoleanPowerSeasonMode
): EyeoleanPowerModeRule {
  return getEyeoleanStoreProduct(key).modeRules[mode]
}
