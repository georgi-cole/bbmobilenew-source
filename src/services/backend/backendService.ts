import type { store as appStore } from '../../store/store'
import { Capacitor } from '@capacitor/core'
import { canUseOptionalFeature, subscribePlayerSafety } from '../../safety/playerSafety'
import {
  subscribeProductEvents,
  trackProductEvent,
  type ProductEvent,
} from '../liveOps/productTelemetry'
import { getBackendConfig } from './config'
import { authenticatedBackend } from './supabaseTransport'
import { serializeProfileBackup } from './profileBackup'
import { sanitizeAnalyticsEvent } from './analyticsSchema'

const PREFERENCES_KEY = 'bbmobilenew:cloud-profiles:v1'
const EVENTS_KEY = 'bbmobilenew:cloud-events:v1'
const MAX_EVENTS = 200
const MAX_EVENT_AGE = 24 * 60 * 60 * 1000
type Preferences = { enabled: string[]; deleted: string[]; known: string[] }
type QueuedEvent = ProductEvent & { id: string }
type BackupStatus = 'disabled' | 'pending' | 'syncing' | 'synced' | 'error'
let status: BackupStatus = 'disabled'
let lastSynced: string | null = null
const listeners = new Set<() => void>()
let wake: (() => void) | undefined

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')
    return {
      enabled: Array.isArray(value.enabled)
        ? value.enabled.filter((id: unknown) => typeof id === 'string')
        : [],
      deleted: Array.isArray(value.deleted)
        ? value.deleted.filter((id: unknown) => typeof id === 'string')
        : [],
      known: Array.isArray(value.known ?? value.enabled)
        ? (value.known ?? value.enabled).filter((id: unknown) => typeof id === 'string')
        : [],
    }
  } catch {
    return { enabled: [], deleted: [], known: [] }
  }
}

function savePreferences(value: Preferences) {
  // Fail visibly if the opt-in or deletion retry cannot be persisted.
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value))
  listeners.forEach((listener) => listener())
  wake?.()
}

export const subscribeCloudBackend = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getBackupStatus = () => status
export const getLastBackupTime = () => lastSynced
export const isProfileBackupEnabled = (id: string) => readPreferences().enabled.includes(id)

export function setProfileBackupEnabled(id: string, enabled: boolean): void {
  if (enabled && (!getBackendConfig() || !canUseOptionalFeature('onlineServices')))
    throw new Error('Enable online services before using cloud backup.')
  const preferences = readPreferences()
  if (enabled && preferences.deleted.includes(id))
    throw new Error('The previous cloud copy is still being removed. Try again after it finishes.')
  preferences.enabled = preferences.enabled.filter((entry) => entry !== id)
  if (enabled) {
    preferences.enabled.push(id)
    if (!preferences.known.includes(id)) preferences.known.push(id)
  }
  savePreferences(preferences)
}

/** Durable tombstones prevent a failed deletion from recreating the remote copy on retry. */
export function removeCloudProfile(id: string): void {
  const preferences = readPreferences()
  preferences.enabled = preferences.enabled.filter((entry) => entry !== id)
  if (!preferences.deleted.includes(id)) preferences.deleted.push(id)
  savePreferences(preferences)
}

export const hasPendingCloudDeletion = (id: string) => readPreferences().deleted.includes(id)

function readEvents(): QueuedEvent[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(EVENTS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value
      .filter(
        (event): event is QueuedEvent =>
          event &&
          typeof event.id === 'string' &&
          typeof event.sessionId === 'string' &&
          typeof event.occurredAt === 'string' &&
          Date.parse(event.occurredAt) > Date.now() - MAX_EVENT_AGE &&
          event.properties &&
          typeof event.properties === 'object' &&
          typeof event.name === 'string' &&
          Object.keys(event.properties).length <= 10
      )
      .map((event) => {
        const safe = sanitizeAnalyticsEvent(event)
        return safe ? { ...safe, id: event.id } : null
      })
      .filter((event): event is QueuedEvent => event !== null)
      .slice(-MAX_EVENTS)
  } catch {
    return []
  }
}

function writeEvents(events: QueuedEvent[]) {
  try {
    sessionStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
  } catch {
    /* Measurement never blocks play, including when storage is full. */
  }
}

/** Installed once after durable local saves hydrate. Returns cleanup for tests/HMR. */
export function initializeCloudBackend(store: typeof appStore): () => void {
  if (!getBackendConfig()) return () => undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let busy = false
  let rerun = false
  let stopped = false
  let controller = new AbortController()
  let activeId = store.getState().profiles.activeProfileId
  let previousProfiles = store.getState().profiles
  const uploaded = new Map<string, string>()
  let measuredSession = false
  let activeSince = Date.now()

  const currentProfile = () => {
    const profiles = store.getState().profiles
    return profiles.isGuest
      ? undefined
      : profiles.profiles.find((p) => p.id === profiles.activeProfileId)
  }
  const analyticsAllowed = () => Boolean(currentProfile() && canUseOptionalFeature('analytics'))
  function setStatus(next: BackupStatus) {
    status = next
    listeners.forEach((listener) => listener())
  }
  function schedule() {
    if (stopped) return
    rerun = true
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined
        void flush()
      }, 1500)
  }
  async function flush() {
    if (busy || stopped) return
    busy = true
    rerun = false
    const signal = controller.signal
    try {
      try {
        if (canUseOptionalFeature('onlineServices')) {
          const preferences = readPreferences()
          const profile = currentProfile()
          const shouldUpload = profile && preferences.enabled.includes(profile.id)
          const snapshot = shouldUpload ? serializeProfileBackup(profile) : undefined
          const encoded = snapshot ? JSON.stringify(snapshot) : undefined
          if (
            preferences.deleted.length ||
            (profile && encoded && uploaded.get(profile.id) !== encoded)
          ) {
            if (shouldUpload) setStatus('syncing')
            const { client, ownerId } = await authenticatedBackend('onlineServices')
            if (signal.aborted || stopped) return
            for (const id of preferences.deleted) {
              const { error } = await client
                .from('player_profiles')
                .delete()
                .eq('owner_id', ownerId)
                .eq('profile_id', id)
                .abortSignal(signal)
              if (error) throw error
              const latest = readPreferences()
              latest.deleted = latest.deleted.filter((entry) => entry !== id)
              latest.known = latest.known.filter((entry) => entry !== id)
              localStorage.setItem(PREFERENCES_KEY, JSON.stringify(latest))
              listeners.forEach((listener) => listener())
              uploaded.delete(id)
            }
            if (
              profile &&
              encoded &&
              isProfileBackupEnabled(profile.id) &&
              !hasPendingCloudDeletion(profile.id)
            ) {
              const { error } = await client
                .from('player_profiles')
                .upsert(
                  {
                    owner_id: ownerId,
                    profile_id: profile.id,
                    snapshot,
                  },
                  { onConflict: 'owner_id,profile_id' }
                )
                .abortSignal(signal)
              if (error) throw error
              if (signal.aborted || stopped) return
              uploaded.set(profile.id, encoded)
              lastSynced = new Date().toISOString()
              setStatus('synced')
            }
          }
        }
      } catch {
        if (!signal.aborted && currentProfile() && isProfileBackupEnabled(currentProfile()!.id))
          setStatus('error')
      }
      if (analyticsAllowed()) {
        const batch = readEvents().slice(0, 50)
        if (batch.length) {
          const { client, ownerId } = await authenticatedBackend('analytics')
          if (signal.aborted || stopped || !analyticsAllowed()) return
          const { error } = await client
            .from('player_events')
            .upsert(
              batch.map((event) => ({
                owner_id: ownerId,
                event_id: event.id,
                name: event.name,
                occurred_at: event.occurredAt,
                session_id: event.sessionId,
                properties: event.properties,
              })),
              { onConflict: 'owner_id,event_id', ignoreDuplicates: true }
            )
            .abortSignal(signal)
          if (error) throw error
          const sent = new Set(batch.map((event) => event.id))
          writeEvents(readEvents().filter((event) => !sent.has(event.id)))
          if (readEvents().length) schedule()
        }
      }
    } catch {
      // Keep bounded events for retry; an analytics error never changes backup status.
    } finally {
      busy = false
      if (rerun) schedule()
    }
  }
  function contextChanged() {
    const profiles = store.getState().profiles
    // Also repairs deletions made while offline or before this service initialized.
    const preferences = readPreferences()
    const removed = preferences.known.filter(
      (id) =>
        !preferences.deleted.includes(id) && !profiles.profiles.some((profile) => profile.id === id)
    )
    if (removed.length) {
      preferences.enabled = preferences.enabled.filter((id) => !removed.includes(id))
      preferences.deleted = [...new Set([...preferences.deleted, ...removed])]
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
      } catch {
        setStatus('error')
      }
    }
    if (profiles.activeProfileId !== activeId || profiles.isGuest !== previousProfiles.isGuest) {
      activeId = profiles.activeProfileId
      lastSynced = null
      controller.abort()
      controller = new AbortController()
      // Never send one household player's buffered events during another player's session.
      writeEvents([])
      measuredSession = false
    }
    previousProfiles = profiles
    const profile = currentProfile()
    if (!analyticsAllowed()) {
      writeEvents([])
      measuredSession = false
    } else if (!measuredSession) {
      measuredSession = true
      activeSince = Date.now()
      trackProductEvent('session_started', {
        platform: Capacitor.getPlatform(),
        app_version: import.meta.env.VITE_APP_VERSION ?? 'unknown',
      })
    }
    if (!profile || !canUseOptionalFeature('onlineServices') || !isProfileBackupEnabled(profile.id))
      setStatus('disabled')
    else if (
      status !== 'synced' ||
      uploaded.get(profile.id) !== JSON.stringify(serializeProfileBackup(profile))
    )
      setStatus('pending')
    schedule()
  }
  const unsubscribeEvents = subscribeProductEvents((event) => {
    if (!analyticsAllowed()) return
    const safe = sanitizeAnalyticsEvent(event)
    if (!safe) return
    writeEvents([...readEvents(), { ...safe, id: crypto.randomUUID() }])
    schedule()
  })
  const unsubscribeStore = store.subscribe(() => {
    if (store.getState().profiles !== previousProfiles) contextChanged()
  })
  const unsubscribeSafety = subscribePlayerSafety(() => {
    controller.abort()
    controller = new AbortController()
    contextChanged()
  })
  const onStorage = (event: StorageEvent) => {
    if (event.key === PREFERENCES_KEY || event.key === null) {
      controller.abort()
      controller = new AbortController()
      contextChanged()
    }
  }
  const onVisibility = () => {
    if (analyticsAllowed() && document.visibilityState === 'hidden') {
      trackProductEvent('session_active', {
        active_seconds: Math.min(60, Math.max(0, Math.round((Date.now() - activeSince) / 1000))),
      })
    }
    activeSince = Date.now()
    schedule()
  }
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible' && analyticsAllowed()) {
      trackProductEvent('session_active', {
        active_seconds: Math.min(60, Math.max(0, Math.round((Date.now() - activeSince) / 1000))),
      })
      activeSince = Date.now()
    }
    schedule()
  }, 60000)
  wake = () => {
    controller.abort()
    controller = new AbortController()
    contextChanged()
  }
  window.addEventListener('online', schedule)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisibility)
  contextChanged()
  return () => {
    stopped = true
    wake = undefined
    controller.abort()
    clearTimeout(timer)
    clearInterval(interval)
    unsubscribeEvents()
    unsubscribeStore()
    unsubscribeSafety()
    window.removeEventListener('online', schedule)
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
