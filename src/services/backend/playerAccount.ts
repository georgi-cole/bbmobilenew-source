import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getBackendConfig } from './config'
import {
  authenticatedBackend,
  subscribeBackendAuth,
  withBackendAuthLock,
} from './supabaseTransport'

export type AccountEmailMode = 'connect' | 'sign_in'
export type PendingAccountEmail = { email: string; mode: AccountEmailMode }
export type PlayerAccount = {
  ownerId: string
  email: string | null
  verified: boolean
  pendingEmail: string | null
  newsOptIn: boolean
  testerOptIn: boolean
  preferencesAvailable: boolean
  isAdmin: boolean
}

type StoredChallenge = PendingAccountEmail & { ownerId: string | null; requestedAt: number }
const CHALLENGE_KEY = 'bbmobilenew:account-email-pending:v1'
const CHALLENGE_LIFETIME = 60 * 60 * 1000
const preferenceListeners = new Set<() => void>()

export const isPlayerAccountConfigured = () =>
  getBackendConfig() !== null && import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED === 'true'

function accountError(error: unknown): Error {
  const details = error as { code?: string; status?: number } | null
  if (details?.status === 429 || details?.code?.includes('rate_limit'))
    return new Error('Please wait a minute before requesting another code.')
  if (
    [
      'email_exists',
      'user_already_exists',
      'identity_already_exists',
      'email_address_conflict',
    ].includes(details?.code ?? '')
  )
    return new Error('This email is already connected. Choose Sign in to use that account.')
  if (['otp_expired', 'otp_disabled', 'validation_failed'].includes(details?.code ?? ''))
    return new Error('That code is invalid or has expired. Check it or request a new code.')
  if (
    ['email_provider_disabled', 'email_address_not_authorized', 'email_address_invalid'].includes(
      details?.code ?? ''
    )
  )
    return new Error('Email connection is not available for this address. Please try again later.')
  return new Error('Could not reach your account. Check your connection and try again.')
}

function validEmail(value: string): string {
  const email = value.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Enter a valid email address.')
  return email
}

function readChallenge(): StoredChallenge | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(CHALLENGE_KEY) ?? 'null')
    if (
      value &&
      typeof value.email === 'string' &&
      (value.mode === 'connect' || value.mode === 'sign_in') &&
      (value.ownerId === null || typeof value.ownerId === 'string') &&
      typeof value.requestedAt === 'number' &&
      value.requestedAt <= Date.now() &&
      Date.now() - value.requestedAt < CHALLENGE_LIFETIME
    )
      return value as StoredChallenge
  } catch {
    // A blocked session store must not prevent account connection.
  }
  return null
}

export function getPendingAccountEmail(): PendingAccountEmail | null {
  const pending = readChallenge()
  return pending ? { email: pending.email, mode: pending.mode } : null
}

export function clearPendingAccountEmail(): void {
  try {
    sessionStorage.removeItem(CHALLENGE_KEY)
  } catch {
    // This is a resumable form hint, never an OTP or Auth token.
  }
}

export function subscribePlayerAccount(listener: () => void): () => void {
  preferenceListeners.add(listener)
  const unsubscribe = subscribeBackendAuth('profile_backup', listener)
  return () => {
    preferenceListeners.delete(listener)
    unsubscribe()
  }
}

async function accountForUser(client: SupabaseClient, user: User): Promise<PlayerAccount> {
  const verified = user.is_anonymous !== true && Boolean(user.email && user.email_confirmed_at)
  const account: PlayerAccount = {
    ownerId: user.id,
    email: user.email ?? null,
    verified,
    pendingEmail: user.new_email ?? null,
    newsOptIn: false,
    testerOptIn: false,
    preferencesAvailable: false,
    isAdmin: user.app_metadata?.player_analytics_admin === true,
  }
  if (!verified) return account
  const { data, error } = await client
    .from('player_contact_preferences')
    .select('news_opt_in,tester_opt_in')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!error) {
    account.preferencesAvailable = true
    account.newsOptIn = data?.news_opt_in === true
    account.testerOptIn = data?.tester_opt_in === true
  }
  return account
}

async function currentUser(client: SupabaseClient): Promise<User | null> {
  const session = await client.auth.getSession()
  if (session.error) throw accountError(session.error)
  if (!session.data.session) return null
  // Confirm with Auth instead of trusting locally editable session metadata.
  const { data, error } = await client.auth.getUser()
  if (error) throw accountError(error)
  return data.user
}

export async function readPlayerAccount(): Promise<PlayerAccount | null> {
  if (!isPlayerAccountConfigured()) return null
  return withBackendAuthLock('profile_backup', async (client) => {
    const user = await currentUser(client)
    return user ? accountForUser(client, user) : null
  })
}

export async function requestAccountEmail(
  emailInput: string,
  mode: AccountEmailMode
): Promise<void> {
  const email = validEmail(emailInput)
  try {
    // Do not recursively acquire the transport lock: first finish any automatic
    // anonymous sign-in, then re-check its owner inside the explicit operation.
    const expectedOwner =
      mode === 'connect' ? (await authenticatedBackend('profile_backup')).ownerId : null
    await withBackendAuthLock('profile_backup', async (client) => {
      const user = await currentUser(client)
      if (user && user.is_anonymous !== true && user.email_confirmed_at)
        throw new Error('already_connected')
      if (mode === 'connect') {
        if (!user || user.id !== expectedOwner) throw new Error('account_changed')
        const { error } = await client.auth.updateUser({ email })
        if (error) throw error
      } else {
        // Existing account sign-in is explicit, never a linking fallback.
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        })
        if (error) throw error
      }
      try {
        sessionStorage.setItem(
          CHALLENGE_KEY,
          JSON.stringify({
            email,
            mode,
            ownerId: user?.id ?? null,
            requestedAt: Date.now(),
          } satisfies StoredChallenge)
        )
      } catch {
        // Verification still works from the current form if storage is unavailable.
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'already_connected')
      throw new Error(
        'This device is already connected. Disconnect it before using another account.'
      )
    if (error instanceof Error && error.message === 'account_changed')
      throw new Error('Your account changed. Request a new code before continuing.')
    throw accountError(error)
  }
}

export async function verifyAccountEmail(
  emailInput: string,
  tokenInput: string,
  mode: AccountEmailMode
): Promise<PlayerAccount> {
  const email = validEmail(emailInput)
  const token = tokenInput.trim()
  if (!/^\d{6,10}$/.test(token)) throw new Error('Enter the verification code from your email.')
  return withBackendAuthLock('profile_backup', async (client) => {
    const user = await currentUser(client)
    const pending = readChallenge()
    if (
      pending &&
      (pending.mode !== mode || pending.email !== email || pending.ownerId !== (user?.id ?? null))
    )
      throw new Error('Your account changed. Request a new code before continuing.')
    if (
      (mode === 'connect' && (!user || user.is_anonymous !== true)) ||
      (user?.is_anonymous === false && user.email_confirmed_at)
    )
      throw new Error('Your account changed. Request a new code before continuing.')
    const { data, error } = await client.auth.verifyOtp({
      email,
      token,
      type: mode === 'connect' ? 'email_change' : 'email',
    })
    if (error) throw accountError(error)
    if (!data.user) throw new Error('Verification is not complete. Please request a new code.')
    if (mode === 'connect' && data.user.id !== user?.id) {
      await client.auth.signOut({ scope: 'local' })
      throw new Error('The account could not be linked safely. Please try again.')
    }
    const confirmedUser = await currentUser(client)
    if (!confirmedUser || confirmedUser.id !== data.user.id)
      throw new Error('Your account changed. Refresh before continuing.')
    const account = await accountForUser(client, confirmedUser)
    if (!account.verified) throw new Error('Verification is not complete. Please check your email.')
    clearPendingAccountEmail()
    return account
  })
}

export async function saveAccountPreferences(
  preferences: {
    newsOptIn: boolean
    testerOptIn: boolean
  },
  expectedOwnerId: string
): Promise<PlayerAccount> {
  return withBackendAuthLock('profile_backup', async (client) => {
    const user = await currentUser(client)
    if (!user || user.is_anonymous === true || !user.email || !user.email_confirmed_at)
      throw new Error('Verify your email before choosing contact preferences.')
    if (user.id !== expectedOwnerId)
      throw new Error('Your account changed. Refresh before saving your choices.')
    const { error } = await client.from('player_contact_preferences').upsert(
      {
        owner_id: user.id,
        news_opt_in: preferences.newsOptIn === true,
        tester_opt_in: preferences.testerOptIn === true,
      },
      { onConflict: 'owner_id' }
    )
    if (error) throw new Error('Your choices could not be saved. Please try again.')
    const account = await accountForUser(client, user)
    if (!account.preferencesAvailable)
      throw new Error(
        'Your choices were sent, but could not be confirmed. Refresh before trying again.'
      )
    preferenceListeners.forEach((listener) => listener())
    return account
  })
}

export async function signOutPlayerAccount(expectedOwnerId?: string): Promise<void> {
  await withBackendAuthLock('profile_backup', async (client) => {
    if (expectedOwnerId && (await currentUser(client))?.id !== expectedOwnerId)
      throw new Error('Your account changed. Refresh before signing out.')
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw accountError(error)
    clearPendingAccountEmail()
  })
}
