import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isValidContactEmail,
  readProfileContact,
  saveProfileContact,
  unsubscribeProfileContact,
} from './profileContact'

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  authenticated: vi.fn(),
  client: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('./config', () => ({ getBackendConfig: mocks.config }))
vi.mock('./supabaseTransport', () => ({
  authenticatedBackend: mocks.authenticated,
  getBackendClient: mocks.client,
  withBackendAuthLock: async (_purpose: string, operation: (client: unknown) => unknown) =>
    operation(await mocks.client()),
}))

const revision = '11111111-1111-4111-8111-111111111111'
const profile = {
  id: 'local-profile',
  name: 'Alex',
  avatar: '👤',
  createdAt: '2026-11-01T00:00:00Z',
}
const contact = { email: 'alex@example.com', updatesOptIn: false, revision }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'true')
  mocks.config.mockReturnValue({ url: 'https://example.supabase.co', key: 'sb_publishable_test' })
  mocks.client.mockResolvedValue({
    auth: { getSession: mocks.session },
    rpc: mocks.rpc,
    from: mocks.from,
  })
  mocks.authenticated.mockResolvedValue({ ownerId: 'installation-owner' })
  mocks.session.mockResolvedValue({
    data: { session: { user: { id: 'installation-owner' } } },
    error: null,
  })
  mocks.from.mockReturnValue({ upsert: mocks.upsert })
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.rpc.mockResolvedValue({ data: contact, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('private optional profile email', () => {
  it('does not initialize a session when the rollout flag is off', async () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    await expect(readProfileContact(profile.id)).resolves.toBeNull()
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: null })
    ).rejects.toThrow('not enabled')
    expect(mocks.authenticated).not.toHaveBeenCalled()
  })

  it('loads only the requested owned profile contact through the scoped RPC', async () => {
    await expect(readProfileContact(profile.id)).resolves.toEqual(contact)
    expect(mocks.rpc).toHaveBeenCalledWith('get_player_profile_contact', {
      p_profile_id: profile.id,
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('treats an absent contact as optional, while rejecting malformed server data', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(readProfileContact(profile.id)).resolves.toBeNull()
    mocks.rpc.mockResolvedValueOnce({
      data: { ...contact, email: '', updatesOptIn: true },
      error: null,
    })
    await expect(readProfileContact(profile.id)).rejects.toThrow('could not be confirmed')
  })

  it('keeps email out of profile backups and does not infer opt-in from an address', async () => {
    await saveProfileContact(profile, {
      email: '  Alex@Example.COM  ',
      updatesOptIn: false,
      expectedRevision: null,
    })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: 'installation-owner', profile_id: profile.id }),
      { onConflict: 'owner_id,profile_id' }
    )
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain('example.com')
    expect(mocks.rpc).toHaveBeenCalledWith('save_player_profile_contact', {
      p_profile_id: profile.id,
      p_email: 'alex@example.com',
      p_updates_opt_in: false,
      p_expected_revision: null,
    })
  })

  it('sends the last read revision so an unsubscribe or newer edit wins over stale forms', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'private database detail' },
    })
    await expect(
      saveProfileContact(profile, { ...contact, updatesOptIn: true, expectedRevision: revision })
    ).rejects.toThrow('Email preferences changed')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_player_profile_contact',
      expect.objectContaining({ p_expected_revision: revision })
    )
  })

  it('rejects invalid addresses and opt-in without an address before any network writes', async () => {
    expect(isValidContactEmail('')).toBe(true)
    expect(isValidContactEmail('player@-example.com')).toBe(false)
    expect(isValidContactEmail('player@example..com')).toBe(false)
    expect(isValidContactEmail('player+tag@example.com')).toBe(true)
    await expect(
      saveProfileContact(profile, {
        email: 'not-an-email',
        updatesOptIn: false,
        expectedRevision: null,
      })
    ).rejects.toThrow('valid email')
    await expect(
      saveProfileContact(profile, { email: '', updatesOptIn: true, expectedRevision: null })
    ).rejects.toThrow('Add an email')
    expect(mocks.authenticated).not.toHaveBeenCalled()
  })

  it('clears an address and its contact choice without sending it to Auth', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...contact, email: '' }, error: null })
    await saveProfileContact(profile, {
      email: '',
      updatesOptIn: false,
      expectedRevision: revision,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('save_player_profile_contact', {
      p_profile_id: profile.id,
      p_email: '',
      p_updates_opt_in: false,
      p_expected_revision: revision,
    })
  })

  it('recovers a lost save response without writing again or reviving a withdrawn subscription', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } })
      .mockResolvedValueOnce({ data: { ...contact, updatesOptIn: true }, error: null })
    await expect(
      saveProfileContact(profile, { ...contact, updatesOptIn: true, expectedRevision: null })
    ).resolves.toMatchObject({ updatesOptIn: true })

    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } })
      .mockResolvedValueOnce({ data: contact, error: null })
    await expect(
      saveProfileContact(profile, { ...contact, updatesOptIn: true, expectedRevision: revision })
    ).rejects.toThrow('Email preferences changed')
  })

  it('does not write a contact if the backup owner changes while waiting for the lock', async () => {
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: 'other-owner' } } },
      error: null,
    })
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: null })
    ).rejects.toThrow('session changed')
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not claim success when the owned backup or contact migration is unavailable', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: '42501', message: 'private detail' } })
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: null })
    ).rejects.toThrow('Could not save')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: null })
    ).rejects.toMatchObject({
      message: expect.stringContaining('not available yet'),
      uncertainSave: false,
    })
  })

  it('distinguishes an ambiguous contact response from a definite database rejection', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'Failed to fetch' } })
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: null })
    ).rejects.toMatchObject({ uncertainSave: true })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001' } })
    await expect(
      saveProfileContact(profile, { ...contact, expectedRevision: revision })
    ).rejects.toMatchObject({ code: 'contact_conflict', uncertainSave: false })
  })

  it('allows token unsubscribe without creating an account, even when collection is switched off', async () => {
    vi.stubEnv('VITE_PLAYER_ACCOUNTS_ENABLED', 'false')
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    await expect(unsubscribeProfileContact(revision)).resolves.toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('unsubscribe_player_contact', { p_token: revision })
    expect(mocks.authenticated).not.toHaveBeenCalled()
    await expect(unsubscribeProfileContact('alex@example.com')).rejects.toThrow('invalid')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })
})
