import type { Transaction } from '@capgo/native-purchases'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DurableStorageBackend } from '../store/durablePersistence'

const native = vi.hoisted(() => ({
  platform: 'android',
  configure: vi.fn(),
  isBillingSupported: vi.fn(),
  getProducts: vi.fn(),
  getPurchases: vi.fn(),
  getUnfinishedTransactions: vi.fn(),
  purchaseProduct: vi.fn(),
  consumePurchase: vi.fn(),
  finishTransaction: vi.fn(),
  acknowledgePurchase: vi.fn(),
  restorePurchases: vi.fn(),
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.platform !== 'web',
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
vi.mock('../safety/playerSafety', () => ({ assertAdultServicesAllowed: vi.fn() }))

const productId = 'com.georgicole.thebigeye.survivalrun'
const ledgerKey = 'bbmobilenew:survival-run-purchases:v1'

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: id,
    productIdentifier: productId,
    purchaseToken: `token-${id}`,
    purchaseState: 'PURCHASED',
    quantity: 1,
    purchaseDate: '2026-11-10T00:00:00Z',
    willCancel: null,
    ...overrides,
  }
}

async function setup(existing = new Map<string, string>()) {
  const apply = vi.fn<DurableStorageBackend['apply']>(async (mutations) => {
    for (const { key, value } of mutations) {
      if (value === null) existing.delete(key)
      else existing.set(key, value)
    }
  })
  const persistence = await import('../store/durablePersistence')
  await persistence.initializeDurablePersistence({
    kind: 'sqlite',
    loadAll: async () => new Map(existing),
    apply,
  })
  const service = await import('./survivalRunPurchaseService')
  return { service, existing, apply, persistence }
}

describe('paid Survival recovery delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    native.platform = 'android'
    native.configure.mockResolvedValue(undefined)
    native.isBillingSupported.mockResolvedValue({ isBillingSupported: true })
    native.getProducts.mockResolvedValue({
      products: [{ identifier: productId, priceString: '€0.99' }],
    })
    native.getPurchases.mockResolvedValue({ purchases: [] })
    native.getUnfinishedTransactions.mockResolvedValue({ transactions: [] })
    native.consumePurchase.mockResolvedValue(undefined)
    native.finishTransaction.mockResolvedValue(undefined)
    native.acknowledgePurchase.mockResolvedValue(undefined)
    native.restorePurchases.mockResolvedValue(undefined)
    native.addListener.mockResolvedValue({ remove: vi.fn() })
  })

  it('commits a credit before consuming the Android token, and permits repeated purchases', async () => {
    const { service, existing } = await setup()
    let purchaseNumber = 0
    native.purchaseProduct.mockImplementation(async () => transaction(`order-${++purchaseNumber}`))
    native.consumePurchase.mockImplementation(async () => {
      const ledger = JSON.parse(existing.get(ledgerKey)!)
      expect(Object.keys(ledger.purchases)).toHaveLength(purchaseNumber)
    })

    for (let count = 0; count < 9; count += 1)
      expect(await service.purchaseSurvivalRun()).toBe(true)

    expect(service.getSurvivalRunsSnapshot().balance).toBe(9)
    expect(native.purchaseProduct).toHaveBeenCalledTimes(9)
    expect(native.purchaseProduct).toHaveBeenLastCalledWith({
      productIdentifier: productId,
      productType: 'inapp',
      quantity: 1,
      isConsumable: false,
      autoAcknowledgePurchases: false,
    })
    expect(native.acknowledgePurchase).not.toHaveBeenCalled()
  })

  it('does not grant or finish pending, wrong-product, revoked, or unidentified payments', async () => {
    const { service } = await setup()
    for (const invalid of [
      transaction('pending', { purchaseState: '0' }),
      transaction('wrong', { productIdentifier: 'com.georgicole.thebigeye.vip' }),
      transaction('revoked', { revocationDate: '2026-11-10' }),
      transaction('missing-token', { purchaseToken: undefined }),
      transaction(''),
    ]) {
      native.purchaseProduct.mockResolvedValueOnce(invalid)
      expect(await service.purchaseSurvivalRun()).toBe(false)
    }
    expect(service.getSurvivalRunsSnapshot().balance).toBe(0)
    expect(native.consumePurchase).not.toHaveBeenCalled()
    expect(native.finishTransaction).not.toHaveBeenCalled()
  })

  it('prevents overlapping checkouts and leaves confirmed delivery independent of the caller', async () => {
    const { service } = await setup()
    let finish!: (transaction: Transaction) => void
    native.purchaseProduct.mockReturnValueOnce(
      new Promise<Transaction>((resolve) => {
        finish = resolve
      })
    )
    const first = service.purchaseSurvivalRun()
    await vi.waitFor(() => expect(native.purchaseProduct).toHaveBeenCalledTimes(1))
    expect(await service.purchaseSurvivalRun()).toBe(false)
    finish(transaction('only-checkout'))
    expect(await first).toBe(true)
    expect(service.getSurvivalRunsSnapshot()).toMatchObject({ balance: 1, purchasing: false })
  })

  it('cannot start a purchase without a localized store product price', async () => {
    const { service } = await setup()
    native.getProducts.mockResolvedValue({ products: [{ identifier: productId, priceString: '' }] })
    expect(await service.purchaseSurvivalRun()).toBe(false)
    expect(native.purchaseProduct).not.toHaveBeenCalled()
  })

  it('does not charge when storage is unavailable, and does not grant on cancellation', async () => {
    const { service, apply } = await setup()
    apply.mockRejectedValueOnce(new Error('Disk full'))
    expect(await service.purchaseSurvivalRun()).toBe(false)
    expect(native.purchaseProduct).not.toHaveBeenCalled()

    native.purchaseProduct.mockRejectedValueOnce(new Error('Purchase cancelled.'))
    expect(await service.purchaseSurvivalRun()).toBe(false)
    expect(service.getSurvivalRunsSnapshot()).toMatchObject({ balance: 0, error: null })
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })

  it('leaves payment unfinished when delivery cannot be committed, then recovers it once', async () => {
    const { service, apply } = await setup()
    const paid = transaction('recover-later')
    native.purchaseProduct.mockImplementationOnce(async () => {
      apply.mockRejectedValueOnce(new Error('Storage stopped'))
      return paid
    })
    expect(await service.purchaseSurvivalRun()).toBe(false)
    expect(native.consumePurchase).not.toHaveBeenCalled()
    expect(service.getSurvivalRunsSnapshot().balance).toBe(0)

    native.getPurchases.mockResolvedValue({ purchases: [paid] })
    await service.refreshSurvivalRuns()
    await service.refreshSurvivalRuns()
    expect(service.getSurvivalRunsSnapshot().balance).toBe(1)
    expect(native.consumePurchase).toHaveBeenCalledTimes(1)
  })

  it('does not recreate spent credits when a completed transaction is replayed', async () => {
    const { service } = await setup()
    const paid = transaction('same-order')
    native.purchaseProduct.mockResolvedValueOnce(paid)
    expect(await service.purchaseSurvivalRun()).toBe(true)
    expect(await service.reserveSurvivalRunCredit('run:day:death')).toBe(true)
    await service.finalizeSurvivalRunCredit('run:day:death')

    native.getPurchases.mockResolvedValue({ purchases: [paid] })
    await service.refreshSurvivalRuns()
    expect(service.getSurvivalRunsSnapshot().balance).toBe(0)
    expect(native.consumePurchase).toHaveBeenCalledTimes(1)
  })

  it('preserves a delivered credit if native finishing fails or was already completed', async () => {
    const { service, existing } = await setup()
    native.purchaseProduct.mockResolvedValueOnce(transaction('finished-before-crash'))
    native.consumePurchase.mockRejectedValueOnce(new Error('Native response lost'))
    expect(await service.purchaseSurvivalRun()).toBe(true)
    expect(service.getSurvivalRunsSnapshot().balance).toBe(1)
    expect(
      JSON.parse(existing.get(ledgerKey)!).purchases['android:finished-before-crash'].finished
    ).toBe(false)

    // The platform no longer owns the token: it finished before the crash.
    await service.refreshSurvivalRuns()
    expect(service.getSurvivalRunsSnapshot().balance).toBe(1)
    expect(
      JSON.parse(existing.get(ledgerKey)!).purchases['android:finished-before-crash'].finished
    ).toBe(true)
  })

  it('recovers iOS only from unfinished verified transactions, never from consumable history', async () => {
    native.platform = 'ios'
    const { service, existing } = await setup()
    native.getUnfinishedTransactions.mockResolvedValue({
      transactions: [transaction('ios-pending')],
    })
    native.finishTransaction.mockImplementationOnce(async () => {
      expect(JSON.parse(existing.get(ledgerKey)!).purchases['ios:ios-pending'].units).toBe(1)
    })
    await service.refreshSurvivalRuns()
    expect(service.getSurvivalRunsSnapshot().balance).toBe(1)
    expect(native.getPurchases).not.toHaveBeenCalled()
    expect(native.finishTransaction).toHaveBeenCalledWith({ transactionId: 'ios-pending' })
    expect(native.configure).toHaveBeenCalledWith({ autoFinishTransactions: false })
  })

  it('retains purchased credits across module/app restart and never invents web credits', async () => {
    const { service, existing } = await setup()
    native.purchaseProduct.mockResolvedValueOnce(transaction('persistent'))
    expect(await service.purchaseSurvivalRun()).toBe(true)
    vi.resetModules()
    native.platform = 'web'
    const restored = await setup(existing)
    await restored.service.refreshSurvivalRuns()
    expect(restored.service.getSurvivalRunsSnapshot()).toMatchObject({
      balance: 1,
      billingAvailable: false,
      product: null,
    })
    expect(await restored.service.purchaseSurvivalRun()).toBe(false)
    expect(restored.service.getSurvivalRunsSnapshot().balance).toBe(1)
  })

  it('keeps permanent Android purchase acknowledgement working in manual native mode', async () => {
    await setup()
    const permanent = transaction('no-ads', { productIdentifier: 'com.georgicole.thebigeye.noads' })
    native.purchaseProduct.mockResolvedValueOnce(permanent)
    native.getPurchases.mockResolvedValue({ purchases: [{ ...permanent, isAcknowledged: true }] })
    const { purchaseStoreProduct } = await import('./vipPurchaseService')
    const result = await purchaseStoreProduct('noAds')
    expect(native.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'token-no-ads' })
    expect(result.entitlements.noAds).toBe(true)
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })

  it('does not let permanent restore finish an undelivered consumable', async () => {
    native.platform = 'ios'
    await setup()
    native.getUnfinishedTransactions.mockResolvedValue({
      transactions: [transaction('survival-awaiting-delivery')],
    })
    const { loadVipStoreSnapshot } = await import('./vipPurchaseService')
    const result = await loadVipStoreSnapshot({ restore: true })
    expect(result.isActive).toBe(false)
    expect(native.finishTransaction).not.toHaveBeenCalled()
    expect(native.consumePurchase).not.toHaveBeenCalled()
  })
})
