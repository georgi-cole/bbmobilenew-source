import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAudienceAdmin, signOutAudienceAdmin } from './audienceAdminAuth'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  lock: vi.fn(),
  signIn: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}))
vi.mock('./config', () => ({ getBackendConfig: mocks.config }))
vi.mock('./supabaseTransport', () => ({ withBackendAuthLock: mocks.lock }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
  mocks.config.mockReturnValue({ url: 'https://example.supabase.co', key: 'sb_publishable_test' })
  const client = {
    auth: {
      signInWithPassword: mocks.signIn,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
    },
  } as unknown as SupabaseClient
  mocks.lock.mockImplementation(
    (_purpose: string, operation: (value: SupabaseClient) => Promise<unknown>) => operation(client)
  )
  mocks.signIn.mockResolvedValue({ error: null })
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'approved-admin',
        email: 'admin@example.test',
        email_confirmed_at: '2026-11-01T10:00:00Z',
        is_anonymous: false,
        app_metadata: { player_analytics_admin: true },
      },
    },
    error: null,
  })
  mocks.signOut.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('isolated audience administrator sign-in', () => {
  it('uses only the dedicated administrator session and existing password credentials', async () => {
    await signInAudienceAdmin(' admin@example.test ', 'a password')
    expect(mocks.lock).toHaveBeenCalledWith('audience_admin', expect.any(Function))
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: 'admin@example.test',
      password: 'a password',
    })
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it('denies an authenticated user without a live administrator grant and clears that admin session', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'ordinary-user',
          email_confirmed_at: '2026-11-01T10:00:00Z',
          is_anonymous: false,
          app_metadata: {},
        },
      },
      error: null,
    })
    await expect(signInAudienceAdmin('player@example.test', 'password')).rejects.toThrow(
      'not approved'
    )
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.lock).toHaveBeenCalledTimes(1)
    expect(mocks.lock).toHaveBeenCalledWith('audience_admin', expect.any(Function))
  })

  it('does not mistake user-editable metadata for administrator approval', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'ordinary-user',
          email_confirmed_at: '2026-11-01T10:00:00Z',
          is_anonymous: false,
          app_metadata: {},
          user_metadata: { player_analytics_admin: true },
        },
      },
      error: null,
    })
    await expect(signInAudienceAdmin('player@example.test', 'password')).rejects.toThrow(
      'not approved'
    )
  })

  it('reports invalid credentials without returning raw Auth details', async () => {
    mocks.signIn.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'internal detail' },
    })
    await expect(signInAudienceAdmin('admin@example.test', 'wrong')).rejects.toThrow(
      'Email or password is incorrect.'
    )
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('waits for deployment enablement before making any administrator Auth request', async () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    await expect(signInAudienceAdmin('admin@example.test', 'password')).rejects.toThrow(
      'not enabled'
    )
    expect(mocks.lock).not.toHaveBeenCalled()
  })

  it('signs out only the administrator session', async () => {
    await signOutAudienceAdmin()
    expect(mocks.lock).toHaveBeenCalledWith('audience_admin', expect.any(Function))
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
