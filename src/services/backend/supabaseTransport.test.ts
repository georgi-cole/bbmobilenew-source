import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSafetyFixture } from '../../safety/__tests__/safetyFixture'
import { setOptionalPlayerFeature } from '../../safety/playerSafety'

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  session: vi.fn(),
  signIn: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: sdk.create }))

describe('Supabase authentication boundary', () => {
  afterEach(() => vi.unstubAllEnvs())
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    installSafetyFixture(28, ['analytics'])
    vi.stubEnv('VITE_SUPABASE_ENABLED', 'true')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    sdk.session.mockResolvedValue({ data: { session: null }, error: null })
    sdk.signIn.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null })
    sdk.create.mockReturnValue({
      auth: { getSession: sdk.session, signInAnonymously: sdk.signIn, refreshSession: sdk.refresh },
    })
  })
  it('deduplicates concurrent anonymous sign-ins', async () => {
    const { authenticatedBackend } = await import('./supabaseTransport')
    const results = await Promise.all([
      authenticatedBackend('analytics'),
      authenticatedBackend('analytics'),
    ])
    expect(results.map((result) => result.ownerId)).toEqual(['owner', 'owner'])
    expect(sdk.signIn).toHaveBeenCalledOnce()
    expect(sdk.create.mock.calls[0][2].auth).toMatchObject({
      autoRefreshToken: false,
      detectSessionInUrl: false,
    })
  })
  it('keeps a valid persisted identity without signing up again', async () => {
    sdk.session.mockResolvedValue({
      data: { session: { user: { id: 'saved-owner' }, expires_at: Date.now() / 1000 + 3600 } },
      error: null,
    })
    const { authenticatedBackend } = await import('./supabaseTransport')
    expect((await authenticatedBackend('analytics')).ownerId).toBe('saved-owner')
    expect(sdk.signIn).not.toHaveBeenCalled()
  })
  it('refreshes expired sessions and preserves identity', async () => {
    sdk.session.mockResolvedValue({
      data: { session: { user: { id: 'saved-owner' }, expires_at: 1 } },
      error: null,
    })
    sdk.refresh.mockResolvedValue({
      data: { session: { user: { id: 'saved-owner' } } },
      error: null,
    })
    const { authenticatedBackend } = await import('./supabaseTransport')
    expect((await authenticatedBackend('analytics')).ownerId).toBe('saved-owner')
    expect(sdk.refresh).toHaveBeenCalledOnce()
    expect(sdk.signIn).not.toHaveBeenCalled()
  })
  it('rejects authentication and fetches after consent is withdrawn', async () => {
    const { authenticatedBackend } = await import('./supabaseTransport')
    await authenticatedBackend('analytics')
    const guardedFetch = sdk.create.mock.calls[0][2].global.fetch
    setOptionalPlayerFeature('analytics', false)
    await expect(authenticatedBackend('analytics')).rejects.toThrow()
    await expect(
      guardedFetch('https://project.supabase.co/rest/v1/player_events', {})
    ).rejects.toThrow()
  })
})
