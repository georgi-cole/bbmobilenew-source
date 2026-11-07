import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { store as appStore } from '../../store/store'
import type { StoredProfile } from '../../store/profilesSlice'
import { installSafetyFixture } from '../../safety/__tests__/safetyFixture'
import { setOptionalPlayerFeature } from '../../safety/playerSafety'
import { trackProductEvent } from '../liveOps/productTelemetry'
import {
  getBackupStatus,
  hasPendingCloudDeletion,
  initializeCloudBackend,
  isProfileBackupEnabled,
  removeCloudProfile,
  setProfileBackupEnabled,
} from './backendService'
import { getBackendConfig } from './config'
import { serializeProfileBackup } from './profileBackup'
import { sanitizeAnalyticsEvent } from './analyticsSchema'

const backend = vi.hoisted(() => ({
  authenticate: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  abort: vi.fn(),
}))
vi.mock('./supabaseTransport', () => ({ authenticatedBackend: backend.authenticate }))

const profile: StoredProfile = {
  id: 'profile-1',
  name: 'Player',
  avatar: '🙂',
  createdAt: '2026-10-27T00:00:00Z',
  eyeoleans: 42,
  achievements: ['oracle'],
  photoId: 'private-photo',
  bio: { story: 'Private text', religion: 'private', age: '28', location: 'private' },
}

function fakeStore() {
  let state = {
    profiles: { profiles: [profile], activeProfileId: profile.id as string | null, isGuest: false },
  }
  const listeners = new Set<() => void>()
  return {
    store: {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    } as unknown as typeof appStore,
    change(profiles: typeof state.profiles) {
      state = { profiles }
      listeners.forEach((listener) => listener())
    },
  }
}

describe('Supabase preparation', () => {
  let cleanup: (() => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    installSafetyFixture(28, ['onlineServices', 'analytics'])
    sessionStorage.clear()
    vi.stubEnv('VITE_SUPABASE_ENABLED', 'true')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    backend.abort.mockResolvedValue({ error: null })
    backend.upsert.mockReturnValue({ abortSignal: backend.abort })
    backend.remove.mockReturnValue({ eq: () => ({ eq: () => ({ abortSignal: backend.abort }) }) })
    backend.authenticate.mockResolvedValue({
      ownerId: 'owner',
      client: { from: () => ({ upsert: backend.upsert, delete: backend.remove }) },
    })
  })
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })
  async function flush() {
    await vi.advanceTimersByTimeAsync(1600)
  }

  it('is inert without configuration, even with adult permission', async () => {
    vi.stubEnv('VITE_SUPABASE_ENABLED', 'false')
    cleanup = initializeCloudBackend(fakeStore().store)
    trackProductEvent('screen_view', { route: '#/game' })
    await flush()
    expect(backend.authenticate).not.toHaveBeenCalled()
  })

  it('rejects privileged keys and insecure URLs', () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_private')
    expect(getBackendConfig()).toBeNull()
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    vi.stubEnv('VITE_SUPABASE_URL', 'http://project.supabase.co')
    expect(getBackendConfig()).toBeNull()
  })

  it('backs up only after a separate profile opt-in and excludes biography/photo data', async () => {
    setOptionalPlayerFeature('analytics', false)
    cleanup = initializeCloudBackend(fakeStore().store)
    await flush()
    expect(backend.upsert).not.toHaveBeenCalled()
    setProfileBackupEnabled(profile.id, true)
    await flush()
    expect(backend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'owner',
        profile_id: profile.id,
        snapshot: serializeProfileBackup(profile),
      }),
      expect.any(Object)
    )
    const encoded = JSON.stringify(backend.upsert.mock.calls[0][0])
    expect(encoded).not.toContain('private')
    expect(encoded).not.toContain('bio')
    expect(getBackupStatus()).toBe('synced')
    await vi.advanceTimersByTimeAsync(62000)
    expect(backend.upsert).toHaveBeenCalledOnce()
  })

  it.each([undefined, 15, 17])('sends nothing for a player age %s', async (age) => {
    installSafetyFixture(age)
    localStorage.setItem(
      'bbmobilenew:cloud-profiles:v1',
      JSON.stringify({ enabled: [profile.id], deleted: [] })
    )
    cleanup = initializeCloudBackend(fakeStore().store)
    trackProductEvent('social_action', { action_id: 'chat' })
    await flush()
    expect(backend.authenticate).not.toHaveBeenCalled()
  })

  it('allows analytics independently from cloud backup and LiveOps sampling', async () => {
    setOptionalPlayerFeature('onlineServices', false)
    cleanup = initializeCloudBackend(fakeStore().store)
    trackProductEvent('social_action', {
      action_id: 'chat',
      message: 'secret message',
      name: 'Player',
    })
    await flush()
    expect(backend.authenticate).toHaveBeenCalledWith('analytics')
    const events = backend.upsert.mock.calls[0][0]
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'social_action', properties: { action_id: 'chat' } }),
      ])
    )
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(JSON.stringify(events)).not.toContain('Player')
  })

  it('drops queued events when analytics is withdrawn or the player becomes a guest', async () => {
    const app = fakeStore()
    cleanup = initializeCloudBackend(app.store)
    trackProductEvent('screen_view', { route: '#/game' })
    setOptionalPlayerFeature('analytics', false)
    await flush()
    expect(backend.upsert).not.toHaveBeenCalled()
    setOptionalPlayerFeature('analytics', true)
    app.change({ profiles: [profile], activeProfileId: null, isGuest: true })
    await flush()
    expect(backend.upsert).not.toHaveBeenCalled()
    expect(JSON.parse(sessionStorage.getItem('bbmobilenew:cloud-events:v1')!)).toEqual([])
  })

  it('retries failed delivery with the same event IDs', async () => {
    backend.abort.mockResolvedValueOnce({ error: new Error('offline') })
    cleanup = initializeCloudBackend(fakeStore().store)
    await flush()
    const first = backend.upsert.mock.calls[0][0][0]
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(backend.upsert.mock.calls[1][0][0].event_id).toBe(first.event_id)
    expect(JSON.parse(sessionStorage.getItem('bbmobilenew:cloud-events:v1')!)).toEqual([])
  })

  it('queues cloud deletion durably and retries without recreating the profile', async () => {
    setOptionalPlayerFeature('analytics', false)
    setProfileBackupEnabled(profile.id, true)
    cleanup = initializeCloudBackend(fakeStore().store)
    await flush()
    backend.abort.mockResolvedValueOnce({ error: new Error('offline') })
    removeCloudProfile(profile.id)
    expect(isProfileBackupEnabled(profile.id)).toBe(false)
    await flush()
    expect(hasPendingCloudDeletion(profile.id)).toBe(true)
    window.dispatchEvent(new Event('online'))
    await flush()
    expect(hasPendingCloudDeletion(profile.id)).toBe(false)
    expect(backend.remove).toHaveBeenCalledTimes(2)
    expect(backend.upsert).toHaveBeenCalledOnce()
  })

  it('removes a backed-up profile deleted locally, including after a restart', async () => {
    setOptionalPlayerFeature('analytics', false)
    setProfileBackupEnabled(profile.id, true)
    const app = fakeStore()
    app.change({ profiles: [], activeProfileId: null, isGuest: false })
    cleanup = initializeCloudBackend(app.store)
    await flush()
    expect(backend.remove).toHaveBeenCalledOnce()
    expect(backend.upsert).not.toHaveBeenCalled()
  })

  it('still removes the cloud copy if backup was disabled before deleting locally', async () => {
    setOptionalPlayerFeature('analytics', false)
    setProfileBackupEnabled(profile.id, true)
    setProfileBackupEnabled(profile.id, false)
    const app = fakeStore()
    app.change({ profiles: [], activeProfileId: null, isGuest: false })
    cleanup = initializeCloudBackend(app.store)
    await flush()
    expect(backend.remove).toHaveBeenCalledOnce()
    expect(backend.upsert).not.toHaveBeenCalled()
  })

  it('continues analytics collection if the backup request fails', async () => {
    setProfileBackupEnabled(profile.id, true)
    backend.abort.mockResolvedValueOnce({ error: new Error('backup unavailable') })
    cleanup = initializeCloudBackend(fakeStore().store)
    await flush()
    expect(backend.authenticate).toHaveBeenCalledWith('onlineServices')
    expect(backend.authenticate).toHaveBeenCalledWith('analytics')
    expect(backend.upsert).toHaveBeenCalledTimes(2)
    expect(getBackupStatus()).toBe('error')
  })

  it('does not upload a stale profile after a switch during sign-in', async () => {
    setOptionalPlayerFeature('analytics', false)
    setProfileBackupEnabled(profile.id, true)
    let resolve!: (value: unknown) => void
    backend.authenticate.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const app = fakeStore()
    cleanup = initializeCloudBackend(app.store)
    await flush()
    app.change({ profiles: [profile], activeProfileId: null, isGuest: true })
    resolve({ ownerId: 'owner', client: { from: () => ({ upsert: backend.upsert }) } })
    await flush()
    expect(backend.upsert).not.toHaveBeenCalled()
  })

  it('normalizes routes and drops unknown events and arbitrary payloads', () => {
    const event = {
      name: 'screen_view',
      sessionId: 'session',
      occurredAt: new Date().toISOString(),
      properties: { route: '#/profile/private-name?email=secret', message: 'private' },
    }
    expect(sanitizeAnalyticsEvent(event)?.properties).toEqual({ route: '/other' })
    expect(sanitizeAnalyticsEvent({ ...event, name: 'arbitrary_event' })).toBeNull()
  })
})
