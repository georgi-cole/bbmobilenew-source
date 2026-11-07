import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativePurchases } from '@capgo/native-purchases'
import { loadVipStoreSnapshot, purchaseStoreProduct } from '../../vip/vipPurchaseService'
import { VIP_PRODUCT_ID } from '../../vip/vipConfig'
import { declarePlayerAge } from '../playerSafety'
import { installSafetyFixture } from './safetyFixture'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}))
vi.mock('@capgo/native-purchases', () => ({
  PURCHASE_TYPE: { INAPP: 'inapp' },
  NativePurchases: {
    isBillingSupported: vi.fn(),
    getProducts: vi.fn(),
    getPurchases: vi.fn(),
    purchaseProduct: vi.fn(),
    restorePurchases: vi.fn(),
  },
}))

describe('native purchase safety', () => {
  beforeEach(() => {
    installSafetyFixture()
    vi.mocked(NativePurchases.isBillingSupported).mockResolvedValue({ isBillingSupported: true })
    vi.mocked(NativePurchases.getProducts).mockResolvedValue({ products: [] })
    vi.mocked(NativePurchases.getPurchases).mockResolvedValue({ purchases: [] })
    vi.mocked(NativePurchases.purchaseProduct).mockResolvedValue({
      productIdentifier: VIP_PRODUCT_ID,
      isActive: true,
    } as never)
  })
  afterEach(() => vi.clearAllMocks())

  it.each([undefined, 11, 15, 17])('never calls native billing for player age %s', async (age) => {
    if (age !== undefined) declarePlayerAge(age)
    await expect(purchaseStoreProduct('vip')).rejects.toThrow(/adult/)
    await expect(loadVipStoreSnapshot({ restore: true })).rejects.toThrow(/adult/)
    for (const method of Object.values(NativePurchases)) expect(method).not.toHaveBeenCalled()
  })

  it('keeps ordinary adult billing available', async () => {
    declarePlayerAge(28)
    await purchaseStoreProduct('vip')
    expect(NativePurchases.purchaseProduct).toHaveBeenCalledOnce()
    await loadVipStoreSnapshot({ restore: true })
    expect(NativePurchases.restorePurchases).toHaveBeenCalledOnce()
  })

  it('rechecks after asynchronous ownership lookup before starting a purchase', async () => {
    declarePlayerAge(28)
    let resolveOwnership: ((value: { purchases: [] }) => void) | undefined
    vi.mocked(NativePurchases.getPurchases).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOwnership = resolve
        })
    )
    const pending = expect(purchaseStoreProduct('vip')).rejects.toThrow(/adult/)
    declarePlayerAge(12)
    resolveOwnership!({ purchases: [] })
    await pending
    expect(NativePurchases.purchaseProduct).not.toHaveBeenCalled()
  })
})
