import type { Transaction } from '@capgo/native-purchases'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isOwnedStoreTransaction } from './vipPurchaseService'
import { VIP_UPGRADE_TIERS } from './vipUpgrade'

const native = vi.hoisted(() => ({
  platform: 'ios',
  configure: vi.fn(),
  isBillingSupported: vi.fn(),
  getProducts: vi.fn(),
  getPurchases: vi.fn(),
  getUnfinishedTransactions: vi.fn(),
  purchaseProduct: vi.fn(),
  acknowledgePurchase: vi.fn(),
  finishTransaction: vi.fn(),
  consumePurchase: vi.fn(),
  restorePurchases: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => native.platform,
  },
}))
vi.mock('@capgo/native-purchases', () => ({
  PURCHASE_TYPE: { INAPP: 'inapp' },
  NativePurchases: native,
}))
vi.mock('../config/buildTarget', () => ({
  IS_MOBILE_DEV_BUILD: false,
  IS_ADMIN_BUILD: false,
}))

const noAdsProductId = 'com.georgicole.thebigeye.noads'
const survivalRunProductId = 'com.georgicole.thebigeye.survivalrun'

function transaction(productIdentifier: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: '2000001043762129',
    productIdentifier,
    productType: 'inapp',
    purchaseDate: '2026-11-10T00:00:00Z',
    willCancel: null,
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

describe('permanent purchases with manual native finishing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    native.platform = 'ios'
    native.configure.mockResolvedValue(undefined)
    native.isBillingSupported.mockResolvedValue({ isBillingSupported: true })
    native.getProducts.mockResolvedValue({ products: [] })
    native.getPurchases.mockResolvedValue({ purchases: [] })
    native.getUnfinishedTransactions.mockResolvedValue({ transactions: [] })
    native.acknowledgePurchase.mockResolvedValue(undefined)
    native.finishTransaction.mockResolvedValue(undefined)
    native.consumePurchase.mockResolvedValue(undefined)
    native.restorePurchases.mockResolvedValue(undefined)
  })

  it('acknowledges an Android purchase before querying and granting permanent ownership', async () => {
    native.platform = 'android'
    const purchase = transaction(noAdsProductId, {
      transactionId: 'GPA.1234-5678-9012-34567',
      purchaseToken: 'android-permanent-token',
      purchaseState: '1',
      isAcknowledged: false,
    })
    let acknowledged = false
    native.purchaseProduct.mockResolvedValue(purchase)
    native.acknowledgePurchase.mockImplementation(async () => {
      acknowledged = true
    })
    native.getPurchases.mockImplementation(async () => {
      expect(acknowledged).toBe(true)
      return { purchases: [{ ...purchase, isAcknowledged: acknowledged }] }
    })

    const { purchaseStoreProduct } = await import('./vipPurchaseService')
    const result = await purchaseStoreProduct('noAds')

    expect(native.configure).toHaveBeenCalledWith({ autoFinishTransactions: false })
    expect(native.purchaseProduct).toHaveBeenCalledWith({
      productIdentifier: noAdsProductId,
      productType: 'inapp',
      isConsumable: false,
      autoAcknowledgePurchases: false,
    })
    expect(native.acknowledgePurchase).toHaveBeenCalledWith({
      purchaseToken: 'android-permanent-token',
    })
    expect(result.entitlements.noAds).toBe(true)
    expect(native.finishTransaction).not.toHaveBeenCalled()
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })

  it('finishes a verified iOS purchase before refreshing its current entitlement', async () => {
    const purchase = transaction(noAdsProductId)
    let finished = false
    native.purchaseProduct.mockResolvedValue(purchase)
    native.finishTransaction.mockImplementation(async () => {
      finished = true
    })
    native.getPurchases.mockImplementation(async () => {
      expect(finished).toBe(true)
      return { purchases: [purchase] }
    })

    const { purchaseStoreProduct } = await import('./vipPurchaseService')
    const result = await purchaseStoreProduct('noAds')

    expect(native.finishTransaction).toHaveBeenCalledWith({
      transactionId: '2000001043762129',
    })
    expect(native.getPurchases).toHaveBeenCalledWith({
      productType: 'inapp',
      onlyCurrentEntitlements: true,
    })
    expect(result.entitlements.noAds).toBe(true)
    expect(native.acknowledgePurchase).not.toHaveBeenCalled()
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })

  it('does not acknowledge or grant a pending Android payment', async () => {
    native.platform = 'android'
    native.purchaseProduct.mockResolvedValue(
      transaction(noAdsProductId, {
        transactionId: '',
        purchaseToken: 'pending-token',
        purchaseState: '2',
        isAcknowledged: false,
      })
    )
    const { purchaseStoreProduct } = await import('./vipPurchaseService')

    await expect(purchaseStoreProduct('noAds')).rejects.toThrow()
    expect(native.acknowledgePurchase).not.toHaveBeenCalled()
    expect(native.finishTransaction).not.toHaveBeenCalled()
    expect(native.consumePurchase).not.toHaveBeenCalled()
    expect(native.getPurchases).not.toHaveBeenCalled()
  })

  it.each(['Purchase cancelled.', 'Purchase pending approval.'])(
    'leaves iOS transactions unfinished when checkout reports "%s"',
    async (message) => {
      native.purchaseProduct.mockRejectedValue(new Error(message))
      const { purchaseStoreProduct } = await import('./vipPurchaseService')

      await expect(purchaseStoreProduct('noAds')).rejects.toThrow(message)
      expect(native.finishTransaction).not.toHaveBeenCalled()
      expect(native.acknowledgePurchase).not.toHaveBeenCalled()
      expect(native.consumePurchase).not.toHaveBeenCalled()
      expect(native.getPurchases).not.toHaveBeenCalled()
    }
  )

  it('does not report a newly owned product when native acknowledgment fails', async () => {
    native.platform = 'android'
    native.purchaseProduct.mockResolvedValue(
      transaction(noAdsProductId, {
        transactionId: 'GPA.failed-ack',
        purchaseToken: 'unacknowledged-token',
        purchaseState: '1',
        isAcknowledged: false,
      })
    )
    native.acknowledgePurchase.mockRejectedValue(new Error('Store unavailable'))
    const { purchaseStoreProduct } = await import('./vipPurchaseService')

    await expect(purchaseStoreProduct('noAds')).rejects.toThrow('Store unavailable')
    expect(native.getPurchases).not.toHaveBeenCalled()
  })

  it.each(['ios', 'android'])(
    'recovers unfinished %s permanent purchases without finishing Survival consumables',
    async (platform) => {
      native.platform = platform
      const permanent = transaction(noAdsProductId, {
        transactionId: '2000001043762130',
        purchaseToken: 'permanent-startup-token',
        purchaseState: '1',
        isAcknowledged: false,
      })
      const consumable = transaction(survivalRunProductId, {
        transactionId: '2000001043762131',
        purchaseToken: 'survival-startup-token',
        purchaseState: '1',
        isAcknowledged: false,
      })
      let processed = false
      native.getUnfinishedTransactions.mockResolvedValue({
        transactions: [permanent, consumable],
      })
      native.acknowledgePurchase.mockImplementation(async () => {
        processed = true
      })
      native.finishTransaction.mockImplementation(async () => {
        processed = true
      })
      native.getPurchases.mockImplementation(async () => {
        expect(processed).toBe(true)
        return { purchases: [{ ...permanent, isAcknowledged: true }] }
      })

      const { loadVipStoreSnapshot } = await import('./vipPurchaseService')
      const result = await loadVipStoreSnapshot()

      expect(result.entitlements.noAds).toBe(true)
      if (platform === 'ios') {
        expect(native.finishTransaction).toHaveBeenCalledExactlyOnceWith({
          transactionId: permanent.transactionId,
        })
        expect(native.acknowledgePurchase).not.toHaveBeenCalled()
      } else {
        expect(native.acknowledgePurchase).toHaveBeenCalledExactlyOnceWith({
          purchaseToken: permanent.purchaseToken,
        })
        expect(native.finishTransaction).not.toHaveBeenCalled()
      }
      expect(native.consumePurchase).not.toHaveBeenCalled()
      expect(native.purchaseProduct).not.toHaveBeenCalled()
    }
  )
})
