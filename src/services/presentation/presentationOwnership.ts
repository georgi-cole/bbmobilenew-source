import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'

export type PresentationOwnerToken = symbol

export const PRESENTATION_PRIORITY = {
  broadcast: 20,
  ceremony: 30,
  audienceResult: 35,
  winnerAward: 40,
  broadcastShock: 45,
  twinShock: 50,
  evictionSpotlight: 60,
  credits: 80,
  finale: 100,
  gameplay: 200,
} as const

export interface PresentationOwnerSnapshot {
  groupId: string
  priority: number
}

interface PresentationRequest extends PresentationOwnerSnapshot {
  token: PresentationOwnerToken
  order: number
  version: number
}

const requests = new Map<PresentationOwnerToken, PresentationRequest>()
const pendingReleases = new Map<PresentationOwnerToken, number>()
const listeners = new Set<() => void>()
let nextOrder = 0
let nextVersion = 0
let ownerSnapshot: PresentationRequest | null = null

function getOwnerSnapshot(): PresentationRequest | null {
  return ownerSnapshot
}

function getServerOwnerSnapshot(): PresentationRequest | null {
  return null
}

function getOwnerActiveSnapshot(): boolean {
  return ownerSnapshot !== null
}

function getServerOwnerActiveSnapshot(): boolean {
  return false
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publishOwnerChange(): void {
  const nextOwner = [...requests.values()].sort(
    (left, right) => right.priority - left.priority || right.order - left.order
  )[0]

  if (
    ownerSnapshot?.token === nextOwner?.token &&
    ownerSnapshot?.groupId === nextOwner?.groupId &&
    ownerSnapshot?.priority === nextOwner?.priority
  ) {
    return
  }

  ownerSnapshot = nextOwner ?? null
  listeners.forEach((listener) => listener())
}

export function createPresentationOwnerToken(): PresentationOwnerToken {
  return Symbol('presentation-owner')
}

/**
 * Register one mounted presentation group. Cleanup is deferred by a microtask
 * so React StrictMode's setup/cleanup replay cannot briefly release live media.
 */
export function acquirePresentationOwnership(
  token: PresentationOwnerToken,
  groupId: string,
  priority: number
): () => void {
  for (const [pendingToken] of pendingReleases) {
    if (pendingToken !== token) {
      requests.delete(pendingToken)
      pendingReleases.delete(pendingToken)
    }
  }

  const existing = requests.get(token)
  const version = ++nextVersion
  pendingReleases.delete(token)
  requests.set(token, {
    token,
    groupId,
    priority,
    order: existing?.order ?? ++nextOrder,
    version,
  })
  publishOwnerChange()

  let released = false
  return () => {
    if (released) return
    released = true
    pendingReleases.set(token, version)
    void Promise.resolve().then(() => {
      if (pendingReleases.get(token) !== version || requests.get(token)?.version !== version) {
        return
      }
      requests.delete(token)
      pendingReleases.delete(token)
      publishOwnerChange()
    })
  }
}

export function getPresentationOwner(): PresentationOwnerSnapshot | null {
  return ownerSnapshot
}

export function usePresentationOwner(
  groupId: string,
  priority: number,
  enabled = true
): { isOwner: boolean; isSuspended: boolean; hasOwner: boolean } {
  const token = useMemo(() => createPresentationOwnerToken(), [])
  const owner = useSyncExternalStore(subscribe, getOwnerSnapshot, getServerOwnerSnapshot)

  useLayoutEffect(() => {
    if (!enabled) return undefined
    return acquirePresentationOwnership(token, groupId, priority)
  }, [enabled, groupId, priority, token])

  return {
    isOwner: owner?.groupId === groupId,
    isSuspended: owner !== null && owner.groupId !== groupId,
    hasOwner: owner !== null,
  }
}

/** True while any foreground cinematic owns presentation resources. */
export function usePresentationOwned(): boolean {
  return useSyncExternalStore(subscribe, getOwnerActiveSnapshot, getServerOwnerActiveSnapshot)
}

function subscribeVisibility(listener: () => void): () => void {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

function getForegroundSnapshot(): boolean {
  return typeof document === 'undefined' || !document.hidden
}

/** Decorative timelines pause in the background; gameplay clocks keep their own policy. */
export function usePresentationForeground(): boolean {
  return useSyncExternalStore(subscribeVisibility, getForegroundSnapshot, () => true)
}
