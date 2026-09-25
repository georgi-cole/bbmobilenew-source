import type { Transaction } from '@capgo/native-purchases'
import { describe, expect, it } from 'vitest'
import { isOwnedStoreTransaction } from './vipPurchaseService'
import { VIP_UPGRADE_TIERS } from './vipUpgrade'

function transaction(productIdentifier: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    productIdentifier,
    isActive: true,
    ...overrides,
  } as Transaction
}

describe('VIP billing transaction recognition', () => {
  it('treats every configured VIP upgrade SKU as full VIP ownership on iOS restore', () => {
    for (const tier of VIP_UPGRADE_TIERS) {
      expect(isOwnedStoreTransaction(transaction(tier.productId), 'vip', 'ios')).toBe(true)
    }
  })

  it('treats an acknowledged purchased VIP upgrade SKU as full VIP ownership on Android', () => {
    const productId = VIP_UPGRADE_TIERS[0].productId
    expect(
      isOwnedStoreTransaction(
        transaction(productId, {
          purchaseState: 'PURCHASED',
          isAcknowledged: true,
        }),
        'vip',
        'android'
      )
    ).toBe(true)
  })

  it('does not let a standalone product masquerade as VIP', () => {
    expect(
      isOwnedStoreTransaction(transaction('com.georgicole.thebigeye.survival'), 'vip', 'ios')
    ).toBe(false)
  })
})
