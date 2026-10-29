import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  ageBandForAge,
  declarePlayerAge,
  setOptionalPlayerFeature,
} from '../../safety/playerSafety'
import { usePlayerSafety } from '../../safety/usePlayerSafety'
import { hasAdMobPrivacyOptions, openAdMobPrivacyOptions } from './admobBridge'
import '../../safety/PlayerSafetyScreen.css'

export default function AdvertisingPrivacy() {
  const navigate = useNavigate()
  const location = useLocation()
  const openedFromSettings =
    (location.state as { fromSettings?: boolean } | null)?.fromSettings === true
  const record = usePlayerSafety()
  const [age, setAge] = useState('')
  const [notice, setNotice] = useState('')
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
            <label className="player-safety__check">
              <input
                type="checkbox"
                checked={record.optionalFeatures.ads}
                onChange={(event) => setOptionalPlayerFeature('ads', event.target.checked)}
              />
              <span>
                <strong>Optional advertising</strong>
                <small>
                  Allow Google AdMob ads in supported mobile builds. Google may receive device
                  information, your IP address, and ad interactions. You can switch this off at any
                  time.
                </small>
              </span>
            </label>
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
          <p>Advertising is unavailable for players under 18.</p>
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
              if (openedFromSettings) navigate(-1)
              else navigate('/settings', { replace: true })
            }}
          >
            Back to settings
          </button>
        </div>
      </section>
    </main>
  )
}
