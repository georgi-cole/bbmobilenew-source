import { Capacitor } from '@capacitor/core'
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases'
import { IS_MOBILE_DEV_BUILD } from '../config/buildTarget'
import { assertAdultServicesAllowed } from '../safety/playerSafety'
import { initializeDurablePersistence } from '../store/durablePersistence'
import { configureNativePurchaseLifecycle } from './nativePurchaseLifecycle'
import { withNativeBilling } from './nativeBillingQueue'
import { SURVIVAL_RUN_PRODUCT } from './vipConfig'
import {
  getSurvivalRunBalance,
  getSurvivalRunPurchaseRecord,
  getUnfinishedSurvivalRunRecords,
  markSurvivalRunPurchaseFinished,
  prepareSurvivalRunLedger,
  recordSurvivalRunPurchase,
  subscribeSurvivalRunLedger,
} from './survivalRunStorage'

export {
  finalizeSurvivalRunCredit,
  hasSurvivalRunRedemption,
  releaseSurvivalRunCredit,
  reserveSurvivalRunCredit,
} from './survivalRunStorage'

export interface SurvivalRunStoreProduct {
  productId: string
  title: string
  description: string
  price: string
}

export interface SurvivalRunsSnapshot {
  balance: number
  product: SurvivalRunStoreProduct | null
  billingAvailable: boolean
  loading: boolean
  purchasing: boolean
  error: string | null
}

const listeners = new Set<() => void>()
let snapshot: SurvivalRunsSnapshot = {
  balance: 0,
  product: null,
  billingAvailable: false,
  loading: false,
  purchasing: false,
  error: null,
}
let initializing: Promise<void> | null = null
let refreshing: Promise<void> | null = null
let deliveryQueue: Promise<unknown> = Promise.resolve()

function publish(update: Partial<SurvivalRunsSnapshot>): void {
  snapshot = { ...snapshot, ...update }
  for (const listener of listeners) listener()
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message
  return 'The store could not be reached. Please try again.'
}

function purchaseWasCancelled(error: unknown): boolean {
  return /cancelled|canceled|usercancel/i.test(errorMessage(error))
}

function nativePlatform(): 'android' | 'ios' | null {
  if (IS_MOBILE_DEV_BUILD || !Capacitor.isNativePlatform()) return null
  const platform = Capacitor.getPlatform()
  return platform === 'android' || platform === 'ios' ? platform : null
}

function refreshBalance(): void {
  try {
    publish({ balance: getSurvivalRunBalance() })
  } catch (error) {
    publish({ error: errorMessage(error) })
  }
}

export function getSurvivalRunsSnapshot(): SurvivalRunsSnapshot {
  return snapshot
}

export function subscribeSurvivalRuns(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function clearSurvivalRunsError(): void {
  publish({ error: null })
}

export function isCompletedSurvivalRunTransaction(
  transaction: Transaction,
  platform: 'android' | 'ios'
): boolean {
  if (
    transaction.productIdentifier !== SURVIVAL_RUN_PRODUCT.productId ||
    !transaction.transactionId?.trim() ||
    transaction.revocationDate ||
    transaction.subscriptionState === 'revoked' ||
    transaction.isActive === false ||
    transaction.ownershipType === 'familyShared' ||
    (transaction.productType && transaction.productType !== PURCHASE_TYPE.INAPP)
  )
    return false
  const units = transaction.quantity ?? 1
  if (!Number.isSafeInteger(units) || units < 1) return false
  if (platform === 'android') {
    return (
      (transaction.purchaseState === '1' || transaction.purchaseState === 'PURCHASED') &&
      Boolean(transaction.purchaseToken?.trim())
    )
  }
  // StoreKit's purchase result / unfinished queue contains verified transactions.
  // Do not query Transaction.all: consumed purchases must never be restored.
  return true
}

function deliverTransaction(transaction: Transaction, platform: 'android' | 'ios'): Promise<void> {
  const delivery = deliveryQueue.then(async () => {
    if (!isCompletedSurvivalRunTransaction(transaction, platform))
      throw new Error('The store has not confirmed this Survival run purchase yet.')
    const purchaseKey = `${platform}:${transaction.transactionId}`
    if (getSurvivalRunPurchaseRecord(purchaseKey)?.finished) return

    // Commit the actual credit before allowing the platform to remove its transaction.
    await recordSurvivalRunPurchase({
      platform,
      transactionId: transaction.transactionId,
      units: transaction.quantity ?? 1,
    })
    refreshBalance()

    try {
      if (platform === 'android') {
        await withNativeBilling(() =>
          NativePurchases.consumePurchase({ purchaseToken: transaction.purchaseToken! })
        )
      } else {
        await NativePurchases.finishTransaction({ transactionId: transaction.transactionId })
      }
      await markSurvivalRunPurchaseFinished(purchaseKey)
    } catch {
      // Delivery is already durable. Never revoke a paid credit because finishing
      // failed (or because the app stopped after the store finished successfully).
      publish({ error: 'Your Survival run is saved. Store confirmation will retry automatically.' })
    }
  })
  deliveryQueue = delivery.catch(() => undefined)
  return delivery
}

async function recoverPendingTransactions(platform: 'android' | 'ios'): Promise<void> {
  // Android may have an acknowledged but not yet consumed token. getPurchases
  // returns current owned tokens; iOS must use only the unfinished queue.
  const transactions =
    platform === 'android'
      ? (
          await withNativeBilling(
            () => NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP }),
            { retryDisconnected: true }
          )
        ).purchases
      : (await NativePurchases.getUnfinishedTransactions()).transactions
  const pending = transactions.filter(
    (transaction) => transaction.productIdentifier === SURVIVAL_RUN_PRODUCT.productId
  )
  const pendingKeys = new Set(
    pending.map((transaction) => `${platform}:${transaction.transactionId}`)
  )

  for (const transaction of pending) {
    if (isCompletedSurvivalRunTransaction(transaction, platform))
      await deliverTransaction(transaction, platform)
  }

  // A crash after consume/finish but before this marker was saved is harmless:
  // the grant remains in the ledger, and an absent native token needs no retry.
  for (const [key, purchase] of getUnfinishedSurvivalRunRecords()) {
    if (purchase.platform === platform && !pendingKeys.has(key))
      await markSurvivalRunPurchaseFinished(key)
  }
}

export function initializeSurvivalRunPurchases(): Promise<void> {
  if (initializing) return initializing
  initializing = (async () => {
    await initializeDurablePersistence()
    // Throw on a corrupted paid ledger rather than silently replacing it.
    publish({ balance: getSurvivalRunBalance() })
    subscribeSurvivalRunLedger(refreshBalance)
    const platform = nativePlatform()
    if (!platform) return
    await configureNativePurchaseLifecycle()
    if (platform === 'ios') {
      await NativePurchases.addListener('transactionUpdated', (transaction) => {
        if (transaction.productIdentifier !== SURVIVAL_RUN_PRODUCT.productId) return
        if (!isCompletedSurvivalRunTransaction(transaction, platform)) return
        void deliverTransaction(transaction, platform).catch((error) =>
          publish({ error: errorMessage(error) })
        )
      })
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refreshSurvivalRuns()
    })
  })().catch((error) => {
    initializing = null
    throw error
  })
  return initializing
}

export function refreshSurvivalRuns(): Promise<void> {
  if (refreshing) return refreshing
  publish({ loading: true, error: null })
  refreshing = (async () => {
    await initializeSurvivalRunPurchases()
    const platform = nativePlatform()
    if (!platform) {
      publish({ billingAvailable: false, product: null })
      return
    }
    const { isBillingSupported } = await withNativeBilling(() =>
      NativePurchases.isBillingSupported()
    )
    if (!isBillingSupported) {
      publish({ billingAvailable: false, product: null })
      return
    }
    await recoverPendingTransactions(platform)
    const { products } = await withNativeBilling(
      () =>
        NativePurchases.getProducts({
          productIdentifiers: [SURVIVAL_RUN_PRODUCT.productId],
          productType: PURCHASE_TYPE.INAPP,
        }),
      { retryDisconnected: true }
    )
    const product = products.find(
      (candidate) => candidate.identifier === SURVIVAL_RUN_PRODUCT.productId
    )
    publish({
      billingAvailable: true,
      product: product?.priceString?.trim()
        ? {
            productId: SURVIVAL_RUN_PRODUCT.productId,
            title: SURVIVAL_RUN_PRODUCT.title,
            description: SURVIVAL_RUN_PRODUCT.description,
            price: product.priceString,
          }
        : null,
    })
    refreshBalance()
  })()
    .catch((error) => {
      publish({ billingAvailable: false, product: null, error: errorMessage(error) })
    })
    .finally(() => {
      refreshing = null
      publish({ loading: false })
    })
  return refreshing
}

/** Buy one credit. Delivery continues even when its React caller unmounts. */
export async function purchaseSurvivalRun(): Promise<boolean> {
  if (snapshot.purchasing) return false
  publish({ purchasing: true, error: null })
  try {
    assertAdultServicesAllowed()
    const platform = nativePlatform()
    if (!platform) throw new Error('Purchases are only available in the iOS and Android app.')
    await initializeSurvivalRunPurchases()
    // Recover any previously paid token before opening another checkout.
    await refreshSurvivalRuns()
    if (!snapshot.billingAvailable || !snapshot.product)
      throw new Error('Survival runs are not available from the store right now. Please try again.')
    await prepareSurvivalRunLedger()
    const transaction = await withNativeBilling(() =>
      NativePurchases.purchaseProduct({
        productIdentifier: SURVIVAL_RUN_PRODUCT.productId,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
        // Android consumes only AFTER durable delivery, not inside the purchase call.
        isConsumable: false,
        autoAcknowledgePurchases: false,
      })
    )
    if (!isCompletedSurvivalRunTransaction(transaction, platform))
      throw new Error(
        'Your payment is pending. Your recovery will appear after the store confirms it.'
      )
    await deliverTransaction(transaction, platform)
    return true
  } catch (error) {
    publish({ error: purchaseWasCancelled(error) ? null : errorMessage(error) })
    return false
  } finally {
    publish({ purchasing: false })
  }
}
