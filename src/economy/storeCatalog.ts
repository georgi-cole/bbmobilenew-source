export const EYEOLEAN_STORE_PRODUCT_KEYS = ['extra_vote', 'remove_vote'] as const

export type EyeoleanStoreProductKey = (typeof EYEOLEAN_STORE_PRODUCT_KEYS)[number]

export interface EyeoleanStoreProductDefinition {
  key: EyeoleanStoreProductKey
  title: string
  price: number
  shortDescription: string
  inventoryLabel: string
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
    price: 3_000,
    shortDescription: 'Bank one extra-vote consumable for a future eligible elimination.',
    inventoryLabel: 'Extra Votes',
  },
  remove_vote: {
    key: 'remove_vote',
    title: 'Remove a Vote',
    price: 5_000,
    shortDescription: 'Bank one vote-removal consumable for a future eligible elimination.',
    inventoryLabel: 'Vote Removals',
  },
}

export function getEyeoleanStoreProduct(
  key: EyeoleanStoreProductKey
): EyeoleanStoreProductDefinition {
  return EYEOLEAN_STORE_PRODUCTS[key]
}
