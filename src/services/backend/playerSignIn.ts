import type { SupabaseClient, User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { getPlayerSafety } from '../../safety/playerSafety'
import { getBackendConfig, isPlayerSignInConfigured, isPlayerSignInPreview } from './config'
import { getBackendClient, withBackendAuthLock } from './supabaseTransport'

export const NATIVE_PLAYER_SIGN_IN_REDIRECT = 'com.georgicole.thebigeye://player-sign-in'
const PURPOSE = 'player_account'
const ATTEMPT_KEY = 'bbmobilenew:player-sign-in-attempt:v1'
const ATTEMPT_LIFETIME = 15 * 60 * 1000
const RETURN_PARAM = 'player_sign_in'

export type PlayerSignInProvider = 'apple' | 'google'
export type PlayerAccount = { id: string; email: string }
type SignInAttempt = { provider: PlayerSignInProvider; flowId: string; expiresAt: number }

class PlayerProviderUnavailable extends Error {}

export function playerSignInError(error: unknown, fallback: string) {
  if (error instanceof PlayerProviderUnavailable) return error.message
  const details = error as { status?: number; code?: string } | null
  if (
    details?.status === 429 ||
    (typeof details?.code === 'string' && details.code.includes('rate_limit'))
  )
    return 'Too many attempts. Wait a moment and try again.'
  if (details?.code === 'otp_expired') return 'That code has expired. Request a new code.'
  return fallback
}

function assertCanSignIn() {
  const age = getPlayerSafety()?.ageBand
  if (isPlayerSignInPreview() || !isPlayerSignInConfigured() || (age && age !== 'adult'))
    throw new Error('Player sign-in is unavailable.')
}

function playerAccount(user?: User | null): PlayerAccount | null {
  if (
    !user?.email ||
    !user.email_confirmed_at ||
    user.is_anonymous ||
    user.app_metadata?.player_analytics_admin === true
  )
    return null
  return { id: user.id, email: user.email }
}

export async function observePlayerAccount(listener: (account: PlayerAccount | null) => void) {
  const client = await getBackendClient(PURPOSE)
  const { data } = client.auth.onAuthStateChange((_event, session) =>
    listener(playerAccount(session?.user))
  )
  return () => data.subscription.unsubscribe()
}

export async function getCurrentPlayerAccount(): Promise<PlayerAccount | null> {
  if (!isPlayerSignInConfigured()) return null
  const client = await getBackendClient(PURPOSE)
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return playerAccount(data.session?.user)
}

export async function requestPlayerEmailCode(email: string) {
  assertCanSignIn()
  await withBackendAuthLock(PURPOSE, async (client) => {
    attemptStorage().removeItem(ATTEMPT_KEY)
    const { error } = await client.auth.signInWithOtp({ email })
    if (error) throw error
  })
}

export async function verifyPlayerEmailCode(email: string, token: string) {
  assertCanSignIn()
  await withBackendAuthLock(PURPOSE, async (client) => {
    attemptStorage().removeItem(ATTEMPT_KEY)
    const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
    if (error) throw error
    if (!playerAccount(data.session?.user)) {
      await client.auth.signOut({ scope: 'local' })
      throw new Error('This account cannot be used for player sign-in.')
    }
  })
}

function webRedirect() {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin)
  url.searchParams.set(RETURN_PARAM, '1')
  return url
}

const attemptStorage = () => (Capacitor.isNativePlatform() ? localStorage : sessionStorage)

async function assertPlayerProviderEnabled(provider: PlayerSignInProvider) {
  const config = getBackendConfig()
  if (!config) throw new Error('Player sign-in is unavailable.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Could not check sign-in availability.')
    const settings = (await response.json()) as {
      external?: Partial<Record<PlayerSignInProvider, boolean>>
    }
    if (settings.external?.[provider] !== true) {
      const label = provider === 'apple' ? 'Apple' : 'Google'
      throw new PlayerProviderUnavailable(
        `${label} sign-in is unavailable right now. Try another sign-in option.`
      )
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function startPlayerOAuth(provider: PlayerSignInProvider) {
  assertCanSignIn()
  await assertPlayerProviderEnabled(provider)
  const native = Capacitor.isNativePlatform()
  await withBackendAuthLock(PURPOSE, async (client) => {
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native ? NATIVE_PLAYER_SIGN_IN_REDIRECT : webRedirect().href,
        skipBrowserRedirect: true,
        ...(provider === 'google' && { queryParams: { prompt: 'select_account' } }),
      },
    })
    if (error) throw error
    if (!data.url || !data.flowId) throw new Error('Could not start secure sign-in.')
    const storage = attemptStorage()
    const attempt: SignInAttempt = {
      provider,
      flowId: data.flowId,
      expiresAt: Date.now() + ATTEMPT_LIFETIME,
    }
    storage.setItem(ATTEMPT_KEY, JSON.stringify(attempt))
    try {
      if (native) {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      } else window.location.assign(data.url)
    } catch (error) {
      storage.removeItem(ATTEMPT_KEY)
      throw error
    }
  })
}

function readReturnUrl(href: string, native: boolean): URL | null {
  try {
    const url = new URL(href)
    const expected = native ? new URL(NATIVE_PLAYER_SIGN_IN_REDIRECT) : webRedirect()
    if (
      url.protocol !== expected.protocol ||
      url.host !== expected.host ||
      url.pathname !== expected.pathname ||
      url.username ||
      url.password ||
      (!native && url.searchParams.get(RETURN_PARAM) !== '1')
    )
      return null
    return url
  } catch {
    return null
  }
}

/** Match this app's callback and consume the saved PKCE attempt exactly once. */
export async function finishPlayerOAuth(href: string): Promise<boolean> {
  const native = Capacitor.isNativePlatform()
  const url = readReturnUrl(href, native)
  if (!url) return false
  if (!native) {
    // Drop one-use codes and provider error details before rendering the account screen.
    window.history.replaceState(window.history.state, '', url.pathname)
  }
  const storage = attemptStorage()
  const raw = storage.getItem(ATTEMPT_KEY)
  if (!raw && native) return false // Cold launch URL and the live event can report the same return.
  assertCanSignIn()
  return withBackendAuthLock(PURPOSE, async (client) => {
    if (storage.getItem(ATTEMPT_KEY) !== raw) return false
    storage.removeItem(ATTEMPT_KEY)
    const attempt = JSON.parse(raw ?? 'null') as SignInAttempt | null
    const code = url.searchParams.get('code')
    if (!code || !attempt?.flowId || attempt.expiresAt < Date.now())
      throw new Error('Sign-in was canceled or expired.')
    const { data, error } = await client.auth.exchangeCodeForSession(code, {
      flowId: attempt.flowId,
    })
    if (error) throw error
    const session = data.session
    if (!session || !playerAccount(session.user)) {
      await client.auth.signOut({ scope: 'local' })
      throw new Error('This account cannot be used for player sign-in.')
    }
    if (attempt.provider === 'apple' && session.provider_refresh_token) {
      // A later Supabase session refresh does not include Apple's revocation credential.
      // Sign-in still works if custody fails; account deletion can offer Apple's manual step.
      await accountRequest(client, session.access_token, {
        action: 'save-apple-token',
        refreshToken: session.provider_refresh_token,
      }).catch(() => undefined)
    }
    return true
  })
}

async function accountRequest<T>(
  client: SupabaseClient,
  token: string,
  body: Record<string, string>
): Promise<T> {
  const { data, error } = await client.functions.invoke<T>('player-account', {
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (error) throw error
  if (!data) throw new Error('The account service did not respond.')
  return data
}

export async function signOutPlayer() {
  await withBackendAuthLock(PURPOSE, async (client) => {
    attemptStorage().removeItem(ATTEMPT_KEY)
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
  })
}

export async function deletePlayerAccount(expectedAccountId: string) {
  return withBackendAuthLock(PURPOSE, async (client) => {
    const { data, error } = await client.auth.getSession()
    if (error) throw error
    if (!data.session || playerAccount(data.session.user)?.id !== expectedAccountId)
      throw new Error('Sign in again to delete this account.')
    const result = await accountRequest<{ appleNeedsManualRevocation: boolean }>(
      client,
      data.session.access_token,
      { action: 'delete-account' }
    )
    // Account deletion already invalidated the server session.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    return result
  })
}
