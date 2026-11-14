import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import { usePlayerSafety } from '../../safety/usePlayerSafety'
import { isPlayerSignInConfigured, isPlayerSignInPreview } from '../../services/backend/config'
import {
  deletePlayerAccount,
  observePlayerAccount,
  playerSignInError,
  requestPlayerEmailCode,
  signOutPlayer,
  startPlayerOAuth,
  verifyPlayerEmailCode,
  type PlayerAccount as Account,
  type PlayerSignInProvider,
} from '../../services/backend/playerSignIn'
import {
  getAccountProfileSyncStatus,
  retryAccountProfileSync,
  subscribeAccountProfileSync,
} from '../../services/backend/playerAccountProfiles'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  MAX_PROFILES,
  selectAllProfiles,
  selectIsGuest,
  unlinkProfileFromPlayerAccount,
} from '../../store/profilesSlice'
import appleButton from './sign-in-assets/sign-in-with-apple.png'
import googleButton from './sign-in-assets/sign-in-with-google.png'
import './PlayerAccount.css'

export default function PlayerAccount() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as {
    signInError?: string
    profileFrom?: string
    pickerFrom?: string
    entryFrom?: '/' | '/game'
  } | null
  const dispatch = useAppDispatch()
  const profiles = useAppSelector(selectAllProfiles)
  const isGuest = useAppSelector(selectIsGuest)
  const hasSelectedProfile = useAppSelector(({ profiles }) => Boolean(profiles.activeProfileId))
  const entryReturnTo = routeState?.entryFrom ?? routeState?.profileFrom ?? '/'
  const returnDirectly = Boolean(routeState?.entryFrom || (!hasSelectedProfile && !isGuest))
  const gameInProgress = useAppSelector(
    ({ game }) =>
      game.status === 'active' ||
      game.week > 1 ||
      (game.phase !== 'season_start' && game.phase !== 'week_start')
  )
  const safety = usePlayerSafety()
  const configured = isPlayerSignInConfigured()
  const preview = isPlayerSignInPreview()
  const eligible = !safety || safety.ageBand === 'adult'
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [manualAppleRevocation, setManualAppleRevocation] = useState(false)
  const linkedProfiles = account
    ? profiles.filter((entry) => entry.playerAccountId === account.id)
    : []
  const [profileSyncStatus, setProfileSyncStatus] = useState(getAccountProfileSyncStatus())
  const signInError = error || routeState?.signInError

  useEffect(() => {
    if (!configured || !eligible || preview) return
    let stopped = false
    let unsubscribe: (() => void) | undefined
    void observePlayerAccount((next) => {
      if (!stopped) setAccount(next)
    })
      .then((stop) => {
        if (stopped) stop()
        else unsubscribe = stop
      })
      .catch(() => {
        if (!stopped) {
          setAccount(null)
          setError('Account sign-in is unavailable right now.')
        }
      })
    return () => {
      stopped = true
      unsubscribe?.()
    }
  }, [configured, eligible, preview])

  useEffect(
    () => subscribeAccountProfileSync(() => setProfileSyncStatus(getAccountProfileSyncStatus())),
    []
  )

  function clearError() {
    setError('')
    if (routeState?.signInError) void navigate(location.pathname, { replace: true, state: null })
  }

  async function run(operation: () => Promise<void>, failure: string) {
    if (busy) return
    setBusy(true)
    setMessage('')
    clearError()
    setManualAppleRevocation(false)
    try {
      await operation()
    } catch (cause) {
      setError(playerSignInError(cause, failure))
    } finally {
      setBusy(false)
    }
  }

  function closeEmailForm() {
    setEmailOpen(false)
    setEmail('')
    setSentTo('')
    setCode('')
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (preview) {
      setMessage('This is a local preview. Live email delivery needs to be configured.')
      return
    }
    if (sentTo) {
      void run(async () => {
        await verifyPlayerEmailCode(sentTo, code)
        closeEmailForm()
      }, 'Could not verify that code. Check it and try again.')
      return
    }
    const address = email.trim().toLowerCase()
    void run(async () => {
      await requestPlayerEmailCode(address)
      setSentTo(address)
    }, 'Could not send a sign-in code. Check your email address and try again.')
  }

  function chooseProvider(provider: PlayerSignInProvider) {
    if (preview) {
      const label = provider === 'apple' ? 'Apple' : 'Google'
      setMessage(`This is a local preview. Live ${label} sign-in needs to be configured.`)
      return
    }
    void run(() => startPlayerOAuth(provider), 'Could not open sign-in. Please try again.')
  }

  function createGameProfile() {
    void navigate('/profile/dressing-room', {
      state: {
        createProfile: true,
        adoptGuestRun: isGuest && gameInProgress,
        fromPlayerAccount: true,
        playerAccountId: account?.id,
      },
    })
  }

  function playWithoutSigningIn() {
    if (profiles.length === 0) {
      void navigate('/profile/dressing-room', {
        state: {
          from: entryReturnTo,
          createProfile: true,
          adoptGuestRun: isGuest && gameInProgress,
        },
      })
      return
    }
    void navigate('/profile-picker', {
      state: {
        from: entryReturnTo,
        ...(profiles.length === 1 && { autoSelectSingle: true }),
      },
    })
  }

  function deleteAccount() {
    setConfirmDelete(false)
    if (!account) return
    void run(async () => {
      const result = await deletePlayerAccount(account.id)
      for (const linkedProfile of linkedProfiles)
        dispatch(
          unlinkProfileFromPlayerAccount({ profileId: linkedProfile.id, accountId: account.id })
        )
      setAccount(null)
      closeEmailForm()
      setMessage('Your sign-in account was deleted.')
      setManualAppleRevocation(result.appleNeedsManualRevocation)
    }, 'Could not delete the account. Check your connection and try again.')
  }

  return (
    <div className="player-account">
      <section
        className="confirm-modal__card player-account__card"
        aria-labelledby="player-account-title"
        aria-busy={busy}
      >
        <header className="player-account__header">
          <span className="player-account__seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.75" />
            </svg>
          </span>
          <p className="player-account__eyebrow">{preview ? 'LOCAL PREVIEW' : 'PLAYER ACCOUNT'}</p>
          <h1 id="player-account-title">{account ? 'Your account' : 'Account sign-in'}</h1>
        </header>
        {signInError && <p role="alert">{signInError}</p>}
        {message && <p role="status">{message}</p>}
        {manualAppleRevocation && (
          <p>
            To remove The Big Eye from your Apple sign-in list, open{' '}
            <a href="https://support.apple.com/102571" target="_blank" rel="noreferrer">
              Apple’s sign-in settings guide
            </a>
            .
          </p>
        )}
        {!configured || !eligible ? (
          <p>Account sign-in is unavailable. You can play with a local profile or as a guest.</p>
        ) : account === undefined && !preview ? (
          <p role="status">Checking sign-in…</p>
        ) : account ? (
          <>
            <p className="player-account__email">Signed in as {account.email}</p>
            {profileSyncStatus === 'synced' && profiles.length === 0 && (
              <>
                <h2>Finish your game profile</h2>
                <p>Choose your character to get started.</p>
              </>
            )}
            {profiles.length < MAX_PROFILES && (
              <button
                type="button"
                className="game-button game-button--primary"
                disabled={busy || profileSyncStatus !== 'synced'}
                onClick={createGameProfile}
              >
                {profiles.length === 0 ? 'Create Profile' : 'Create another profile'}
              </button>
            )}
            {profiles.length > 0 && (
              <button
                type="button"
                className="game-button game-button--secondary"
                onClick={() =>
                  navigate('/profile-picker', {
                    state: { from: '/profile/account', manageOnly: true },
                  })
                }
              >
                Manage profiles
              </button>
            )}
            {profileSyncStatus === 'syncing' && <p role="status">Syncing profiles…</p>}
            {profileSyncStatus === 'synced' && <p role="status">Profiles synced.</p>}
            {profileSyncStatus === 'limit' && (
              <p role="status">
                You can sync up to {MAX_PROFILES} profiles. Open Manage profiles to make room.
              </p>
            )}
            {profileSyncStatus === 'error' && (
              <>
                <p role="alert">Couldn’t sync profiles. Check your connection and try again.</p>
                <button
                  type="button"
                  className="game-button game-button--secondary"
                  onClick={retryAccountProfileSync}
                >
                  Retry sync
                </button>
              </>
            )}
            <p className="player-account__detail">
              Profile details sync across devices. Photos and saved games stay on this device.
            </p>
            <button
              type="button"
              className="game-button game-button--secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await signOutPlayer()
                  closeEmailForm()
                  setMessage('Signed out.')
                }, 'Could not finish signing out. Please try again.')
              }
            >
              Sign out
            </button>
            <button
              type="button"
              className="game-button game-button--secondary player-account__delete"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete sign-in account
            </button>
          </>
        ) : emailOpen ? (
          <form onSubmit={submitEmail}>
            {sentTo ? (
              <>
                <p className="player-account__email">Enter the six-digit code sent to {sentTo}.</p>
                <label htmlFor="player-account-code">Sign-in code</label>
                <input
                  id="player-account-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                />
              </>
            ) : (
              <>
                <label htmlFor="player-account-email">Sign-in email</label>
                <input
                  id="player-account-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </>
            )}
            <button type="submit" className="game-button player-account__gold" disabled={busy}>
              {sentTo ? 'Verify and sign in' : 'Send sign-in code'}
            </button>
            <button
              type="button"
              className="game-button game-button--secondary"
              disabled={busy}
              onClick={() => {
                closeEmailForm()
                clearError()
              }}
            >
              Back to sign-in options
            </button>
          </form>
        ) : (
          <>
            <p>Sign in to sync up to three profiles across your devices.</p>
            <div className="player-account__providers">
              <button type="button" disabled={busy} onClick={() => chooseProvider('apple')}>
                <img src={appleButton} alt="Sign in with Apple" width={195} height={44} />
              </button>
              <button type="button" disabled={busy} onClick={() => chooseProvider('google')}>
                <img src={googleButton} alt="Sign in with Google" width={195} height={44} />
              </button>
            </div>
            <button
              type="button"
              className="game-button player-account__gold"
              disabled={busy}
              onClick={() => {
                clearError()
                setEmailOpen(true)
              }}
            >
              Continue with email
            </button>
          </>
        )}
        {(!configured || !eligible || preview || account === null) && !emailOpen && (
          <button
            type="button"
            className="game-button game-button--secondary"
            onClick={playWithoutSigningIn}
          >
            Play without signing in
          </button>
        )}
        <div className="player-account__footer">
          <GameBackButton
            className="player-account__back"
            label={
              routeState?.pickerFrom
                ? 'Back to profiles'
                : returnDirectly
                  ? entryReturnTo === '/game'
                    ? 'Back to game'
                    : 'Back to home'
                  : 'Back to profile'
            }
            disabled={busy}
            onClick={() =>
              routeState?.pickerFrom
                ? navigate('/profile-picker', {
                    replace: true,
                    state: { from: routeState.pickerFrom },
                  })
                : returnDirectly
                  ? navigate(entryReturnTo, { replace: true })
                  : navigate('/profile', {
                      replace: true,
                      state: { from: routeState?.profileFrom ?? '/' },
                    })
            }
          />
          <a
            href={`${import.meta.env.BASE_URL}legal/privacy-policy.html`}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
        </div>
      </section>
      <ConfirmExitModal
        open={confirmDelete && Boolean(account)}
        title="Delete sign-in account?"
        description="This removes your online sign-in account and its synced profile copies. Your on-device profiles and saved games remain on this device."
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        onConfirm={deleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
