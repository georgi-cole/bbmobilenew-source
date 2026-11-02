import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendPurpose } from './supabaseTransport'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('./config', () => ({
  getBackendConfig: () => ({ url: 'https://example.supabase.co', key: 'sb_publishable_test' }),
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type TestSession = { user: { id: string; is_anonymous: boolean } }
const sessions: Record<BackendPurpose, TestSession | null> = {
  profile_backup: null,
  analytics: null,
  audience_admin: null,
}

function fakeClient(purpose: BackendPurpose) {
  return {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(async () => ({ data: { session: sessions[purpose] }, error: null })),
      signInAnonymously: vi.fn(async () => {
        const session = { user: { id: `anonymous-${purpose}`, is_anonymous: true } }
        sessions[purpose] = session
        return { data: { session, user: session.user }, error: null }
      }),
      verifyOtp: vi.fn(async () => {
        const session = { user: { id: 'verified-account', is_anonymous: false } }
        sessions[purpose] = session
        return { data: { session, user: session.user }, error: null }
      }),
      signInWithPassword: vi.fn(async () => {
        const session = { user: { id: 'audience-administrator', is_anonymous: false } }
        sessions[purpose] = session
        return { data: { session, user: session.user }, error: null }
      }),
      signOut: vi.fn(async () => {
        sessions[purpose] = null
        return { error: null }
      }),
    },
  }
}

let profileClient: ReturnType<typeof fakeClient>
let analyticsClient: ReturnType<typeof fakeClient>
let adminClient: ReturnType<typeof fakeClient>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('navigator', { locks: undefined })
  sessions.profile_backup = null
  sessions.analytics = null
  sessions.audience_admin = null
  profileClient = fakeClient('profile_backup')
  analyticsClient = fakeClient('analytics')
  adminClient = fakeClient('audience_admin')
  mocks.createClient.mockImplementation((_url, _key, options: { auth: { storageKey: string } }) =>
    options.auth.storageKey.includes(':analytics:')
      ? analyticsClient
      : options.auth.storageKey.includes(':audience_admin:')
        ? adminClient
        : profileClient
  )
})

afterEach(() => vi.unstubAllGlobals())

function holdAnonymousSignIn() {
  const started = deferred<void>()
  const finish = deferred<void>()
  profileClient.auth.signInAnonymously.mockImplementation(async () => {
    started.resolve(undefined)
    await finish.promise
    const session = { user: { id: 'anonymous-profile_backup', is_anonymous: true } }
    sessions.profile_backup = session
    return { data: { session, user: session.user }, error: null }
  })
  return { started: started.promise, finish: () => finish.resolve(undefined) }
}

describe('backend Auth operation coordination', () => {
  it('keeps administrator credentials and sessions separate from anonymous player backups', async () => {
    const transport = await import('./supabaseTransport')
    await transport.authenticatedBackend('profile_backup')
    await transport.withBackendAuthLock('audience_admin', (client) =>
      client.auth.signInWithPassword({ email: 'admin@example.test', password: 'password' })
    )
    expect(sessions.profile_backup?.user.id).toBe('anonymous-profile_backup')
    expect(sessions.audience_admin?.user.id).toBe('audience-administrator')
    expect(profileClient.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: 'bbmobilenew:supabase:audience_admin:v1',
        }),
      })
    )
  })

  it('finishes pending anonymous creation before OTP verification and retains the verified session', async () => {
    const transport = await import('./supabaseTransport')
    const anonymous = holdAnonymousSignIn()
    const background = transport.authenticatedBackend('profile_backup')
    await anonymous.started

    const verification = transport.withBackendAuthLock('profile_backup', (client) =>
      client.auth.verifyOtp({ email: 'player@example.test', token: '123456', type: 'email' })
    )
    // The independent purpose advances while the profile operation is held.
    await transport.authenticatedBackend('analytics')
    expect(profileClient.auth.verifyOtp).not.toHaveBeenCalled()
    expect(analyticsClient.auth.signInAnonymously).toHaveBeenCalledOnce()

    anonymous.finish()
    await background
    await verification
    expect(profileClient.auth.verifyOtp).toHaveBeenCalledOnce()
    expect(sessions.profile_backup?.user.id).toBe('verified-account')
  })

  it('waits for pending anonymous creation before signing out', async () => {
    const transport = await import('./supabaseTransport')
    const anonymous = holdAnonymousSignIn()
    const background = transport.authenticatedBackend('profile_backup')
    await anonymous.started
    const signOut = transport.withBackendAuthLock('profile_backup', (client) =>
      client.auth.signOut({ scope: 'local' })
    )
    await transport.authenticatedBackend('analytics')
    expect(profileClient.auth.signOut).not.toHaveBeenCalled()
    anonymous.finish()
    await background
    await signOut
    expect(profileClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(sessions.profile_backup).toBeNull()
  })

  it('does not let a failed operation poison subsequent account operations', async () => {
    const transport = await import('./supabaseTransport')
    const failed = transport.withBackendAuthLock('profile_backup', async () => {
      throw new Error('Rejected code')
    })
    const next = transport.withBackendAuthLock('profile_backup', async () => 'next operation')
    await expect(failed).rejects.toThrow('Rejected code')
    await expect(next).resolves.toBe('next operation')
  })

  it('uses a separate application Web Lock across instances without blocking analytics', async () => {
    const tails = new Map<string, Promise<unknown>>()
    const request = vi.fn((name: string, _options: unknown, callback: () => Promise<unknown>) => {
      const next = (tails.get(name) ?? Promise.resolve()).catch(() => undefined).then(callback)
      tails.set(name, next)
      return next
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const firstInstance = await import('./supabaseTransport')
    const started = deferred<void>()
    const finish = deferred<void>()
    const first = firstInstance.withBackendAuthLock('profile_backup', async () => {
      started.resolve(undefined)
      await finish.promise
      return 'first'
    })
    await started.promise

    // A separate module instance models another tab's independent local queue.
    vi.resetModules()
    const secondInstance = await import('./supabaseTransport')
    const nextOperation = vi.fn(async () => 'second')
    const second = secondInstance.withBackendAuthLock('profile_backup', nextOperation)
    await secondInstance.withBackendAuthLock('analytics', async () => 'analytics')
    expect(nextOperation).not.toHaveBeenCalled()
    finish.resolve(undefined)
    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
    expect(request).toHaveBeenCalledWith(
      'bbmobilenew:app-auth-operation:profile_backup:v1',
      { mode: 'exclusive' },
      expect.any(Function)
    )
  })
})
