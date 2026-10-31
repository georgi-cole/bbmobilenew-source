import { useCallback, useSyncExternalStore } from 'react'
import { useStore } from 'react-redux'
import type { Store } from '@reduxjs/toolkit'
import type { RootState } from '../../store/store'

export type Preview = { scope: string; ids: readonly string[]; marked: boolean }
const EMPTY: Preview = { scope: '', ids: [], marked: false }
const channels = new WeakMap<Store<RootState>, ReturnType<typeof makeChannel>>()
export const scopeFor = (state: RootState, game = state.game) =>
  `${state.profiles?.activeProfileId ?? (state.profiles?.isGuest ? 'guest' : 'none')}:${game.gameId || `${game.seed}:${game.season}`}:${game.week}`
function makeChannel() {
  let current = EMPTY
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next: Preview) {
      current = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
export function channelFor(store: Store<RootState>) {
  if (!channels.has(store)) channels.set(store, makeChannel())
  return channels.get(store)!
}
export function hasCoveredRosterExit(store: Store<RootState>, game: RootState['game'], id: string) {
  const preview = channelFor(store).get()
  return (
    preview.scope === scopeFor(store.getState(), game) && preview.marked && preview.ids.includes(id)
  )
}
export function clearRosterExit(store: Store<RootState>) {
  channelFor(store).set(EMPTY)
}
export function useRosterExitPreview() {
  const store = useStore<RootState>()
  const channel = channelFor(store)
  const get = useCallback(() => {
    const preview = channel.get()
    return preview.scope === scopeFor(store.getState()) ? preview : EMPTY
  }, [channel, store])
  return useSyncExternalStore(channel.subscribe, get, () => EMPTY)
}
