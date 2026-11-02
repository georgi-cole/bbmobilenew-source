import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoredProfile } from '../../store/profilesSlice'
import { getBackendConfig } from './config'
import { serializeProfileBackup } from './profileBackup'
import { authenticatedBackend, getBackendClient, withBackendAuthLock } from './supabaseTransport'

/** Private contact data stays outside local profiles, saves and analytics. */
export type ProfileContact = {
  email: string
  updatesOptIn: boolean
  revision: string
}

export type ProfileContactInput = {
  email: string
  updatesOptIn: boolean
  expectedRevision: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isProfileContactConfigured = () =>
  getBackendConfig() !== null && import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED === 'true'

export const normalizeContactEmail = (value: string): string => value.trim().toLowerCase()

export function isValidContactEmail(value: string): boolean {
  const email = normalizeContactEmail(value)
  if (email === '') return true
  return (
    email.length <= 254 &&
    !Array.from(email).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) &&
    /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(email)
  )
}

function contactError(error: unknown, writeMayHaveCompleted = false): Error {
  const code = (error as { code?: string } | null)?.code
  if (code === '40001')
    return Object.assign(new Error('Email preferences changed. Reload them before saving again.'), {
      code: 'contact_conflict',
      uncertainSave: false,
    })
  if (code === 'PGRST202' || code === '42883' || code === '42P01')
    return Object.assign(
      new Error('Email preferences are not available yet. You can leave the email blank.'),
      { uncertainSave: false }
    )
  return Object.assign(
    new Error('Could not save email preferences. Check your connection and try again.'),
    // A database rejection rolls back the RPC. A lost network response may not.
    { uncertainSave: writeMayHaveCompleted && !code }
  )
}

function parseContact(data: unknown): ProfileContact {
  if (
    !data ||
    typeof data !== 'object' ||
    !('email' in data) ||
    typeof data.email !== 'string' ||
    !isValidContactEmail(data.email) ||
    !('updatesOptIn' in data) ||
    typeof data.updatesOptIn !== 'boolean' ||
    (data.updatesOptIn && !data.email) ||
    !('revision' in data) ||
    typeof data.revision !== 'string' ||
    !UUID.test(data.revision)
  )
    throw new Error('Email preferences could not be confirmed. Please reopen this profile.')
  return { email: data.email, updatesOptIn: data.updatesOptIn, revision: data.revision }
}

async function assertOwner(client: SupabaseClient, expectedOwner: string): Promise<void> {
  const { data, error } = await client.auth.getSession()
  if (error || data.session?.user.id !== expectedOwner)
    throw Object.assign(
      new Error('Your session changed. Reopen this profile before saving email preferences.'),
      { uncertainSave: false }
    )
}

function assertProfileId(profileId: string): void {
  if (!profileId || profileId.length > 120) throw new Error('This profile could not be identified.')
}

export async function readProfileContact(profileId: string): Promise<ProfileContact | null> {
  if (!isProfileContactConfigured()) return null
  assertProfileId(profileId)
  const { ownerId } = await authenticatedBackend('profile_backup')
  return withBackendAuthLock('profile_backup', async (client) => {
    await assertOwner(client, ownerId)
    const { data, error } = await client.rpc('get_player_profile_contact', {
      p_profile_id: profileId,
    })
    if (error)
      throw new Error('Email preferences could not be loaded. Other details can still be saved.')
    return data === null ? null : parseContact(data)
  })
}

/** Called only by an explicit profile-form save, never by automatic backup. */
export async function saveProfileContact(
  profile: StoredProfile,
  input: ProfileContactInput
): Promise<ProfileContact> {
  if (!isProfileContactConfigured()) throw new Error('Email preferences are not enabled.')
  assertProfileId(profile.id)
  const email = normalizeContactEmail(input.email)
  if (!isValidContactEmail(email)) throw new Error('Enter a valid email address or leave it blank.')
  if (input.updatesOptIn && !email) throw new Error('Add an email address to receive game updates.')
  if (input.expectedRevision !== null && !UUID.test(input.expectedRevision))
    throw new Error('Email preferences could not be confirmed. Please reopen this profile.')
  const { ownerId } = await authenticatedBackend('profile_backup').catch((cause: unknown) => {
    throw contactError(cause)
  })
  return withBackendAuthLock('profile_backup', async (client) => {
    await assertOwner(client, ownerId)
    // The allowlisted backup deliberately does not contain contact data.
    const { error: backupError } = await client
      .from('player_profiles')
      .upsert(
        { owner_id: ownerId, profile_id: profile.id, snapshot: serializeProfileBackup(profile) },
        { onConflict: 'owner_id,profile_id' }
      )
    if (backupError) throw contactError(backupError)
    const { data, error } = await client.rpc('save_player_profile_contact', {
      p_profile_id: profile.id,
      p_email: email,
      p_updates_opt_in: input.updatesOptIn === true,
      p_expected_revision: input.expectedRevision,
    })
    if (error?.code === '40001') {
      // A write can succeed while its response is lost. Accept a retry only if
      // the server already has this exact choice; never overwrite an unsubscribe.
      const current = await client.rpc('get_player_profile_contact', { p_profile_id: profile.id })
      if (!current.error && current.data !== null) {
        const saved = parseContact(current.data)
        if (saved.email === email && saved.updatesOptIn === input.updatesOptIn) return saved
      }
    }
    if (error) throw contactError(error, true)
    return parseContact(data)
  })
}

/** A random link token can revoke emails without logging in or creating a profile. */
export async function unsubscribeProfileContact(token: string): Promise<boolean> {
  if (!UUID.test(token))
    throw new Error('This unsubscribe link is invalid. Check the link in your email.')
  if (!getBackendConfig())
    throw new Error('Unsubscribe is temporarily unavailable. Please try again later.')
  const client = await getBackendClient('profile_backup')
  const { data, error } = await client.rpc('unsubscribe_player_contact', { p_token: token })
  if (error || typeof data !== 'boolean')
    throw new Error('Could not unsubscribe right now. Please try again.')
  return data
}
