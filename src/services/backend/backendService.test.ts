import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeCloudBackend } from './backendService'
import { authenticatedBackend } from './supabaseTransport'

const hooks = vi.hoisted(() => ({
  event: undefined as undefined | ((event: unknown, profileId?: string | null) => void),
  changed: undefined as undefined | (() => void),
  accountChanged: undefined as undefined | ((ownerId: string | null) => void),
}))
vi.mock('./config', () => ({
  getBackendConfig: () => ({ url: 'https://example.invalid', key: 'test' }),
}))
vi.mock('./supabaseTransport', () => ({
  authenticatedBackend: vi.fn().mockRejectedValue(new Error('offline')),
  subscribeBackendAuth: (_purpose: string, fn: typeof hooks.accountChanged) => {
    hooks.accountChanged = fn
    return () => {
      hooks.accountChanged = undefined
    }
  },
}))
vi.mock('./profileBackup', () => ({ serializeProfileBackup: (value: unknown) => value }))
vi.mock('./deviceContext', () => ({ readDeviceAnalyticsContext: async () => ({}) }))
vi.mock('../liveOps/productTelemetry', () => ({
  trackProductEvent: vi.fn(),
  subscribeProductEvents: (fn: typeof hooks.event) => {
    hooks.event = fn
    return () => {
      hooks.event = undefined
    }
  },
}))

describe('backend event buffering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(authenticatedBackend).mockReset().mockRejectedValue(new Error('offline'))
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })
  it('bounds an offline burst, batches storage writes, filters deleted profiles and flushes on exit', async () => {
    let profiles = { profiles: [{ id: 'profile-1' }], activeProfileId: 'profile-1', isGuest: false }
    const stop = initializeCloudBackend({
      getState: () => ({ profiles }),
      subscribe: (fn: () => void) => {
        hooks.changed = fn
        return vi.fn()
      },
    } as never)
    const writes = vi.spyOn(sessionStorage, 'setItem')
    for (let i = 0; i < 2200; i++)
      hooks.event?.(
        {
          name: 'session_active',
          occurredAt: new Date().toISOString(),
          sessionId: 'session',
          properties: { active_seconds: 1 },
        },
        'profile-1'
      )
    expect(
      writes.mock.calls.filter(([key]) => key === 'bbmobilenew:supabase-events:v1')
    ).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1200)
    expect(JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!)).toHaveLength(2000)
    expect(
      writes.mock.calls.filter(([key]) => key === 'bbmobilenew:supabase-events:v1')
    ).toHaveLength(1)
    vi.setSystemTime(Date.now() + 7 * 24 * 60 * 60 * 1000 + 1)
    hooks.event?.(
      {
        name: 'session_active',
        occurredAt: new Date().toISOString(),
        sessionId: 'session',
        properties: { active_seconds: 1 },
      },
      'profile-1'
    )
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!)).toHaveLength(1)
    profiles = { ...profiles, profiles: [] }
    hooks.changed?.()
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!)).toEqual([])
    stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(hooks.event).toBeUndefined()
  })

  it('preserves explicit guest attribution through profile conversion and persisted queue reloads', async () => {
    let profiles = {
      profiles: [] as { id: string }[],
      activeProfileId: null as string | null,
      isGuest: true,
    }
    const fakeStore = {
      getState: () => ({ profiles }),
      subscribe: (fn: () => void) => {
        hooks.changed = fn
        return vi.fn()
      },
    }
    let stop = initializeCloudBackend(fakeStore as never)
    profiles = { profiles: [{ id: 'new-profile' }], activeProfileId: 'new-profile', isGuest: false }
    hooks.changed?.()
    hooks.event?.(
      {
        name: 'screen_time',
        occurredAt: new Date().toISOString(),
        sessionId: 'session',
        properties: { screen_id: 'home', duration_seconds: 12 },
      },
      null
    )
    hooks.event?.({
      name: 'session_active',
      occurredAt: new Date().toISOString(),
      sessionId: 'session',
      properties: { active_seconds: 1 },
    })
    window.dispatchEvent(new Event('pagehide'))
    let events = JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!)
    expect(events.map((event: { profileId: string | null }) => event.profileId)).toEqual([
      null,
      'new-profile',
    ])
    stop()
    stop = initializeCloudBackend(fakeStore as never)
    window.dispatchEvent(new Event('pagehide'))
    events = JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!)
    expect(events[0].profileId).toBeNull()
    stop()
  })

  it('uploads guest activity without creating a profile backup identity', async () => {
    const upsert = vi.fn((_payload: unknown, _options?: unknown) => ({
      abortSignal: async () => ({ error: null }),
    }))
    vi.mocked(authenticatedBackend).mockResolvedValue({
      ownerId: 'analytics-guest',
      client: { from: () => ({ upsert }) },
    } as never)
    const stop = initializeCloudBackend({
      getState: () => ({ profiles: { profiles: [], activeProfileId: null, isGuest: true } }),
      subscribe: () => vi.fn(),
    } as never)
    hooks.event?.(
      {
        name: 'session_active',
        occurredAt: new Date().toISOString(),
        sessionId: 'guest-session',
        properties: { active_seconds: 1 },
      },
      null
    )
    await vi.advanceTimersByTimeAsync(1200)
    expect(authenticatedBackend).toHaveBeenCalledWith('analytics')
    expect(authenticatedBackend).not.toHaveBeenCalledWith('profile_backup')
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ owner_id: 'analytics-guest', profile_id: null }),
    ])
    stop()
  })

  it('keeps legacy database batches valid until the new event migration is enabled', () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    const event = {
      name: 'tribunal_action',
      occurredAt: new Date().toISOString(),
      sessionId: 'session',
      properties: { action_id: 'jury_vote_cast' },
    }
    sessionStorage.setItem(
      'bbmobilenew:supabase-events:v1',
      JSON.stringify([{ ...event, id: crypto.randomUUID(), profileId: null }])
    )
    const stop = initializeCloudBackend({
      getState: () => ({ profiles: { profiles: [], activeProfileId: null, isGuest: true } }),
      subscribe: () => vi.fn(),
    } as never)
    hooks.event?.(event, null)
    hooks.event?.({ ...event, name: 'session_active', properties: { active_seconds: 1 } }, null)
    window.dispatchEvent(new Event('pagehide'))
    expect(
      JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!).map(
        (row: { name: string }) => row.name
      )
    ).toEqual(['session_active'])
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
    hooks.event?.(event, null)
    window.dispatchEvent(new Event('pagehide'))
    expect(
      JSON.parse(sessionStorage.getItem('bbmobilenew:supabase-events:v1')!).map(
        (row: { name: string }) => row.name
      )
    ).toEqual(['session_active', 'tribunal_action'])
    stop()
  })

  it('resends unchanged local backups after explicit sign-in changes the owning account', async () => {
    const upsert = vi.fn((_payload: unknown, _options?: unknown) => ({
      abortSignal: async () => ({ error: null }),
    }))
    let ownerId = 'old-owner'
    vi.mocked(authenticatedBackend).mockImplementation(
      async () => ({ ownerId, client: { from: () => ({ upsert }) } }) as never
    )
    const profiles = {
      profiles: [{ id: 'keep-profile' }],
      activeProfileId: 'keep-profile',
      isGuest: false,
    }
    const stop = initializeCloudBackend({
      getState: () => ({ profiles }),
      subscribe: () => vi.fn(),
    } as never)
    await vi.advanceTimersByTimeAsync(1200)
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner_id: 'old-owner', profile_id: 'keep-profile' }),
      expect.anything()
    )
    ownerId = 'new-owner'
    hooks.accountChanged?.(ownerId)
    await vi.advanceTimersByTimeAsync(1200)
    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner_id: 'new-owner', profile_id: 'keep-profile' }),
      expect.anything()
    )
    expect(profiles.profiles).toEqual([{ id: 'keep-profile' }])
    const calls = upsert.mock.calls.length
    hooks.accountChanged?.(ownerId)
    await vi.advanceTimersByTimeAsync(1200)
    expect(upsert).toHaveBeenCalledTimes(calls)
    stop()
    expect(hooks.accountChanged).toBeUndefined()
  })
})
