import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ageBandForAge, declarePlayerAge } from '../../safety/playerSafety'
import { usePlayerSafety } from '../../safety/usePlayerSafety'
import {
  checkAdMobAvailability,
  hasAdMobPrivacyOptions,
  openAdMobPrivacyOptions,
} from './admobBridge'
import { getAdAvailabilityMessage, subscribeAdAvailability } from './adAvailability'
import '../../safety/PlayerSafetyScreen.css'

export default function AdvertisingPrivacy() {
  const navigate = useNavigate()
  const location = useLocation()
  const openedFromSettings =
    (location.state as { fromSettings?: boolean } | null)?.fromSettings === true
  const returnToCompetition = (location.state as { returnTo?: string } | null)?.returnTo === '/game'
  const record = usePlayerSafety()
  const [age, setAge] = useState('')
  const [notice, setNotice] = useState('')
  const [checking, setChecking] = useState(false)
  const availabilityMessage = useSyncExternalStore(
    subscribeAdAvailability,
    getAdAvailabilityMessage
  )
  function submitAge(event: FormEvent) {
    event.preventDefault()
    if (!declarePlayerAge(age)) setNotice('Your choice could not be saved. Please try again.')
    setAge('')
  }
  return (
    <main className="player-safety">
      <section className="player-safety__card" aria-labelledby="advertising-privacy-title">
        <p className="player-safety__eyebrow">THE BIG EYE</p>
        <h1 id="advertising-privacy-title">Advertising privacy</h1>
        {!record ? (
          <form onSubmit={submitAge}>
            <p>
              Enter your real age, rather than your character’s age. We keep only an age group on
              this device.
            </p>
            <label htmlFor="advertising-player-age">Your age</label>
            <input
              id="advertising-player-age"
              type="number"
              min="0"
              max="120"
              step="1"
              required
              value={age}
              onChange={(event) => setAge(event.target.value)}
            />
            <button type="submit" disabled={ageBandForAge(age) === null}>
              Continue
            </button>
          </form>
        ) : record.ageBand === 'adult' ? (
          <>
            <p>
              Standard play includes automatic ad breaks. No Ads and VIP remove those breaks.
              Rewarded ads are optional: choose Watch Ad when you want a reward.
            </p>
            <p>
              Google may receive device information, your IP address, and ad interactions. Manage
              Google's privacy choices below. Ads are subject to availability and privacy
              requirements.
            </p>
            <p role="status">
              {availabilityMessage ??
                'Ad rewards are subject to availability. Google privacy setup is checked before live ads.'}
            </p>
            <button
              type="button"
              className="player-safety__secondary"
              disabled={checking}
              onClick={() => {
                setChecking(true)
                setNotice('')
                void checkAdMobAvailability()
                  .then((message) => {
                    setNotice(
                      message ?? 'Advertising setup is ready. You can return to your reward.'
                    )
                  })
                  .finally(() => setChecking(false))
              }}
            >
              {checking ? 'Checking advertising…' : 'Check advertising setup'}
            </button>
            {hasAdMobPrivacyOptions() && (
              <button
                type="button"
                className="player-safety__secondary"
                onClick={() => {
                  void openAdMobPrivacyOptions().catch(() =>
                    setNotice(
                      'Google privacy choices are unavailable right now. Please try again later.'
                    )
                  )
                }}
              >
                Advertising privacy choices
              </button>
            )}
          </>
        ) : (
          <p>Advertising and Survival run purchases are unavailable for players under 18.</p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="player-safety__actions">
          <a
            href={`${import.meta.env.BASE_URL}legal/privacy-policy.html`}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
          <button
            type="button"
            className="player-safety__secondary"
            onClick={() => {
              if (returnToCompetition) navigate('/game', { replace: true })
              else if (openedFromSettings) navigate(-1)
              else navigate('/settings', { replace: true })
            }}
          >
            {returnToCompetition ? 'Back to competition' : 'Back to settings'}
          </button>
        </div>
      </section>
    </main>
  )
}
