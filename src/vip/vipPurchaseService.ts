import { Capacitor } from '@capacitor/core'
import {
  NativePurchases,
  PURCHASE_TYPE,
  type Product,
  type Transaction,
} from '@capgo/native-purchases'
import {
  STORE_PRODUCT_CATALOG,
  getStoreProductDefinition,
  type StoreEntitlementKey,
  type StoreProductDefinition,
  type StoreProductKey,
} from './vipConfig'
import { createEmptyStoreEntitlements, type StoreEntitlements } from './vipStorage'
import { getVipBillingProductId, isVipBillingProductId } from './vipUpgrade'
import { TEMPORARY_STORE_UNLOCKS_ENABLED } from './effectiveEntitlements'
import { IS_MOBILE_DEV_BUILD } from '../config/buildTarget'
import { configureNativePurchaseLifecycle } from './nativePurchaseLifecycle'
import { withNativeBilling } from './nativeBillingQueue'

export interface StoreProduct {
  key: StoreProductKey
  productId: string
  title: string
  description: string
  price: string
}

export interface VipStoreSnapshot {
  billingAvailable: boolean
  isActive: boolean
  entitlements: StoreEntitlements
  products: Partial<Record<StoreProductKey, StoreProduct>>
  verifiedAt: string
}

function toStoreProduct(
  product: Product,
  definition: StoreProductDefinition,
  productId = definition.productId
): StoreProduct {
  return {
    key: definition.key,
    productId,
    title: definition.key === 'vip' ? definition.title : product.title || definition.title,
    description:
      definition.key === 'vip'
        ? definition.description
        : product.description || definition.description,
    price: product.priceString,
  }
}

function productMatchesIdentifier(product: Product, productId: string): boolean {
  return product.identifier === productId || product.planIdentifier === productId
}

export function isOwnedStoreTransaction(
  transaction: Transaction,
  productKey: StoreProductKey,
  platform: string = Capacitor.getPlatform()
): boolean {
  const definition = getStoreProductDefinition(productKey)
  if (
    productKey === 'vip'
      ? !isVipBillingProductId(transaction.productIdentifier)
      : transaction.productIdentifier !== definition.productId
  ) {
    return false
  }

  if (platform === 'android') {
    const isCompleted =
      transaction.purchaseState === '1' || transaction.purchaseState === 'PURCHASED'
    return isCompleted && transaction.isAcknowledged === true
  }

  if (transaction.revocationDate || transaction.subscriptionState === 'revoked') return false
  // getPurchases({ onlyCurrentEntitlements: true }) scopes iOS results to
  // currently owned non-consumables. Some StoreKit versions omit isActive for IAP.
  return transaction.isActive !== false
}

export function isActiveVipTransaction(
  transaction: Transaction,
  platform: string = Capacitor.getPlatform()
): boolean {
  return isOwnedStoreTransaction(transaction, 'vip', platform)
}

function isNativeBillingPlatform(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios')
  )
}

async function loadProducts(
  entitlements: StoreEntitlements
): Promise<Partial<Record<StoreProductKey, StoreProduct>>> {
  const releasedProducts = STORE_PRODUCT_CATALOG.filter(
    (definition) => definition.availableInRelease
  )
  const vipBillingProductId = getVipBillingProductId(entitlements)
  const requestedProductIds = releasedProducts.map((definition) =>
    definition.key === 'vip' ? vipBillingProductId : definition.productId
  )
  const { products } = await withNativeBilling(
    () =>
      NativePurchases.getProducts({
        productIdentifiers: requestedProductIds,
        productType: PURCHASE_TYPE.INAPP,
      }),
    { retryDisconnected: true }
  )
  const catalog: Partial<Record<StoreProductKey, StoreProduct>> = {}
  for (const definition of releasedProducts) {
    const productId = definition.key === 'vip' ? vipBillingProductId : definition.productId
    const product = products.find((candidate) => productMatchesIdentifier(candidate, productId))
    if (product) catalog[definition.key] = toStoreProduct(product, definition, productId)
  }
  return catalog
}

function ownershipFromTransactions(purchases: Transaction[]): {
  isActive: boolean
  entitlements: StoreEntitlements
} {
  const entitlements = createEmptyStoreEntitlements()
  let isActive = false

  for (const definition of STORE_PRODUCT_CATALOG) {
    const owned = purchases.some((purchase) => isOwnedStoreTransaction(purchase, definition.key))
    if (definition.key === 'vip') {
      isActive = owned
    } else if (definition.entitlement) {
      entitlements[definition.entitlement] = owned
    }
  }

  return { isActive, entitlements }
}

async function loadOwnership(): Promise<{
  isActive: boolean
  entitlements: StoreEntitlements
}> {
  const { purchases } = await withNativeBilling(
    () =>
      NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.INAPP,
        onlyCurrentEntitlements: true,
      }),
    { retryDisconnected: true }
  )
  return ownershipFromTransactions(purchases)
}

function permanentProductForTransaction(
  transaction: Transaction
): StoreProductDefinition | undefined {
  return STORE_PRODUCT_CATALOG.find((definition) =>
    definition.key === 'vip'
      ? isVipBillingProductId(transaction.productIdentifier)
      : definition.productId === transaction.productIdentifier
  )
}

async function finishPermanentPurchase(transaction: Transaction): Promise<boolean> {
  const definition = permanentProductForTransaction(transaction)
  if (!definition || !transaction.transactionId?.trim()) return false
  if (
    transaction.revocationDate ||
    transaction.subscriptionState === 'revoked' ||
    transaction.isActive === false
  )
    return false
  if (Capacitor.getPlatform() === 'android') {
    if (
      (transaction.purchaseState !== '1' && transaction.purchaseState !== 'PURCHASED') ||
      !transaction.purchaseToken
    )
      return false
    if (!transaction.isAcknowledged)
      await withNativeBilling(() =>
        NativePurchases.acknowledgePurchase({ purchaseToken: transaction.purchaseToken! })
      )
  } else {
    await NativePurchases.finishTransaction({ transactionId: transaction.transactionId })
  }
  return true
}

async function finishUnfinishedPermanentPurchases(): Promise<void> {
  // All permanent products are one-time purchases. Android's unfinished helper
  // also queries subscriptions and can fail an otherwise valid in-app catalog.
  const transactions =
    Capacitor.getPlatform() === 'android'
      ? (
          await withNativeBilling(
            () => NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP }),
            { retryDisconnected: true }
          )
        ).purchases
      : (await NativePurchases.getUnfinishedTransactions()).transactions
  for (const transaction of transactions) await finishPermanentPurchase(transaction)
}

export async function loadVipStoreSnapshot(options?: {
  restore?: boolean
}): Promise<VipStoreSnapshot> {
  const verifiedAt = new Date().toISOString()

  // A locally installed mobile-dev build deliberately does not contact StoreKit
  // or Google Play. Raw ownership stays false; the effective entitlement layer
  // supplies developer access without pretending a purchase occurred.
  if (IS_MOBILE_DEV_BUILD) {
    return {
      billingAvailable: false,
      isActive: false,
      entitlements: createEmptyStoreEntitlements(),
      products: {},
      verifiedAt,
    }
  }

  if (!isNativeBillingPlatform()) {
    return {
      billingAvailable: false,
      isActive: TEMPORARY_STORE_UNLOCKS_ENABLED,
      entitlements: createEmptyStoreEntitlements(),
      products: {},
      verifiedAt,
    }
  }

  const { isBillingSupported } = await withNativeBilling(() => NativePurchases.isBillingSupported())
  if (!isBillingSupported) {
    return {
      billingAvailable: false,
      isActive: false,
      entitlements: createEmptyStoreEntitlements(),
      products: {},
      verifiedAt,
    }
  }

  await configureNativePurchaseLifecycle()
  // Google Play ownership is restored by the INAPP query and acknowledgment
  // below. The Android restore helper starts queries before its promise settles.
  if (options?.restore && Capacitor.getPlatform() !== 'android')
    await NativePurchases.restorePurchases()
  // Manual native finishing protects consumables. Permanent unlocks remain
  // restorable, so acknowledge their completed transactions before ownership refresh.
  await finishUnfinishedPermanentPurchases()
  const ownership = await loadOwnership()
  const products = await loadProducts(ownership.entitlements)
  return {
    billingAvailable: true,
    ...ownership,
    products,
    verifiedAt,
  }
}

export async function purchaseStoreProduct(productKey: StoreProductKey): Promise<VipStoreSnapshot> {
  if (IS_MOBILE_DEV_BUILD) {
    throw new Error('Purchases are disabled in the mobile developer build.')
  }
  if (!isNativeBillingPlatform()) {
    throw new Error('Purchases are only available in the iOS and Android app.')
  }

  await configureNativePurchaseLifecycle()

  const definition = getStoreProductDefinition(productKey)
  if (!definition.availableInRelease) {
    throw new Error('This product is not available in the current release.')
  }
  const billingProductId =
    productKey === 'vip'
      ? getVipBillingProductId((await loadOwnership()).entitlements)
      : definition.productId
  const transaction = await withNativeBilling(() =>
    NativePurchases.purchaseProduct({
      productIdentifier: billingProductId,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: false,
      autoAcknowledgePurchases: false,
    })
  )

  // Check payment state before manual acknowledgment. Consumable transactions
  // never reach this permanent-entitlement path.
  let finished = false
  if (
    transaction.productIdentifier === billingProductId &&
    (Capacitor.getPlatform() !== 'android' ||
      transaction.purchaseState === '1' ||
      transaction.purchaseState === 'PURCHASED')
  ) {
    finished = await finishPermanentPurchase(transaction)
  }

  if (
    transaction.productIdentifier !== billingProductId ||
    !finished ||
    !isOwnedStoreTransaction(
      Capacitor.getPlatform() === 'android'
        ? { ...transaction, isAcknowledged: true }
        : transaction,
      productKey
    )
  ) {
    throw new Error(
      transaction.purchaseState === '0'
        ? 'Your purchase is pending. It will unlock after the store confirms payment.'
        : 'The store did not return this purchase as owned yet. Try Restore Purchases in a moment.'
    )
  }

  return loadVipStoreSnapshot()
}

export function hasStoreEntitlement(
  snapshot: Pick<VipStoreSnapshot, 'isActive' | 'entitlements'>,
  entitlement: StoreEntitlementKey
): boolean {
  return snapshot.isActive || snapshot.entitlements[entitlement]
}
