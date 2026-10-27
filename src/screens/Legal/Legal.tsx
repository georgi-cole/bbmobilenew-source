import { useNavigate } from 'react-router'
import GameBackButton from '../../components/ui/GameBackButton/GameBackButton'
import './Legal.css'

function externalUrl(value: string | undefined): string | null {
  const url = value?.trim()
  return url && /^https:\/\//i.test(url) ? url : null
}

const privacyUrl =
  externalUrl(import.meta.env.VITE_PRIVACY_POLICY_URL) ??
  `${import.meta.env.BASE_URL}legal/privacy-policy.html`
const termsUrl =
  externalUrl(import.meta.env.VITE_TERMS_URL) ??
  'https://georgi-cole.github.io/big-eye-legal/terms-of-use.html'
const supportUrl =
  externalUrl(import.meta.env.VITE_SUPPORT_URL) ??
  'https://georgi-cole.github.io/big-eye-legal/support.html'

export default function Legal() {
  const navigate = useNavigate()

  return (
    <main className="legal-screen">
      <header className="legal-screen__header">
        <GameBackButton onClick={() => navigate(-1)} />
        <div>
          <p>THE BIG EYE</p>
          <h1>Privacy, terms &amp; support</h1>
        </div>
      </header>

      <section>
        <h2>Privacy summary</h2>
        <p>
          Saves, settings, profiles, optional profile images, season history, and local Confessional
          history are stored on your device. Resetting the game or uninstalling the app removes this
          local data.
        </p>
        <p>
          When the online backend is enabled, profile display names, avatars, selected appearance,
          achievements, and unlock progress are automatically backed up to Supabase. Gameplay events
          include a profile ID so they can be joined to the matching profile backup; events record
          screen visits and visible time, game modes and days reached, minigame duration, placements
          and exits, Social usage and action categories, selected gameplay decisions, elimination
          timing and season placement, marketplace product choices and purchase outcomes, and
          session time. Purchase prices are not collected. Photos, biographies, and conversation
          text are not sent. The anonymous backup is tied to this installation and cannot yet be
          restored on another device. Contact support for data access or deletion requests.
        </p>
        <p>
          Location is optional. If you allow it, coordinates are sent to Open-Meteo to request
          current weather and choose a matching background. The game does not use location for
          advertising or tracking and does not intentionally retain coordinates after that request.
        </p>
        <p>Confessional text is processed on-device. It is not sent to Supabase.</p>
        {privacyUrl && (
          <a href={privacyUrl} target="_blank" rel="noreferrer">
            Open the full privacy policy
          </a>
        )}
      </section>

      <section>
        <h2>Terms of use</h2>
        <p>
          The Big Eye is an entertainment game. Virtual outcomes, rankings, currencies, and chance
          mechanics have no real-world monetary value. Do not use the game to submit unlawful,
          abusive, or sensitive personal content.
        </p>
        <p>
          Store purchases are one-time, non-consumable digital unlocks. Billing, refunds, and
          account access are handled by Apple or Google under their store terms. Use Restore
          Purchases after reinstalling or changing devices.
        </p>
        {termsUrl && (
          <a href={termsUrl} target="_blank" rel="noreferrer">
            Open the full terms of use
          </a>
        )}
      </section>

      <section>
        <h2>Support</h2>
        <p>
          For purchase, privacy, accessibility, or gameplay help, visit the official support page or
          email kolequant@gmail.com.
        </p>
        {supportUrl && (
          <a href={supportUrl} target="_blank" rel="noreferrer">
            Open support
          </a>
        )}
      </section>

      <p className="legal-screen__version">The Big Eye 1.0.0 · Updated October 27, 2026</p>
    </main>
  )
}
