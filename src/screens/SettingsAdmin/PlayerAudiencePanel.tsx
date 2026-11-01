import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  AudienceAccessError,
  loadPlayerAudience,
  type AudienceGroup,
  type PlayerAudience,
} from '../../services/backend/audienceService'
import './PlayerAudiencePanel.css'
import { subscribeBackendAuth } from '../../services/backend/supabaseTransport'

const GROUPS: { id: AudienceGroup; label: string; description: string }[] = [
  { id: 'new', label: 'New', description: 'First seen in the last 7 days.' },
  { id: 'returning', label: 'Returning', description: 'Started at least two distinct seasons.' },
  { id: 'completed', label: 'Season finished', description: 'Completed at least one season.' },
  {
    id: 'inactive',
    label: 'Inactive',
    description: 'An unfinished season and no activity for at least 14 days.',
  },
  {
    id: 'tribunal',
    label: 'Tribunal',
    description: 'Accepted the Tribunal invitation or cast a human Tribunal vote.',
  },
  {
    id: 'tester',
    label: 'Testers',
    description: 'Verified account with testing invitations enabled.',
  },
]

type View =
  | { status: 'loading' }
  | { status: 'ready'; audience: PlayerAudience }
  | { status: 'error'; error: AudienceAccessError }

function displayDate(value: string | null) {
  if (!value) return 'No activity yet'
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function PlayerAudiencePanel() {
  const [view, setView] = useState<View>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [group, setGroup] = useState<AudienceGroup | 'all'>('all')
  const [kind, setKind] = useState<'all' | 'guests' | 'profiles'>('all')

  useEffect(() => {
    const controller = new AbortController()
    const unsubscribe = subscribeBackendAuth('profile_backup', () => {
      // Remove contact information immediately if this browser's account changes.
      controller.abort()
      setView({ status: 'loading' })
      setAttempt((value) => value + 1)
    })
    void loadPlayerAudience(controller.signal).then(
      (audience) => {
        if (!controller.signal.aborted) setView({ status: 'ready', audience })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setView({
          status: 'error',
          error:
            error instanceof AudienceAccessError
              ? error
              : new AudienceAccessError(
                  'unavailable',
                  'The player audience could not be loaded. Try again.'
                ),
        })
      }
    )
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [attempt])

  const refresh = () => {
    setView({ status: 'loading' })
    setAttempt((value) => value + 1)
  }
  const audience = view.status === 'ready' ? view.audience : null
  const players = audience?.players.filter(
    (player) =>
      (group === 'all' || player.groups.includes(group)) &&
      (kind === 'all' || (kind === 'guests' ? player.isGuest : !player.isGuest))
  )
  const selectedGroup = GROUPS.find((entry) => entry.id === group)

  return (
    <section className="player-audience game-ui-surface" aria-labelledby="player-audience-title">
      <header className="player-audience__header">
        <div>
          <span className="game-ui-eyebrow">Audience overview</span>
          <h2 id="player-audience-title">Player audience</h2>
          <p>See who starts, returns and stays for the Tribunal.</p>
        </div>
        <button
          type="button"
          className="game-button player-audience__refresh"
          disabled={view.status === 'loading'}
          onClick={refresh}
        >
          {view.status === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {view.status === 'loading' && (
        <p className="player-audience__notice" role="status">
          Loading player records…
        </p>
      )}
      {view.status === 'error' && (
        <div className="player-audience__notice">
          <p role="alert">{view.error.message}</p>
          {view.error.reason === 'access' && (
            <>
              <p>Player information is available only to approved admin accounts.</p>
              <Link className="game-button" to="/account">
                Account &amp; email
              </Link>
            </>
          )}
        </div>
      )}

      {audience && players && (
        <>
          <div className="player-audience__summary">
            <div>
              <strong>{audience.totalPlayers.toLocaleString()}</strong>
              <span>player records</span>
            </div>
            <p>
              Guest or unlinked installations, profiles and accounts. One person can have more than
              one record.
            </p>
          </div>

          <div className="player-audience__filters" aria-label="Player groups">
            <button
              type="button"
              className="player-audience__filter game-ui-focusable"
              aria-pressed={group === 'all'}
              onClick={() => setGroup('all')}
            >
              All <span>{audience.totalPlayers.toLocaleString()}</span>
            </button>
            {GROUPS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="player-audience__filter game-ui-focusable"
                aria-pressed={group === entry.id}
                onClick={() => setGroup(entry.id)}
              >
                {entry.label} <span>{audience.groupCounts[entry.id].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <p className="player-audience__hint">
            {selectedGroup?.description ??
              'Groups can overlap. Counts include all available player records.'}
          </p>

          <div className="player-audience__list-heading">
            <p role="status">
              {players.length.toLocaleString()} {players.length === 1 ? 'record' : 'records'} shown
            </p>
            <label>
              <span>Show</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                <option value="all">All records</option>
                <option value="guests">Guests / unlinked</option>
                <option value="profiles">Profiles / accounts</option>
              </select>
            </label>
          </div>
          {audience.truncated && (
            <p className="player-audience__hint">
              Showing the 500 most recently active records. Group totals cover the full audience;
              filters below apply to the loaded records.
            </p>
          )}
          {players.length === 0 ? (
            <p className="player-audience__empty">No player records match this view yet.</p>
          ) : (
            <ul className="player-audience__list" aria-label="Player records">
              {players.map((player) => (
                <li key={player.id} className="player-audience__player">
                  <div className="player-audience__identity">
                    <span className="game-ui-eyebrow">
                      {player.isGuest
                        ? 'Guest / unlinked'
                        : player.profileId
                          ? 'Saved profile'
                          : 'Account'}
                    </span>
                    <h3>{player.displayName}</h3>
                    <p>
                      {player.verifiedEmail && player.email ? player.email : 'No verified email'}
                    </p>
                    {player.verifiedEmail && (
                      <span className="player-audience__verified">Verified account</span>
                    )}
                  </div>
                  <dl className="player-audience__activity">
                    <div>
                      <dt>Seasons started</dt>
                      <dd>{player.seasonsStarted}</dd>
                    </div>
                    <div>
                      <dt>Finished</dt>
                      <dd>{player.seasonsCompleted}</dd>
                    </div>
                    <div>
                      <dt>
                        {!player.isGuest && player.profileId === null
                          ? 'Account updated'
                          : 'Last activity'}
                      </dt>
                      <dd>{displayDate(player.lastActiveAt)}</dd>
                    </div>
                  </dl>
                  <div className="player-audience__membership">
                    <div className="player-audience__badges">
                      {GROUPS.filter((entry) => player.groups.includes(entry.id)).map((entry) => (
                        <span key={entry.id}>{entry.label}</span>
                      ))}
                    </div>
                    <p>
                      {player.newsOptIn ? 'News enabled' : 'News off'}
                      {' · '}
                      {player.testerOptIn ? 'Test invitations enabled' : 'Test invitations off'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <footer className="player-audience__footnote">
            <p>
              Production activity and older unlabeled records. Known test activity is excluded.
              Older unlinked records may include guests. Guest history stays separate when a profile
              is created. Email preferences belong to the connected account and can apply to several
              profiles.
            </p>
            <p>
              {audience.coverageStart
                ? `Activity available from ${displayDate(audience.coverageStart)}.`
                : 'No recorded activity yet.'}{' '}
              Updated{' '}
              {new Date(audience.generatedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </p>
          </footer>
        </>
      )}
    </section>
  )
}
