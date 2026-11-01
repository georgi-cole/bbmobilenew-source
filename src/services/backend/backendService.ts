import type { store as appStore } from '../../store/store'
import {
  subscribeProductEvents,
  trackProductEvent,
  type ProductEvent,
} from '../liveOps/productTelemetry'
import { getBackendConfig } from './config'
import { resolveAppEnvironment } from './appEnvironment'
import { sanitizeAnalyticsEvent } from './analyticsSchema'
import { readDeviceAnalyticsContext } from './deviceContext'
import { serializeProfileBackup } from './profileBackup'
import { authenticatedBackend, subscribeBackendAuth } from './supabaseTransport'

const PREFERENCES_KEY = 'bbmobilenew:supabase-profiles:v1'
const EVENTS_KEY = 'bbmobilenew:supabase-events:v1'
const MAX_EVENTS = 2000
const MAX_EVENT_AGE = 7 * 24 * 60 * 60 * 1000
const APP_ENVIRONMENT = resolveAppEnvironment(
  import.meta.env.VITE_APP_ENVIRONMENT,
  import.meta.env.DEV,
  import.meta.env.VITE_BUILD_TARGET
)
type Preferences = { deletedProfiles: string[]; knownProfiles: string[] }
type QueuedEvent = ProductEvent & { id: string; profileId?: string | null }
export type BackupStatus = 'disabled' | 'pending' | 'syncing' | 'synced' | 'error'
let status: BackupStatus = 'disabled'
let lastSynced: string | null = null
const listeners = new Set<() => void>()

function eventIsDeployed(name: string): boolean {
  // The new event name needs the same migration as player accounts. Keep old
  // analytics batches valid until that deployment is explicitly enabled.
  return name !== 'tribunal_action' || import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED === 'true'
}

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')
    return {
      deletedProfiles: Array.isArray(value.deletedProfiles)
        ? value.deletedProfiles.filter((id: unknown) => typeof id === 'string')
        : [],
      knownProfiles: Array.isArray(value.knownProfiles)
        ? value.knownProfiles.filter((id: unknown) => typeof id === 'string')
        : [],
    }
  } catch {
    return { deletedProfiles: [], knownProfiles: [] }
  }
}

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeCloudBackend(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getBackupStatus = () => status
export const getLastBackupTime = () => lastSynced

function loadEvents(): QueuedEvent[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(EVENTS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value
      .filter((event): event is QueuedEvent =>
        Boolean(
          event &&
          typeof event.id === 'string' &&
          typeof event.sessionId === 'string' &&
          typeof event.occurredAt === 'string' &&
          Date.parse(event.occurredAt) > Date.now() - MAX_EVENT_AGE &&
          event.properties &&
          typeof event.properties === 'object' &&
          typeof event.name === 'string' &&
          eventIsDeployed(event.name) &&
          (event.profileId === undefined ||
            event.profileId === null ||
            (typeof event.profileId === 'string' && event.profileId.length <= 120))
        )
      )
      .map((event): QueuedEvent | null => {
        const safe = sanitizeAnalyticsEvent(event)
        if (!safe) return null
        const queued: QueuedEvent = { ...safe, id: event.id }
        if (event.profileId === null || typeof event.profileId === 'string')
          queued.profileId = event.profileId
        return queued
      })
      .filter((event): event is QueuedEvent => event !== null)
      .slice(-MAX_EVENTS)
  } catch {
    return []
  }
}

/** Configured builds sync local profile backups and bounded pseudonymous gameplay events. */
export function initializeCloudBackend(store: typeof appStore): () => void {
  if (!getBackendConfig()) return () => undefined
  let events = loadEvents()
  const earliestExpiry = () =>
    events.reduce(
      (expiry, event) => Math.min(expiry, Date.parse(event.occurredAt) + MAX_EVENT_AGE),
      Infinity
    )
  let expiresAt = earliestExpiry()
  let eventsDirty = false
  let eventsTimer: ReturnType<typeof setTimeout> | undefined
  const persistEvents = () => {
    clearTimeout(eventsTimer)
    eventsTimer = undefined
    if (!eventsDirty) return
    try {
      sessionStorage.setItem(EVENTS_KEY, JSON.stringify(events))
      eventsDirty = false
    } catch {
      /* Analytics is best effort. */
    }
  }
  const readEvents = () => {
    if (Date.now() >= expiresAt) {
      events = events.filter((event) => Date.parse(event.occurredAt) > Date.now() - MAX_EVENT_AGE)
      expiresAt = earliestExpiry()
      eventsDirty = true
    }
    return events
  }
  const writeEvents = (next: QueuedEvent[]) => {
    events = next.slice(-MAX_EVENTS)
    eventsDirty = true
    expiresAt = events.length
      ? Math.min(expiresAt, Date.parse(events[events.length - 1].occurredAt) + MAX_EVENT_AGE)
      : Infinity
    // Bound persistence work per burst, not per accepted event. The queue is
    // immediately available to uploads/deletion and drained on lifecycle exit.
    if (!eventsTimer) eventsTimer = setTimeout(persistEvents, 1200)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let busy = false
  let stopped = false
  let controller = new AbortController()
  let previousProfiles = store.getState().profiles
  let activeId = previousProfiles.activeProfileId
  let measuredSession = false
  let activeSince = Date.now()
  const uploaded = new Map<string, string>()
  let backupOwnerId: string | null | undefined
  let resyncAfterFlush = false

  const currentProfile = () => {
    const state = store.getState().profiles
    return state.isGuest
      ? undefined
      : state.profiles.find((profile) => profile.id === state.activeProfileId)
  }
  const currentSubjectId = () => currentProfile()?.id ?? null
  const analyticsAllowed = () => !stopped
  function setStatus(next: BackupStatus) {
    status = next
    notify()
  }
  function schedule() {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, 1200)
  }
  async function flush() {
    if (stopped || busy) return
    busy = true
    const signal = controller.signal
    try {
      const state = store.getState().profiles
      const preferences = readPreferences()
      const pendingUploads = state.isGuest
        ? []
        : state.profiles.filter(
            (profile) =>
              !preferences.deletedProfiles.includes(profile.id) &&
              uploaded.get(profile.id) !== JSON.stringify(serializeProfileBackup(profile))
          )

      if (preferences.deletedProfiles.length || pendingUploads.length) {
        if (pendingUploads.some((profile) => profile.id === state.activeProfileId))
          setStatus('syncing')
        const { client, ownerId } = await authenticatedBackend('profile_backup')
        if (signal.aborted || stopped) return
        backupOwnerId = ownerId
        const { client: analyticsClient, ownerId: analyticsOwnerId } =
          await authenticatedBackend('analytics')
        if (signal.aborted || stopped) return
        for (const id of preferences.deletedProfiles) {
          const { error: analyticsDeleteError } = await analyticsClient
            .from('player_events')
            .delete()
            .eq('owner_id', analyticsOwnerId)
            .eq('profile_id', id)
            .abortSignal(signal)
          if (analyticsDeleteError) throw analyticsDeleteError
          const { error } = await client
            .from('player_profiles')
            .delete()
            .eq('owner_id', ownerId)
            .eq('profile_id', id)
            .abortSignal(signal)
          if (error) throw error
          const latest = readPreferences()
          latest.deletedProfiles = latest.deletedProfiles.filter((entry) => entry !== id)
          latest.knownProfiles = latest.knownProfiles.filter((entry) => entry !== id)
          localStorage.setItem(PREFERENCES_KEY, JSON.stringify(latest))
          uploaded.delete(id)
        }
        for (const profile of pendingUploads) {
          const snapshot = serializeProfileBackup(profile)
          const { error } = await client
            .from('player_profiles')
            .upsert(
              { owner_id: ownerId, profile_id: profile.id, snapshot },
              { onConflict: 'owner_id,profile_id' }
            )
            .abortSignal(signal)
          if (error) throw error
          if (signal.aborted || stopped) return
          uploaded.set(profile.id, JSON.stringify(snapshot))
          if (profile.id === store.getState().profiles.activeProfileId) {
            lastSynced = new Date().toISOString()
            setStatus('synced')
          }
        }
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
                profile_id: event.profileId ?? null,
                name: event.name,
                occurred_at: event.occurredAt,
                session_id: event.sessionId,
                properties: {
                  ...event.properties,
                  app_environment: APP_ENVIRONMENT,
                },
              })),
              { onConflict: 'owner_id,event_id', ignoreDuplicates: true }
            )
            .abortSignal(signal)
          if (error) throw error
          const sent = new Set(batch.map((event) => event.id))
          writeEvents(readEvents().filter((event) => !sent.has(event.id)))
          persistEvents()
          if (readEvents().length) schedule()
        }
      }
    } catch {
      if (!signal.aborted && !stopped) setStatus('error')
    } finally {
      busy = false
      if (resyncAfterFlush) {
        resyncAfterFlush = false
        schedule()
      }
    }
  }

  function contextChanged() {
    const profiles = store.getState().profiles
    const preferences = readPreferences()
    const removed = preferences.knownProfiles.filter(
      (id) =>
        !preferences.deletedProfiles.includes(id) &&
        !profiles.profiles.some((entry) => entry.id === id)
    )
    const added = profiles.profiles
      .map((entry) => entry.id)
      .filter((id) => !preferences.knownProfiles.includes(id))
    if (removed.length || added.length) {
      preferences.deletedProfiles = [...new Set([...preferences.deletedProfiles, ...removed])]
      preferences.knownProfiles = [...new Set([...preferences.knownProfiles, ...added])]
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
      } catch {
        setStatus('error')
      }
    }
    writeEvents(
      readEvents().filter(
        (event) => !event.profileId || !preferences.deletedProfiles.includes(event.profileId)
      )
    )
    if (profiles.activeProfileId !== activeId || profiles.isGuest !== previousProfiles.isGuest) {
      activeId = profiles.activeProfileId
      controller.abort()
      controller = new AbortController()
      measuredSession = false
      lastSynced = null
    }
    previousProfiles = profiles
    const profile = currentProfile()
    if (!measuredSession) {
      measuredSession = true
      activeSince = Date.now()
      const sessionProfileId = currentSubjectId()
      void readDeviceAnalyticsContext().then((deviceContext) => {
        if (stopped || !analyticsAllowed() || currentSubjectId() !== sessionProfileId) return
        trackProductEvent(
          'session_started',
          {
            platform: 'web',
            app_version: import.meta.env.VITE_APP_VERSION ?? 'unknown',
            ...deviceContext,
          },
          sessionProfileId
        )
      })
    }
    if (!profile) setStatus('disabled')
    else if (
      status !== 'synced' ||
      uploaded.get(profile.id) !== JSON.stringify(serializeProfileBackup(profile))
    )
      setStatus('pending')
    schedule()
  }

  const unsubscribeEvents = subscribeProductEvents((event, profileId) => {
    if (!analyticsAllowed()) return
    if (!eventIsDeployed(event.name)) return
    const safe = sanitizeAnalyticsEvent(event)
    if (!safe) return
    writeEvents([
      ...readEvents(),
      {
        ...safe,
        id: crypto.randomUUID(),
        // Explicit null is a guest event, even if a profile was selected while
        // the originating screen or game action was finishing.
        profileId: profileId === undefined ? currentSubjectId() : profileId,
      },
    ])
    schedule()
  })
  const unsubscribeStore = store.subscribe(() => {
    if (store.getState().profiles !== previousProfiles) contextChanged()
  })
  const unsubscribeAccount = subscribeBackendAuth('profile_backup', (ownerId) => {
    if (backupOwnerId === ownerId) return
    const hadOwner = backupOwnerId !== undefined
    backupOwnerId = ownerId
    if (!hadOwner) return
    // Signing into an existing account is explicit in the account UI. Local
    // profiles survive; their backup cache must not claim the new owner has them.
    uploaded.clear()
    lastSynced = null
    controller.abort()
    controller = new AbortController()
    setStatus(currentProfile() ? 'pending' : 'disabled')
    if (busy) resyncAfterFlush = true
    schedule()
  })
  const onStorage = (event: StorageEvent) => {
    if (event.key === PREFERENCES_KEY || event.key === null) {
      controller.abort()
      controller = new AbortController()
      contextChanged()
    }
  }
  const onVisibility = () => {
    if (analyticsAllowed() && document.visibilityState === 'hidden')
      trackProductEvent(
        'session_active',
        {
          active_seconds: Math.min(60, Math.max(0, Math.round((Date.now() - activeSince) / 1000))),
        },
        currentSubjectId()
      )
    activeSince = Date.now()
    if (document.visibilityState === 'hidden') persistEvents()
    schedule()
  }
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible' && analyticsAllowed()) {
      trackProductEvent('session_active', { active_seconds: 60 }, currentSubjectId())
      activeSince = Date.now()
    }
    schedule()
  }, 60_000)
  window.addEventListener('online', schedule)
  window.addEventListener('pagehide', persistEvents)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisibility)
  contextChanged()

  return () => {
    persistEvents()
    stopped = true
    controller.abort()
    clearTimeout(timer)
    clearInterval(interval)
    unsubscribeEvents()
    unsubscribeStore()
    unsubscribeAccount()
    window.removeEventListener('online', schedule)
    window.removeEventListener('pagehide', persistEvents)
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
