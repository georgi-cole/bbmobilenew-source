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
          Cloud profile backup and usage measurement are separate adult-only choices in Player
          privacy &amp; family. If enabled, a profile backup sends its display name, avatar,
          selected appearance, achievements, and unlock progress to Supabase. It does not back up
          seasons or game saves. Turning backup off stops future uploads; delete the profile or
          contact support to remove its online copy. If usage measurement is enabled, pseudonymous
          gameplay events are sent to Supabase. They record screen visits and visible time, game
          modes and days reached, minigame duration, placements and exits, Social usage and action
          categories, selected gameplay decisions, elimination timing and season placement,
          marketplace product choices and purchase outcomes, and session time. Saved-profile events
          include the profile ID and can be joined to the matching profile backup. Session events
          also include broad device type and family, operating system, and browser; an exact device
          model is included only when the browser provides it. A full browser user-agent string is
          not sent. Events carry a build label (QA, production, or development) so test activity can
          be distinguished. Purchase prices are not collected. Photos, biographies, and conversation
          text are not sent. Turning measurement off clears unsent events and stops new events.
          Guest activity uses a separate installation identifier without a profile ID; it is not
          retroactively merged into a profile when you create one. Saved seasons and other
          device-only data cannot yet be restored on another device. Contact support for data access
          or deletion requests.
        </p>
        <p>
          Email is optional when creating or editing a profile. It is stored privately in Supabase
          with that profile's contact preference, separately from game saves and analytics events.
          It is an unverified contact address, not a login. The optional, initially unchecked box
          subscribes you to The Big Eye news and playtest invitations. You can change this choice in
          Edit Profile or use the unsubscribe link in an email. Clearing the field removes the
          address and turns off this profile's subscription. Authorized administrators can view
          profile contact preferences alongside broad activity groups. Adding an email never
          automatically subscribes you or combines profiles that share an address.
        </p>
        <p>
          Weather location is optional and requested separately from these settings. If you allow
          it, the app rounds the device location to a 0.1° area (about 11 km north-south) before
          sending it through The Big Eye's Cloudflare weather proxy. The proxy requests current
          conditions from MET Norway and caches the rounded area and response for at least three
          hours, honoring a later provider expiry and using the provider's last-modified time when
          refreshing. Cloudflare receives the request's IP address; MET Norway receives the rounded
          coordinates through Cloudflare rather than your device IP. The game does not use this data
          for advertising or tracking. Weather data is from{' '}
          <a href="https://api.met.no/" target="_blank" rel="noreferrer">
            MET Norway
          </a>{' '}
          under its open-data licence.
        </p>
        <p>
          Native mobile builds include Google AdMob and its User Messaging Platform. Advertising is
          optional and available only to adults who enable it in Player privacy &amp; family. Google
          may process device identifiers, IP-derived approximate location, ad interactions, and
          diagnostics when ads are requested. Requests are configured as non-personalized; this does
          not mean the SDK collects no data. Google consent choices are available in Settings.
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

      <p className="legal-screen__version">The Big Eye 1.0.0 · Updated November 7, 2026</p>
    </main>
  )
}
