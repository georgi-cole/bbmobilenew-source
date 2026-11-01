import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import {
  clearPendingAccountEmail,
  getPendingAccountEmail,
  isPlayerAccountConfigured,
  readPlayerAccount,
  requestAccountEmail,
  saveAccountPreferences,
  signOutPlayerAccount,
  subscribePlayerAccount,
  verifyAccountEmail,
  type AccountEmailMode,
  type PendingAccountEmail,
  type PlayerAccount,
} from '../../services/backend/playerAccount'
import './PlayerAccount.css'

function accountError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'We could not complete that request. Please try again.'
}

export default function PlayerAccountScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const configured = isPlayerAccountConfigured()
  const [account, setAccount] = useState<PlayerAccount | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(
    configured ? 'loading' : 'ready'
  )
  const revision = useRef(0)
  const mounted = useRef(true)
  const [pending, setPending] = useState<PendingAccountEmail | null>(() =>
    configured ? getPendingAccountEmail() : null
  )
  const [mode, setMode] = useState<AccountEmailMode>(() => pending?.mode ?? 'connect')
  const [email, setEmail] = useState(() => pending?.email ?? '')
  const [code, setCode] = useState('')
  const [newsOptIn, setNewsOptIn] = useState(false)
  const [testerOptIn, setTesterOptIn] = useState(false)
  const [busy, setBusy] = useState<'send' | 'verify' | 'preferences' | 'sign_out' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const applyAccount = useCallback((next: PlayerAccount | null) => {
    setAccount(next)
    setNewsOptIn(next?.verified === true && next.newsOptIn)
    setTesterOptIn(next?.verified === true && next.testerOptIn)
    if (next?.verified) setPending(null)
  }, [])

  const reloadAccount = useCallback(
    async (notice?: {
      message: string
      ownerId?: string
      pending?: PendingAccountEmail
      signedOut?: boolean
    }) => {
      const currentRevision = ++revision.current
      if (!mounted.current) return
      setAccount(null)
      setNewsOptIn(false)
      setTesterOptIn(false)
      setPending(null)
      setLoadState('loading')
      setError('')
      setMessage('')
      try {
        const next = await readPlayerAccount()
        if (!mounted.current || currentRevision !== revision.current) return
        applyAccount(next)
        const challenge = next?.verified
          ? null
          : (getPendingAccountEmail() ?? notice?.pending ?? null)
        setPending(challenge)
        if (challenge) {
          setEmail(challenge.email)
          setMode(challenge.mode)
        }
        setLoadState('ready')
        if (
          notice &&
          ((notice.ownerId != null && notice.ownerId === next?.ownerId) ||
            (notice.signedOut && !next?.verified) ||
            (notice.pending && challenge?.email === notice.pending.email && !next?.verified))
        )
          setMessage(notice.message)
      } catch (cause) {
        if (!mounted.current || currentRevision !== revision.current) return
        setError(accountError(cause))
        setLoadState('error')
      }
    },
    [applyAccount]
  )

  useEffect(() => {
    if (!configured) return
    mounted.current = true
    const unsubscribe = subscribePlayerAccount(() => {
      void reloadAccount()
    })
    void reloadAccount()
    return () => {
      mounted.current = false
      revision.current += 1
      unsubscribe()
    }
  }, [configured, reloadAccount])

  function goBack() {
    const requested = (location.state as { profileReturnTo?: string } | null)?.profileReturnTo
    const from = requested === '/' || requested === '/game' ? requested : '/profile'
    navigate('/profile-picker', { replace: true, state: { from } })
  }

  function retryLoad() {
    void reloadAccount()
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    if (busy) return
    const request = pending ?? { email: email.trim(), mode }
    if (!request.email) return
    const actionRevision = revision.current
    setBusy('send')
    setError('')
    setMessage('')
    try {
      await requestAccountEmail(request.email, request.mode)
      setCode('')
      await reloadAccount({
        pending: request,
        message: 'Check your inbox for a verification code.',
      })
    } catch (cause) {
      if (mounted.current && actionRevision === revision.current) setError(accountError(cause))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    if (busy || !pending || !/^\d{6,10}$/.test(code)) return
    const actionRevision = revision.current
    setBusy('verify')
    setError('')
    setMessage('')
    try {
      const next = await verifyAccountEmail(pending.email, code, pending.mode)
      setCode('')
      await reloadAccount({
        ownerId: next.ownerId,
        message: 'Email connected. Your local profiles are still in place.',
      })
    } catch (cause) {
      if (mounted.current && actionRevision === revision.current) setError(accountError(cause))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault()
    if (busy || !account?.verified || !account.preferencesAvailable) return
    const actionRevision = revision.current
    const ownerId = account.ownerId
    setBusy('preferences')
    setError('')
    setMessage('')
    try {
      await saveAccountPreferences({ newsOptIn, testerOptIn }, ownerId)
      await reloadAccount({ ownerId, message: 'Your email choices have been saved.' })
    } catch (cause) {
      if (mounted.current && actionRevision === revision.current) setError(accountError(cause))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  async function signOut() {
    if (busy || !account) return
    const actionRevision = revision.current
    setBusy('sign_out')
    setError('')
    setMessage('')
    try {
      await signOutPlayerAccount(account.ownerId)
      setEmail('')
      setCode('')
      setMode('connect')
      await reloadAccount({
        signedOut: true,
        message: 'Signed out on this device. Your local profiles are still here.',
      })
    } catch (cause) {
      if (mounted.current && actionRevision === revision.current) setError(accountError(cause))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const verified = account?.verified === true
  const preferencesChanged =
    newsOptIn !== account?.newsOptIn || testerOptIn !== account?.testerOptIn

  return (
    <section className="player-account" aria-labelledby="player-account-title">
      <header className="player-account__header">
        <GameBackButton label="Back to profiles" onClick={goBack} />
        <div>
          <p className="game-ui-eyebrow">Your connection</p>
          <h1 id="player-account-title">Account &amp; email</h1>
        </div>
      </header>

      <p className="player-account__intro">
        One optional email for the profiles on this device. Playing as a guest is always an option.
      </p>

      <div className="player-account__panel game-ui-surface" aria-busy={busy != null}>
        <div className="player-account__identity">
          <span className="player-account__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7 8 6 8-6" />
            </svg>
          </span>
          <span
            className={`player-account__status${verified ? ' player-account__status--verified' : ''}`}
          >
            {loadState === 'loading'
              ? 'Checking connection'
              : verified
                ? 'Email verified'
                : pending
                  ? 'Check your inbox'
                  : 'Optional connection'}
          </span>
        </div>

        {!configured ? (
          <>
            <h2>Keep playing your way</h2>
            <p className="player-account__copy">
              Email connection is not available in this version yet. Your local profiles and guest
              play are still available.
            </p>
            <button
              type="button"
              className="game-button game-button--secondary player-account__wide"
              onClick={goBack}
            >
              Back to profiles
            </button>
          </>
        ) : loadState === 'loading' ? (
          <p className="player-account__copy" role="status">
            Checking your account…
          </p>
        ) : loadState === 'error' ? (
          <button
            type="button"
            className="game-button game-button--secondary player-account__wide"
            onClick={retryLoad}
          >
            Try again
          </button>
        ) : verified ? (
          <>
            <h2>Your email is connected</h2>
            <p className="player-account__email">{account.email}</p>

            {account.preferencesAvailable ? (
              <form
                className="player-account__preferences"
                onSubmit={(event) => void savePreferences(event)}
              >
                <fieldset disabled={busy != null}>
                  <legend>Your inbox, your choice</legend>
                  <p className="player-account__copy">
                    Both choices are optional. Connecting your email does not subscribe you.
                  </p>
                  <label className="player-account__choice">
                    <input
                      type="checkbox"
                      checked={newsOptIn}
                      onChange={(event) => {
                        setNewsOptIn(event.target.checked)
                        setMessage('')
                      }}
                    />
                    <span>
                      <strong>Game news</strong>
                      <small>Email me about new features and updates.</small>
                    </span>
                  </label>
                  <label className="player-account__choice">
                    <input
                      type="checkbox"
                      checked={testerOptIn}
                      onChange={(event) => {
                        setTesterOptIn(event.target.checked)
                        setMessage('')
                      }}
                    />
                    <span>
                      <strong>Playtest invitations</strong>
                      <small>Invite me to try features and share feedback.</small>
                    </span>
                  </label>
                  <button
                    type="submit"
                    className="game-button game-button--primary player-account__wide"
                    disabled={!preferencesChanged}
                  >
                    {busy === 'preferences' ? 'Saving…' : 'Save email choices'}
                  </button>
                </fieldset>
              </form>
            ) : (
              <p className="player-account__notice" role="status">
                Your email is connected, but email choices are unavailable right now. Please try
                again later.
              </p>
            )}

            <button
              type="button"
              className="player-account__text-button game-ui-focusable"
              disabled={busy != null}
              onClick={() => void signOut()}
            >
              {busy === 'sign_out' ? 'Signing out…' : 'Sign out on this device'}
            </button>
            <p className="player-account__sign-out-note">
              {account.preferencesAvailable
                ? 'Signing out keeps your email choices. You can turn either choice off above.'
                : 'Signing out does not change your email choices.'}
            </p>
          </>
        ) : pending ? (
          <form onSubmit={(event) => void verifyCode(event)}>
            <h2>Check your inbox</h2>
            <p className="player-account__copy">
              Enter the verification code sent to <strong>{pending.email}</strong>.
            </p>
            {pending.mode === 'sign_in' && (
              <p className="player-account__notice">
                Signing in connects this device&apos;s existing local profiles to that account.
              </p>
            )}
            <label className="player-account__label" htmlFor="account-code">
              Verification code
            </label>
            <input
              id="account-code"
              className="player-account__input player-account__input--code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              minLength={6}
              maxLength={10}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))}
              disabled={busy != null}
              aria-describedby="account-code-help"
              required
            />
            <p id="account-code-help" className="player-account__hint">
              Use the code from your most recent email.
            </p>
            <button
              type="submit"
              className="game-button game-button--primary player-account__wide"
              disabled={busy != null || !/^\d{6,10}$/.test(code)}
            >
              {busy === 'verify' ? 'Verifying…' : 'Verify email'}
            </button>
            <div className="player-account__secondary-actions">
              <button
                type="button"
                className="player-account__text-button game-ui-focusable"
                disabled={busy != null}
                onClick={() => void sendCode()}
              >
                {busy === 'send' ? 'Sending…' : 'Send a new code'}
              </button>
              <button
                type="button"
                className="player-account__text-button game-ui-focusable"
                disabled={busy != null}
                onClick={() => {
                  clearPendingAccountEmail()
                  setPending(null)
                  setCode('')
                  setError('')
                  setMessage('')
                }}
              >
                Use another email
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => void sendCode(event)}>
            <h2>{mode === 'connect' ? 'Connect your email' : 'Welcome back'}</h2>
            <p className="player-account__copy">
              {mode === 'connect'
                ? 'Connect an email to access the same account later. No password needed.'
                : 'Sign in with the email you previously connected.'}
            </p>
            {mode === 'sign_in' && (
              <p className="player-account__notice">
                Signing in connects this device&apos;s existing local profiles to that account.
                Their saved seasons, photos and Eyeoleans stay on this device.
              </p>
            )}
            <label className="player-account__label" htmlFor="account-email">
              Email address
            </label>
            <input
              id="account-email"
              className="player-account__input"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy != null}
              required
            />
            <p className="player-account__hint">We will email you a verification code.</p>
            <button
              type="submit"
              className="game-button game-button--primary player-account__wide"
              disabled={busy != null || !email.trim()}
            >
              {busy === 'send' ? 'Sending…' : 'Send verification code'}
            </button>
            <button
              type="button"
              className="player-account__text-button game-ui-focusable"
              disabled={busy != null}
              onClick={() => {
                setMode(mode === 'connect' ? 'sign_in' : 'connect')
                setError('')
                setMessage('')
              }}
            >
              {mode === 'connect' ? 'Already connected? Sign in' : 'Connect a new email instead'}
            </button>
          </form>
        )}

        {error && (
          <p className="player-account__feedback player-account__feedback--error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="player-account__feedback" role="status">
            {message}
          </p>
        )}
      </div>

      <p className="player-account__device-note">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="6" y="2" width="12" height="20" rx="3" />
          <path d="M10 18h4" />
        </svg>
        <span>
          Your saved seasons, photos and Eyeoleans stay on this device. Email connection does not
          transfer them.
        </span>
      </p>
    </section>
  )
}
