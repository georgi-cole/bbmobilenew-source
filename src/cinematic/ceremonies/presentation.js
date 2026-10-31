import { useSyncExternalStore } from 'react'
import { ceremonyQueue } from './runtime.mjs'
const snapshot = () => Boolean(ceremonyQueue.counts.active || ceremonyQueue.counts.queued)
export function useVipPresentation() {
  return useSyncExternalStore(ceremonyQueue.subscribe, snapshot, () => false)
}
