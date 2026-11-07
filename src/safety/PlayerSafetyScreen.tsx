import { useState, type FormEvent } from 'react'
import {
  acknowledgeGuardianPlayPermission,
  ageBandForAge,
  declarePlayerAge,
  setOptionalPlayerFeature,
  getMinimumPlayAge,
  meetsMinimumPlayAge,
  withdrawGuardianPlayPermission,
  type OptionalPlayerFeature,
} from './playerSafety'
import { usePlayerSafety } from './usePlayerSafety'
import { requestVerifiedParentalConsent } from './parentalConsent'
import LocalProfileRemoval from './LocalProfileRemoval'
import CloudBackupControls from '../services/backend/CloudBackupControls'
import { hasAdMobPrivacyOptions, openAdMobPrivacyOptions } from '../services/ads/admobBridge'
import './PlayerSafetyScreen.css'

const FEATURES: Array<{ key: OptionalPlayerFeature; title: string; description: string }> = [
  {
    key: 'location',
    title: 'Weather from my location',
    description:
      'Request device location and send coordinates to Open-Meteo for background weather. You can play without this.',
  },
  {
    key: 'analytics',
    title: 'Optional usage measurement',
    description:
      'Send screen and game events with a session identifier to the configured measurement service. No profile text or photos are included.',
  },
  {
    key: 'onlineServices',
    title: 'Optional online services',
    description:
      'Allow connected Diary Room and result services, when available. Online Diary Room requests can include your display name, messages, and game context.',
  },
  {
    key: 'ads',
    title: 'Optional advertising',
    description:
      'Allow Google AdMob advertising in supported mobile builds. Google may receive device information, your IP address, and ad interactions. You can play without this.',
  },
]

export default function PlayerSafetyScreen({
  settings = false,
  parent = false,
}: {
  settings?: boolean
  parent?: boolean
}) {
  const record = usePlayerSafety()
  const [age, setAge] = useState('')
  const [parentView, setParentView] = useState(parent)
  const [permission, setPermission] = useState(false)
  const [notice, setNotice] = useState('')
  const under13 = record?.ageBand === 'under13'
  const teen = record && record.ageBand !== 'adult' && !under13
  const belowMinimum = Boolean(record && !meetsMinimumPlayAge(record))

  function submitAge(event: FormEvent) {
    event.preventDefault()
    if (ageBandForAge(age) === null) setNotice('Enter a whole age between 0 and 120.')
    else if (!declarePlayerAge(age))
      setNotice(
        'Your privacy choice could not be saved. Check that device storage is available, then try again. Play remains locked.'
      )
    setAge('')
  }

  async function startParentVerification() {
    try {
      await requestVerifiedParentalConsent()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Parent verification is unavailable. Play remains locked.'
      )
    }
  }

  return (
    <main className="player-safety">
      <section className="player-safety__card" aria-labelledby="player-safety-title">
        <p className="player-safety__eyebrow">THE BIG EYE</p>
        <h1 id="player-safety-title">
          {!record
            ? 'Before you play'
            : under13 || parentView
              ? 'For parents and guardians'
              : belowMinimum
                ? `This version is for ages ${getMinimumPlayAge()}+`
                : teen && !record.guardianPlayPermission
                  ? 'Ask your parent or guardian'
                  : 'Player privacy & family'}
        </h1>
        {!record ? (
          <form onSubmit={submitAge}>
            <p>
              Tell us your age so we can choose the right privacy settings. Enter your real age,
              rather than your character’s age.
            </p>
            <label htmlFor="player-real-age">Your age</label>
            <input
              id="player-real-age"
              type="number"
              inputMode="numeric"
              min="0"
              max="120"
              step="1"
              required
              value={age}
              onChange={(event) => setAge(event.target.value)}
              autoComplete="off"
            />
            <p className="player-safety__detail">
              This check keeps only an age group on this device. It is a self-declaration; it does
              not verify your identity.
            </p>
            <button type="submit" disabled={!age.trim() || ageBandForAge(age) === null}>
              Continue
            </button>
          </form>
        ) : under13 || parentView ? (
          <>
            <p>
              {under13
                ? 'Play is unavailable for this player. Verified parental consent and the minimum player age would both have to permit access.'
                : 'Review this player’s access and privacy choices together.'}
            </p>
            <p>
              Verified parent approval is not available in this version. A checkbox, store purchase,
              or a child saying that a parent agreed cannot unlock under-13 play.
            </p>
            <p>
              We are not collecting a parent’s email, payment details, identity documents, or a
              child’s profile through this screen. Any future approval will also depend on the
              game’s content rating and local requirements.
            </p>
            <button type="button" onClick={() => void startParentVerification()}>
              Check parent verification availability
            </button>
            {!under13 && (
              <button
                type="button"
                className="player-safety__secondary"
                onClick={() => setParentView(false)}
              >
                Back to player privacy
              </button>
            )}
          </>
        ) : belowMinimum ? (
          <>
            <p>
              This version has a minimum player age of {getMinimumPlayAge()}. A parent’s permission
              cannot override this access restriction.
            </p>
            <p>
              Play, optional data sharing, advertising, and store requests remain unavailable. The
              release’s store content rating and local rules may impose further restrictions.
            </p>
            <button
              type="button"
              className="player-safety__secondary"
              onClick={() => setParentView(true)}
            >
              Parent information
            </button>
          </>
        ) : teen && !record.guardianPlayPermission ? (
          <>
            <p>
              Please ask your parent or legal guardian to review the game’s store age rating and the
              information below before you play.
            </p>
            <p>
              For teen players, location sharing, usage measurement, online Diary Room services,
              advertising, and store purchase or restore requests are unavailable. Gameplay and
              saves use this device.
            </p>
            <label className="player-safety__check">
              <input
                type="checkbox"
                checked={permission}
                onChange={(event) => setPermission(event.target.checked)}
              />
              <span>
                I am this player’s parent or legal guardian, and I give permission for local play.
              </span>
            </label>
            <p className="player-safety__detail">
              This records household permission. It does not verify a parent’s identity or provide
              consent for online processing of a child’s personal information.
            </p>
            <button
              type="button"
              disabled={!permission}
              onClick={acknowledgeGuardianPlayPermission}
            >
              Allow local play
            </button>
            <button
              type="button"
              className="player-safety__secondary"
              onClick={() => setNotice('Permission has not been given. Play remains locked.')}
            >
              Do not allow
            </button>
          </>
        ) : (
          <>
            <p>
              {record.ageBand === 'adult'
                ? 'Optional features start off. Choose each feature separately and switch it off here at any time.'
                : 'Teen privacy protections are on. Optional data sharing, advertising, purchases, and restoration remain unavailable.'}
            </p>
            {record.ageBand === 'adult' &&
              FEATURES.map((feature) => (
                <label className="player-safety__check" key={feature.key}>
                  <input
                    type="checkbox"
                    checked={record.optionalFeatures[feature.key]}
                    onChange={(event) =>
                      setOptionalPlayerFeature(feature.key, event.target.checked)
                    }
                  />
                  <span>
                    <strong>{feature.title}</strong>
                    <small>{feature.description}</small>
                  </span>
                </label>
              ))}
            <CloudBackupControls />
            {record.ageBand === 'adult' && hasAdMobPrivacyOptions() && (
              <button
                type="button"
                className="player-safety__secondary"
                onClick={() => {
                  void openAdMobPrivacyOptions().catch((error: unknown) => {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : 'Advertising privacy options are unavailable right now.'
                    )
                  })
                }}
              >
                Advertising privacy choices
              </button>
            )}
            {teen && (
              <button type="button" onClick={withdrawGuardianPlayPermission}>
                Withdraw permission for local play
              </button>
            )}
            <button
              type="button"
              className="player-safety__secondary"
              onClick={() => setParentView(true)}
            >
              Parent information
            </button>
            {settings && (
              <a className="player-safety__back" href="#/settings">
                Back to settings
              </a>
            )}
          </>
        )}
        {notice && (
          <p role="status" className="player-safety__notice">
            {notice}
          </p>
        )}
        <details>
          <summary>Privacy, saved data, and help</summary>
          <p>
            We keep your age group and permission choices on this device. A lower age declaration
            cannot be replaced by choosing an older age or switching to guest mode. Parent
            verification and age corrections require a future verified service.
          </p>
          <p>
            Profiles, photos, and saves stay on your device unless you separately enable a disclosed
            online feature. Parents can ask for privacy help without sending a child’s name, photo,
            or date of birth.
          </p>
          <LocalProfileRemoval />
          <a
            href={`${import.meta.env.BASE_URL}legal/privacy-policy.html`}
            target="_blank"
            rel="noreferrer"
          >
            Privacy policy
          </a>
          <a
            href={`${import.meta.env.BASE_URL}legal/terms-of-use.html`}
            target="_blank"
            rel="noreferrer"
          >
            Terms of use
          </a>
          <p>
            Parent or guardian support: <a href="mailto:kolequant@gmail.com">kolequant@gmail.com</a>
          </p>
        </details>
      </section>
    </main>
  )
}
