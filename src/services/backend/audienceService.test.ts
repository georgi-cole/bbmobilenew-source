import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlayerAudience, type PlayerAudience } from './audienceService'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  client: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('./config', () => ({ getBackendConfig: mocks.config }))
vi.mock('./supabaseTransport', () => ({ getBackendClient: mocks.client }))

const audience: PlayerAudience = {
  generatedAt: '2026-11-01T10:00:00Z',
  coverageStart: null,
  totalPlayers: 0,
  truncated: false,
  groupCounts: { new: 0, returning: 0, completed: 0, inactive: 0, tribunal: 0, subscribed: 0 },
  players: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
  mocks.config.mockReturnValue({ url: 'https://example.supabase.co', key: 'publishable' })
  mocks.client.mockResolvedValue({ auth: { getSession: mocks.session }, rpc: mocks.rpc })
  mocks.session.mockResolvedValue({ data: { session: { user: { id: 'admin' } } }, error: null })
  mocks.rpc.mockResolvedValue({ data: audience, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('player audience access', () => {
  it('waits for the account feature to be enabled before calling the new RPC', async () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'disabled' })
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('does not initialize an account or fetch data when the backend is disabled', async () => {
    mocks.config.mockReturnValue(null)
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'disabled' })
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('requires a current session without automatically creating an anonymous account', async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null })
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'access' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('loads only through the server-authorized RPC', async () => {
    await expect(loadPlayerAudience()).resolves.toEqual(audience)
    expect(mocks.client).toHaveBeenCalledWith('audience_admin')
    expect(mocks.rpc).toHaveBeenCalledWith('get_player_audience')
  })

  it('does not expose raw database errors or rely on a client admin flag', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'private SQL detail' },
    })
    await expect(loadPlayerAudience()).rejects.toMatchObject({
      reason: 'access',
      message: 'This account does not have player audience access.',
    })
  })

  it('rejects anonymous sessions without calling the audience RPC', async () => {
    mocks.session.mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    })
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'access' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('retains a supplied unverified email and its single updates permission', async () => {
    const player = {
      id: 'profile:one',
      profileId: 'one',
      displayName: 'Aria',
      isGuest: false,
      verifiedEmail: false,
      email: 'aria@example.test',
      updatesOptIn: true,
      firstSeenAt: '2026-11-01T10:00:00Z',
      lastActiveAt: null,
      seasonsStarted: 0,
      seasonsCompleted: 0,
      groups: ['subscribed'],
    }
    mocks.rpc.mockResolvedValue({
      data: {
        ...audience,
        totalPlayers: 1,
        groupCounts: { ...audience.groupCounts, subscribed: 1 },
        players: [player],
      },
      error: null,
    })
    expect((await loadPlayerAudience()).players).toEqual([player])
  })

  it('distinguishes a missing migration from an empty audience', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'setup' })
  })

  it('rejects malformed aggregate counts rather than presenting misleading numbers', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...audience, totalPlayers: -1 }, error: null })
    await expect(loadPlayerAudience()).rejects.toMatchObject({ reason: 'unavailable' })
  })
})
