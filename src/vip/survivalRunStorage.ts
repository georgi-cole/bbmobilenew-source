import {
  flushDurablePersistence,
  getDurableItem,
  initializeDurablePersistence,
  setDurableItem,
} from '../store/durablePersistence'

export const SURVIVAL_RUN_LEDGER_KEY = 'bbmobilenew:survival-run-purchases:v1'

export interface SurvivalRunPurchaseRecord {
  platform: 'android' | 'ios'
  transactionId: string
  units: number
  finished: boolean
}

interface SurvivalRunLedger {
  version: 1
  purchases: Record<string, SurvivalRunPurchaseRecord>
  redemptions: Record<string, 'reserved' | 'used'>
}

let mutationQueue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()

function emptyLedger(): SurvivalRunLedger {
  return { version: 1, purchases: {}, redemptions: {} }
}

function readLedger(): SurvivalRunLedger {
  const raw = getDurableItem(SURVIVAL_RUN_LEDGER_KEY)
  if (!raw) return emptyLedger()
  try {
    const parsed = JSON.parse(raw) as Partial<SurvivalRunLedger>
    if (
      parsed.version !== 1 ||
      !parsed.purchases ||
      Array.isArray(parsed.purchases) ||
      typeof parsed.purchases !== 'object' ||
      !parsed.redemptions ||
      Array.isArray(parsed.redemptions) ||
      typeof parsed.redemptions !== 'object'
    )
      throw new Error('Invalid ledger')
    for (const [key, record] of Object.entries(parsed.purchases)) {
      if (
        !record ||
        (record.platform !== 'ios' && record.platform !== 'android') ||
        typeof record.transactionId !== 'string' ||
        !record.transactionId.trim() ||
        key !== `${record.platform}:${record.transactionId}` ||
        !Number.isSafeInteger(record.units) ||
        record.units < 1 ||
        typeof record.finished !== 'boolean'
      )
        throw new Error('Invalid purchase record')
    }
    if (
      Object.entries(parsed.redemptions).some(
        ([key, status]) => !key.trim() || (status !== 'reserved' && status !== 'used')
      )
    )
      throw new Error('Invalid recovery record')
    const ledger = parsed as SurvivalRunLedger
    if (!Number.isSafeInteger(creditBalance(ledger)) || creditBalance(ledger) < 0)
      throw new Error('Invalid balance')
    return ledger
  } catch {
    // Never replace an unreadable paid balance with a new empty wallet.
    throw new Error('Your Survival runs could not be read. Please restart before purchasing.')
  }
}

function creditBalance(ledger: SurvivalRunLedger): number {
  return (
    Object.values(ledger.purchases).reduce((total, purchase) => total + purchase.units, 0) -
    Object.keys(ledger.redemptions).length
  )
}

async function persistLedger(ledger: SurvivalRunLedger): Promise<void> {
  if (
    !setDurableItem(SURVIVAL_RUN_LEDGER_KEY, JSON.stringify(ledger)) ||
    !(await flushDurablePersistence())
  ) {
    throw new Error('Your Survival runs could not be saved. Free some storage and try again.')
  }
  for (const listener of listeners) listener()
}

function mutateLedger<T>(change: (ledger: SurvivalRunLedger) => T): Promise<T> {
  const mutation = mutationQueue.then(async () => {
    await initializeDurablePersistence()
    const ledger = readLedger()
    const result = change(ledger)
    await persistLedger(ledger)
    return result
  })
  mutationQueue = mutation.catch(() => undefined)
  return mutation
}

export function subscribeSurvivalRunLedger(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSurvivalRunBalance(): number {
  return creditBalance(readLedger())
}

export function hasSurvivalRunRedemption(recoveryKey: string): boolean {
  try {
    return Object.hasOwn(readLedger().redemptions, recoveryKey)
  } catch {
    // Render-time availability checks must fail closed. Initialization and
    // mutation surface the unreadable-ledger error without crashing the screen.
    return false
  }
}

export function getSurvivalRunPurchaseRecord(
  purchaseKey: string
): SurvivalRunPurchaseRecord | undefined {
  const purchases = readLedger().purchases
  return Object.hasOwn(purchases, purchaseKey) ? purchases[purchaseKey] : undefined
}

export function getUnfinishedSurvivalRunRecords(): Array<[string, SurvivalRunPurchaseRecord]> {
  return Object.entries(readLedger().purchases).filter(([, record]) => !record.finished)
}

/** Verify writable durable storage before opening a real-money checkout. */
export function prepareSurvivalRunLedger(): Promise<void> {
  return mutateLedger(() => undefined)
}

export function recordSurvivalRunPurchase(
  purchase: Omit<SurvivalRunPurchaseRecord, 'finished'>
): Promise<void> {
  return mutateLedger((ledger) => {
    const key = `${purchase.platform}:${purchase.transactionId}`
    if (
      !purchase.transactionId.trim() ||
      !Number.isSafeInteger(purchase.units) ||
      purchase.units < 1
    )
      throw new Error('The store returned an invalid Survival run purchase.')
    if (Object.hasOwn(ledger.purchases, key)) {
      if (ledger.purchases[key].units !== purchase.units)
        throw new Error('The store returned inconsistent purchase details.')
      return
    }
    ledger.purchases[key] = { ...purchase, finished: false }
  })
}

export function markSurvivalRunPurchaseFinished(purchaseKey: string): Promise<void> {
  return mutateLedger((ledger) => {
    if (Object.hasOwn(ledger.purchases, purchaseKey)) ledger.purchases[purchaseKey].finished = true
  })
}

/** Reservations survive a restart; retrying the same elimination never spends twice. */
export function reserveSurvivalRunCredit(
  recoveryKey: string,
  stageDelivery?: () => boolean
): Promise<boolean> {
  return mutateLedger((ledger) => {
    if (!recoveryKey.trim()) throw new Error('This recovery is no longer available.')
    const alreadyReserved = Object.hasOwn(ledger.redemptions, recoveryKey)
    if (!alreadyReserved && creditBalance(ledger) < 1) return false
    // The caller can stage the resumed run beside the debit so native SQLite /
    // IndexedDB commit both records in the same durable transaction.
    if (stageDelivery && !stageDelivery()) return false
    if (!alreadyReserved) ledger.redemptions[recoveryKey] = 'reserved'
    return true
  })
}

/** A stale/cancelled recovery returns its reservation, but never refunds a delivered recovery. */
export function releaseSurvivalRunCredit(recoveryKey: string): Promise<void> {
  return mutateLedger((ledger) => {
    if (ledger.redemptions[recoveryKey] === 'reserved') delete ledger.redemptions[recoveryKey]
  })
}

export function finalizeSurvivalRunCredit(recoveryKey: string): Promise<void> {
  return mutateLedger((ledger) => {
    if (!Object.hasOwn(ledger.redemptions, recoveryKey))
      throw new Error('This Survival recovery has not been reserved.')
    ledger.redemptions[recoveryKey] = 'used'
  })
}
