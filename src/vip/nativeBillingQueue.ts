import { Capacitor } from '@capacitor/core'

let androidBillingQueue: Promise<unknown> = Promise.resolve()

function serviceDisconnected(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const details = error as { code?: unknown; message?: unknown }
  return (
    details.code === 'SERVICE_DISCONNECTED' ||
    /SERVICE_DISCONNECTED|service connection is disconnected|billing service disconnected/i.test(
      String(details.message ?? '')
    )
  )
}

/**
 * The Android bridge replaces its BillingClient for each call, before its
 * asynchronous query finishes. Keep all callers on one queue until settlement.
 * Only read operations opt in to one reconnect retry; checkout never does.
 */
export function withNativeBilling<T>(
  operation: () => Promise<T>,
  options: { retryDisconnected?: boolean } = {}
): Promise<T> {
  if (Capacitor.getPlatform() !== 'android') return operation()
  const result = androidBillingQueue.then(async () => {
    try {
      return await operation()
    } catch (error) {
      if (!options.retryDisconnected || !serviceDisconnected(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 300))
      return operation()
    }
  })
  androidBillingQueue = result.catch(() => undefined)
  return result
}
