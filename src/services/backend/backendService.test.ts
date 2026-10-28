import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeCloudBackend } from './backendService'

const hooks = vi.hoisted(() => ({
  event: undefined as undefined | ((event: unknown, profileId?: string) => void),
  changed: undefined as undefined | (() => void),
}))
vi.mock('./config', () => ({
  getBackendConfig: () => ({ url: 'https://example.invalid', key: 'test' }),
}))
vi.mock('./supabaseTransport', () => ({
  authenticatedBackend: vi.fn().mockRejectedValue(new Error('offline')),
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
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
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
})
