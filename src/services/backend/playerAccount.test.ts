import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'
import {
  getPendingAccountEmail,
  readPlayerAccount,
  requestAccountEmail,
  saveAccountPreferences,
  signOutPlayerAccount,
  verifyAccountEmail,
} from './playerAccount'

const mocks = vi.hoisted(() => ({
  configured: true,
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
  getClient: vi.fn(),
  authenticated: vi.fn(),
}))

vi.mock('./config', () => ({ getBackendConfig: () => (mocks.configured ? {} : null) }))
vi.mock('./supabaseTransport', () => ({
  getBackendClient: mocks.getClient,
  authenticatedBackend: mocks.authenticated,
  subscribeBackendAuth: () => () => undefined,
  withBackendAuthLock: async (purpose: string, operation: (client: unknown) => Promise<unknown>) =>
    operation(await mocks.getClient(purpose)),
}))

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'existing-backup-owner',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-10-27T00:00:00Z',
    is_anonymous: true,
    ...overrides,
  }
}

const verified = () =>
  user({
    email: 'player@example.com',
    email_confirmed_at: '2026-11-01T09:00:00Z',
    is_anonymous: false,
  })

function useUser(value: User | null) {
  mocks.auth.getSession.mockResolvedValue({
    data: { session: value ? { user: value } : null },
    error: null,
  })
  mocks.auth.getUser.mockResolvedValue({ data: { user: value }, error: null })
}

describe('optional player account email', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mocks.configured = true
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
    useUser(user())
    const client = { auth: mocks.auth, from: mocks.from }
    mocks.getClient.mockResolvedValue(client)
    mocks.authenticated.mockResolvedValue({ client, ownerId: 'existing-backup-owner' })
    mocks.auth.updateUser.mockResolvedValue({ error: null })
    mocks.auth.signInWithOtp.mockResolvedValue({ error: null })
    mocks.auth.verifyOtp.mockImplementation(async () => {
      const next = verified()
      useUser(next)
      return { data: { user: next }, error: null }
    })
    mocks.auth.signOut.mockResolvedValue({ error: null })
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.from.mockReturnValue({
      upsert: mocks.upsert,
      select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
    })
  })

  it('upgrades the existing backup owner without touching local seasons, profiles or analytics', async () => {
    localStorage.setItem('bbmobilenew:profiles:v1', '{"activeProfileId":"existing-profile"}')
    localStorage.setItem('bbmobilenew:savedRuns:existing-profile', '{"day":8,"wallet":450}')
    const before = { ...localStorage }
    await requestAccountEmail(' player@example.com ', 'connect')
    expect(mocks.authenticated).toHaveBeenCalledWith('profile_backup')
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ email: 'player@example.com' })
    expect(mocks.auth.signInWithOtp).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(getPendingAccountEmail()).toEqual({ email: 'player@example.com', mode: 'connect' })

    const account = await verifyAccountEmail('player@example.com', '123456', 'connect')
    expect(account).toMatchObject({
      ownerId: 'existing-backup-owner',
      verified: true,
      newsOptIn: false,
      testerOptIn: false,
    })
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'player@example.com',
      token: '123456',
      type: 'email_change',
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(getPendingAccountEmail()).toBeNull()
    expect({ ...localStorage }).toEqual(before)
  })

  it('never falls back to signing in when the email already belongs to another account', async () => {
    mocks.auth.updateUser.mockResolvedValue({ error: { code: 'email_exists' } })
    await expect(requestAccountEmail('player@example.com', 'connect')).rejects.toThrow(
      'Choose Sign in'
    )
    expect(mocks.auth.signInWithOtp).not.toHaveBeenCalled()
    expect(getPendingAccountEmail()).toBeNull()
  })

  it('uses an explicit existing-account sign-in without creating an account', async () => {
    await requestAccountEmail('player@example.com', 'sign_in')
    expect(mocks.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'player@example.com',
      options: { shouldCreateUser: false },
    })
    mocks.auth.verifyOtp.mockImplementation(async () => {
      const next = { ...verified(), id: 'returning-owner' }
      useUser(next)
      return { data: { user: next }, error: null }
    })
    const account = await verifyAccountEmail('player@example.com', '12345678', 'sign_in')
    expect(account.ownerId).toBe('returning-owner')
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'player@example.com',
      token: '12345678',
      type: 'email',
    })
    expect(mocks.auth.updateUser).not.toHaveBeenCalled()
  })

  it('keeps a challenge retryable after an expired code and rejects malformed input locally', async () => {
    await requestAccountEmail('player@example.com', 'connect')
    await expect(verifyAccountEmail('player@example.com', 'abc', 'connect')).rejects.toThrow(
      'verification code'
    )
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled()
    mocks.auth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' }, data: {} })
    await expect(verifyAccountEmail('player@example.com', '123456', 'connect')).rejects.toThrow(
      'expired'
    )
    expect(getPendingAccountEmail()).not.toBeNull()
  })

  it('rejects a pending challenge if another tab changed the account', async () => {
    await requestAccountEmail('player@example.com', 'connect')
    useUser(user({ id: 'different-owner' }))
    await expect(verifyAccountEmail('player@example.com', '123456', 'connect')).rejects.toThrow(
      'account changed'
    )
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('requires verification before saving separate contact choices', async () => {
    await expect(
      saveAccountPreferences({ newsOptIn: true, testerOptIn: false }, 'existing-backup-owner')
    ).rejects.toThrow('Verify your email')
    expect(mocks.upsert).not.toHaveBeenCalled()
    useUser(verified())
    mocks.maybeSingle.mockResolvedValue({
      data: { news_opt_in: true, tester_opt_in: false },
      error: null,
    })
    await expect(
      saveAccountPreferences({ newsOptIn: true, testerOptIn: false }, 'existing-backup-owner')
    ).resolves.toMatchObject({ newsOptIn: true, testerOptIn: false })
    expect(mocks.upsert).toHaveBeenCalledWith(
      { owner_id: 'existing-backup-owner', news_opt_in: true, tester_opt_in: false },
      { onConflict: 'owner_id' }
    )
  })

  it('does not report successful consent when its write fails', async () => {
    useUser(verified())
    mocks.upsert.mockResolvedValue({ error: { code: '42501' } })
    await expect(
      saveAccountPreferences({ newsOptIn: false, testerOptIn: true }, 'existing-backup-owner')
    ).rejects.toThrow('could not be saved')
  })

  it('distinguishes unavailable preferences from saved unchecked choices', async () => {
    useUser({ ...verified(), user_metadata: { player_analytics_admin: true } })
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: '42P01' } })
    await expect(readPlayerAccount()).resolves.toMatchObject({
      verified: true,
      preferencesAvailable: false,
      isAdmin: false,
    })
  })

  it('never applies a stale screen’s contact choices to a different signed-in account', async () => {
    useUser({ ...verified(), id: 'different-account' })
    await expect(
      saveAccountPreferences({ newsOptIn: true, testerOptIn: true }, 'existing-backup-owner')
    ).rejects.toThrow('account changed')
    expect(mocks.upsert).not.toHaveBeenCalled()
    await expect(signOutPlayerAccount('existing-backup-owner')).rejects.toThrow('account changed')
    expect(mocks.auth.signOut).not.toHaveBeenCalled()
  })

  it('does not create a session just to inspect an unconnected or disabled account', async () => {
    useUser(null)
    await expect(readPlayerAccount()).resolves.toBeNull()
    expect(mocks.authenticated).not.toHaveBeenCalled()
    mocks.configured = false
    mocks.getClient.mockClear()
    await expect(readPlayerAccount()).resolves.toBeNull()
    expect(mocks.getClient).not.toHaveBeenCalled()
  })

  it('keeps email connection unavailable until its deployment setup is enabled', async () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    await expect(readPlayerAccount()).resolves.toBeNull()
    expect(mocks.getClient).not.toHaveBeenCalled()
  })

  it('disconnects only this backup-account session and leaves local data and contact choices alone', async () => {
    await requestAccountEmail('player@example.com', 'connect')
    localStorage.setItem('saved-season', 'keep-me')
    await signOutPlayerAccount()
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.getClient).toHaveBeenLastCalledWith('profile_backup')
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(localStorage.getItem('saved-season')).toBe('keep-me')
    expect(getPendingAccountEmail()).toBeNull()
  })
})
