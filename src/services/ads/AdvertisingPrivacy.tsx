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
      <section className="player-safety__card" aria-labelledby="player-privacy-title">
        <p className="player-safety__eyebrow">THE BIG EYE</p>
        <h1 id="player-privacy-title">Player privacy &amp; family</h1>
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
                checked={record.optionalFeatures.onlineServices}
                onChange={(event) =>
                  setOptionalPlayerFeature('onlineServices', event.target.checked)
                }
              />
              <span>
                <strong>Cloud profile backup</strong>
                <small>
                  Sync your profile name, avatar, appearance, achievements, and unlock progress to
                  Supabase. Seasons and saves remain on this device. Turning this off stops future
                  sync; delete the profile or contact support to remove its online copy.
                </small>
              </span>
            </label>
            <label className="player-safety__check">
              <input
                type="checkbox"
                checked={record.optionalFeatures.analytics}
                onChange={(event) => setOptionalPlayerFeature('analytics', event.target.checked)}
              />
              <span>
                <strong>Optional usage measurement</strong>
                <small>
                  Send pseudonymous gameplay and session events to Supabase to understand which
                  features are used. Events can be linked to this profile. No profile photos,
                  biographies, or Confessional text are included. Turning this off clears events
                  that have not been sent.
                </small>
              </span>
            </label>
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
                  information, your IP address, approximate location, diagnostics, and ad
                  interactions. You can switch this off at any time.
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
          <p>
            Cloud profile backup, usage measurement, and advertising are available only to adults.
            Your local game can still be played without enabling them.
          </p>
        )}
        {record?.ageBand === 'adult' && (
          <p className="player-safety__detail">
            Weather location is requested separately. If allowed, the device provides location for a
            weather lookup and matching background. The app rounds coordinates to an about 11 km
            area before sending them through The Big Eye's proxy to MET Norway. You can deny or
            revoke location in device settings.
          </p>
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
