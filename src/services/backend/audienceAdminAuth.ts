import { getBackendConfig } from './config'
import { withBackendAuthLock } from './supabaseTransport'

class AdminSignInError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminSignInError'
  }
}

function available() {
  if (!getBackendConfig() || import.meta.env.VITE_PLAYER_ACCOUNTS_ENABLED !== 'true')
    throw new AdminSignInError('Administrator access is not enabled in this build.')
}

function signInError(error: unknown): Error {
  if (error instanceof AdminSignInError) return error
  const details = error as { code?: string; status?: number } | null
  if (details?.status === 429 || details?.code?.includes('rate_limit'))
    return new AdminSignInError('Too many sign-in attempts. Please wait and try again.')
  if (details?.code === 'invalid_credentials')
    return new AdminSignInError('Email or password is incorrect.')
  return new AdminSignInError('Administrator sign-in failed. Check your details and try again.')
}

/** Existing, approved administrators only. Never signs up or changes a player's backup session. */
export async function signInAudienceAdmin(emailInput: string, password: string): Promise<void> {
  available()
  const email = emailInput.trim()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password)
    throw new AdminSignInError('Enter your administrator email and password.')
  try {
    await withBackendAuthLock('audience_admin', async (client) => {
      const signedIn = await client.auth.signInWithPassword({ email, password })
      if (signedIn.error) throw signedIn.error
      const current = await client.auth.getUser()
      if (current.error) throw current.error
      const user = current.data.user
      if (
        !user ||
        user.is_anonymous === true ||
        !user.email_confirmed_at ||
        user.app_metadata?.player_analytics_admin !== true
      ) {
        await client.auth.signOut({ scope: 'local' })
        throw new AdminSignInError('This account is not approved for player audience access.')
      }
      // The audience RPC independently checks the live administrator grant.
    })
  } catch (error) {
    throw signInError(error)
  }
}

export async function signOutAudienceAdmin(): Promise<void> {
  available()
  try {
    await withBackendAuthLock('audience_admin', async (client) => {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw error
    })
  } catch {
    throw new AdminSignInError('Administrator sign-out failed. Please try again.')
  }
}
