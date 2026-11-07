import { useSyncExternalStore } from 'react'
import { getPlayerSafety, subscribePlayerSafety } from './playerSafety'

export function usePlayerSafety() {
  return useSyncExternalStore(subscribePlayerSafety, getPlayerSafety, () => null)
}
