import { NativePurchases } from '@capgo/native-purchases'

let configuring: Promise<void> | null = null

/** Matches the static Capacitor setting, including after a hot reload. */
export function configureNativePurchaseLifecycle(): Promise<void> {
  if (!configuring) {
    configuring = NativePurchases.configure({ autoFinishTransactions: false }).catch((error) => {
      configuring = null
      throw error
    })
  }
  return configuring
}
