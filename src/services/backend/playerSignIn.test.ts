// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  finishPlayerOAuth,
  NATIVE_PLAYER_SIGN_IN_REDIRECT,
  requestPlayerEmailCode,
  startPlayerOAuth,
} from './playerSignIn'
import { registerPlayerSignInRedirects } from './playerSignInRedirects'

const sdk = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  openBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/browser', () => ({
  Browser: { open: sdk.openBrowser, close: sdk.closeBrowser },
}))
vi.mock('@capacitor/app', () => ({
  App: { addListener: sdk.addListener, getLaunchUrl: sdk.getLaunchUrl },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: sdk }) }))

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ external: { apple: true, google: true } }))
  )
  vi.resetAllMocks()
  localStorage.clear()
  vi.stubEnv('VITE_SUPABASE_ENABLED', 'true')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubEnv('VITE_PLAYER_SIGN_IN_ENABLED', 'true')
  sdk.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://project.supabase.co/auth/v1/authorize', flowId: 'fixture-flow-id' },
    error: null,
  })
  sdk.signInWithOtp.mockResolvedValue({ error: null })
  sdk.exchangeCodeForSession.mockResolvedValue({
    data: {
      session: {
        user: { id: 'account', email: 'test@example.com', email_confirmed_at: '2026-11-09T12:00Z' },
      },
    },
    error: null,
  })
  sdk.addListener.mockResolvedValue({ remove: sdk.removeListener })
  sdk.closeBrowser.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('installed app sign-in callbacks', () => {
  it('keeps disabled providers inside the game', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ external: { google: false } }))
    await expect(startPlayerOAuth('google')).rejects.toThrow('Google sign-in is unavailable')
    expect(sdk.openBrowser).not.toHaveBeenCalled()
  })

  it('opens the provider in the system browser and completes a cold launch return once', async () => {
    await startPlayerOAuth('google')
    expect(sdk.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: NATIVE_PLAYER_SIGN_IN_REDIRECT,
        queryParams: { prompt: 'select_account' },
        skipBrowserRedirect: true,
      },
    })
    expect(sdk.openBrowser).toHaveBeenCalledWith({
      url: 'https://project.supabase.co/auth/v1/authorize',
    })
    const url = `${NATIVE_PLAYER_SIGN_IN_REDIRECT}?code=returned-code`
    sdk.getLaunchUrl.mockResolvedValue({ url })
    const onReturn = vi.fn()
    const stop = await registerPlayerSignInRedirects(onReturn)
    const liveCallback = sdk.addListener.mock.calls[0][1]
    liveCallback({ url })

    await vi.waitFor(() => expect(onReturn).toHaveBeenCalledExactlyOnceWith(undefined))
    expect(sdk.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('returned-code', {
      flowId: 'fixture-flow-id',
    })
    expect(sdk.closeBrowser).toHaveBeenCalledOnce()
    stop?.()
    expect(sdk.removeListener).toHaveBeenCalledOnce()
  })

  it('ignores callbacks from another host and unsolicited returns', async () => {
    const url = `${NATIVE_PLAYER_SIGN_IN_REDIRECT}?code=unsolicited`
    await expect(finishPlayerOAuth(url)).resolves.toBe(false)
    await startPlayerOAuth('apple')
    await expect(
      finishPlayerOAuth('com.georgicole.thebigeye://unexpected?code=foreign')
    ).resolves.toBe(false)
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled()
    await expect(finishPlayerOAuth(url)).resolves.toBe(true)
  })

  it('clears a pending browser attempt when the player switches to an email code', async () => {
    await startPlayerOAuth('apple')
    await requestPlayerEmailCode('test@example.com')
    await expect(
      finishPlayerOAuth(`${NATIVE_PLAYER_SIGN_IN_REDIRECT}?code=late-return`)
    ).resolves.toBe(false)
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled()
  })
})
