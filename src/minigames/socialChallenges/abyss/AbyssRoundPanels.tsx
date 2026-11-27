import { useState, type CSSProperties } from 'react'
import { WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'
import { resolveAvatarCandidates } from '../../../utils/avatar'
import type { GenericMinigameProps } from '../../reactComponents'
import type { ChallengePlayer } from '../shared'
import { formatBalance } from './abyssPresentation'
import type { Abyss } from './abyssRules'

type Transfer = Abyss['transfers'][number]
type PlayerLookups = { players: Map<string, ChallengePlayer>; cinematic: boolean }

function AbyssPortrait({ player }: { player: ChallengePlayer }) {
  const [index, setIndex] = useState(0)
  const image = resolveAvatarCandidates({
    id: player.id,
    name: player.name,
    avatar: player.avatar ?? '',
    isUser: player.isHuman,
  })[index]
  return (
    <span className="abyss-portrait" aria-hidden="true">
      {player.name.slice(0, 1)}
      {image && <img src={image} alt="" decoding="async" onError={() => setIndex((i) => i + 1)} />}
    </span>
  )
}

function playerName(players: Map<string, ChallengePlayer>, id: string) {
  return players.get(id)?.name ?? id
}

function connections(social: GenericMinigameProps, human: string, target: string) {
  const relationship = social.relationships?.[human]?.[target]
  const tags = new Set(relationship?.tags)
  const alliance = social.alliances?.some(
    (group) =>
      (group.status === 'ACTIVE' || group.status === 'PROBATIONARY') &&
      group.memberIds.includes(human) &&
      group.memberIds.includes(target)
  )
  const labels = [
    tags.has('pact') && 'Pact',
    (alliance || tags.has('alliance')) && 'Alliance',
    tags.has('romance') && 'Romance',
    (tags.has('friendship') || tags.has('bromance')) && 'Friendship',
    tags.has('rivalry') && 'Rivalry',
    (tags.has('suspicious') || (relationship?.reality?.suspicion ?? 0) >= 45) && 'Suspicion',
  ].filter(Boolean)
  return labels.length
    ? labels.join(' · ')
    : (relationship?.affinity ?? 0) >= 25
      ? 'Friendly'
      : 'Neutral'
}

interface ChoiceProps extends PlayerLookups {
  game: Abyss
  human: string | undefined
  target: string | undefined
  lastTransfers: readonly Transfer[]
  social: GenericMinigameProps
  spinOutcome: string | undefined
  onSelect: (id: string) => void
  onReveal: () => void
}

export function AbyssChoice({
  game,
  players,
  cinematic,
  human,
  target,
  lastTransfers,
  social,
  spinOutcome,
  onSelect,
  onReveal,
}: ChoiceProps) {
  const balance = human ? game.roundScores[human] : 0
  const prior = lastTransfers.find(({ from }) => from === target)
  const received = lastTransfers.reduce(
    (score, transfer) => score + (transfer.to === target ? transfer.amount : 0),
    0
  )
  return (
    <div className="abyss-panel abyss-choice">
      <h3>{human ? 'Choose who takes it' : 'The seals are set'}</h3>
      {human ? (
        <>
          <p>Pass your entire balance. Everyone’s choices are revealed together.</p>
          {spinOutcome && (
            <p className="abyss-spin-outcome" aria-live="polite">
              {spinOutcome}
            </p>
          )}
          <div className="abyss-balance">
            <span>Balance to pass</span>
            <strong data-debt={balance < 0}>{formatBalance(balance)}</strong>
          </div>
          <div className="abyss-targets" role="group" aria-label="Choose another player">
            {game.active
              .filter((id) => id !== human)
              .map((id) => {
                const player = players.get(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={id === target}
                    onClick={() => onSelect(id)}
                  >
                    {cinematic && player && <AbyssPortrait player={player} />}
                    <span>{playerName(players, id)}</span>
                  </button>
                )
              })}
          </div>
          {target && (
            <div className="abyss-recipient" aria-live="polite">
              <h4>{playerName(players, target)}</h4>
              <dl>
                <div>
                  <dt>Connection</dt>
                  <dd>{connections(social, human, target)}</dd>
                </div>
                <div>
                  <dt>Spun this round</dt>
                  <dd data-debt={game.roundScores[target] < 0}>
                    {formatBalance(game.roundScores[target])}
                  </dd>
                </div>
                <div>
                  <dt>Last handoff</dt>
                  <dd>
                    {prior
                      ? formatBalance(prior.amount) +
                        ' to ' +
                        (prior.to === human ? 'you' : playerName(players, prior.to))
                      : 'No previous round'}
                  </dd>
                </div>
                <div>
                  <dt>Received last round</dt>
                  <dd data-debt={received < 0}>
                    {lastTransfers.length ? formatBalance(received) : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </>
      ) : (
        <p>The remaining players have chosen where to send their balances.</p>
      )}
      <button
        type="button"
        className="abyss-primary"
        disabled={Boolean(human && !target)}
        onClick={onReveal}
      >
        {human
          ? target
            ? 'Pass to ' + playerName(players, target)
            : 'Select a player'
          : 'Reveal handoffs'}
      </button>
    </div>
  )
}

export function AbyssHandoffs({
  transfers,
  players,
  onContinue,
}: {
  transfers: readonly Transfer[]
  players: Map<string, ChallengePlayer>
  onContinue: () => void
}) {
  return (
    <div className="abyss-panel abyss-handoff">
      <div className="abyss-current" aria-hidden="true" />
      <h3>The handoff</h3>
      <ol className="abyss-transfers" aria-label="Balances passed">
        {transfers.map(({ from, to, amount }, index) => (
          <li key={from} style={{ '--line': index } as CSSProperties}>
            <span>{playerName(players, from)}</span>
            <strong data-debt={amount < 0}>
              {formatBalance(amount)} <span aria-hidden="true">→</span>
              <span className="abyss-sr"> to </span>
            </strong>
            <span>{playerName(players, to)}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onContinue}>
        Show verdict
      </button>
    </div>
  )
}

interface Standing {
  id: string
  score: number
  label?: string
  status?: string
}

function Standings({
  players,
  cinematic,
  title,
  rows,
  human,
}: PlayerLookups & {
  title: string
  rows: Standing[]
  human?: string
}) {
  return (
    <ol className="abyss-standings" aria-label={title}>
      {rows.map(({ id, score, label, status }) => {
        const player = players.get(id)
        return (
          <li key={id} data-out={status === 'Out'}>
            {cinematic && player && <AbyssPortrait player={player} />}
            <span>
              {playerName(players, id)}
              {id === human && <small> · You</small>}
            </span>
            <strong data-debt={score < 0}>{label ?? formatBalance(score)}</strong>
            {status && <small className="abyss-status">{status}</small>}
          </li>
        )
      })}
    </ol>
  )
}

export function AbyssVerdict({
  players,
  cinematic,
  game,
  onContinue,
}: PlayerLookups & {
  game: Abyss
  onContinue: () => void
}) {
  const playoff = game.playoffWaves.at(-1)
  const playoffs = game.playoffWaves.slice(0, -1)
  const player = (id: string) => playerName(players, id)
  function playoffLabel({ sector, score }: Abyss['playoffWaves'][number][number]) {
    const type = WHEEL_SECTORS[sector].type
    const prefix = type === 'bankrupt' ? 'VOID · ' : type === 'skip' ? 'STOP · ' : ''
    return prefix + formatBalance(score)
  }
  return (
    <div className="abyss-panel abyss-verdict">
      <h3>Round verdict</h3>
      <p>
        {game.out
          ? player(game.out) + ' is out.'
          : 'The players tied for lowest spin once each. VOID scores 0. Negative spins score lower.'}
      </p>
      <div className="abyss-verdict__details">
        {playoff && (
          <div className="abyss-playoff-results">
            <h4>Playoff results</h4>
            <Standings
              players={players}
              cinematic={cinematic}
              human={game.human}
              title="Playoff scores"
              rows={[...playoff]
                .sort((a, b) => a.score - b.score)
                .map((spin) => ({
                  id: spin.player,
                  score: spin.score,
                  label: playoffLabel(spin),
                  status:
                    spin.player === game.out
                      ? 'Out'
                      : game.playoff.includes(spin.player)
                        ? 'Spin again'
                        : 'Safe',
                }))}
            />
            {playoffs.length > 0 && (
              <details className="abyss-ledger">
                <summary>Earlier playoff spins</summary>
                {playoffs.map((wave, index) => (
                  <div key={index}>
                    <p>Spin {index + 1}</p>
                    <ul>
                      {wave.map((spin) => (
                        <li key={spin.player}>
                          {player(spin.player)} · {playoffLabel(spin)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            )}
            <h4>Balances after handoff</h4>
          </div>
        )}
        <Standings
          players={players}
          cinematic={cinematic}
          human={game.human}
          title="Round standings"
          rows={[...game.active]
            .sort((a, b) => game.roundScores[b] - game.roundScores[a])
            .map((id) => ({
              id,
              score: game.roundScores[id],
              status: game.out === id ? 'Out' : game.playoff.includes(id) ? 'Playoff' : undefined,
            }))}
        />
        {game.transfers.length > 0 && (
          <details className="abyss-ledger">
            <summary>View handoffs</summary>
            <ul>
              {game.transfers.map(({ from, to, amount }) => (
                <li key={from}>
                  {player(from)} sent {formatBalance(amount)} to {player(to)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <button type="button" className="abyss-primary" onClick={onContinue}>
        {game.out ? (game.active.length === 2 ? 'Reveal winner' : 'Continue') : 'Start playoff'}
      </button>
    </div>
  )
}

export function AbyssFinal({
  players,
  cinematic,
  game,
  standings,
  onContinue,
}: PlayerLookups & {
  game: Abyss
  standings: string[]
  onContinue: () => void
}) {
  const winner = standings[0]
  const portrait = winner && players.get(winner)
  return (
    <div className="abyss-panel abyss-verdict">
      <h3>The Abyss has spoken</h3>
      <div className="abyss-winner">
        {cinematic && portrait && <AbyssPortrait player={portrait} />}
        <strong>{winner ? playerName(players, winner) + ' wins' : 'Results sealed'}</strong>
      </div>
      <Standings
        players={players}
        cinematic={cinematic}
        human={game.human}
        title="Final standings"
        rows={standings.map((id, index) => ({
          id,
          score: game.finalScores[id] ?? 0,
          status: '#' + (index + 1),
        }))}
      />
      <button type="button" className="abyss-primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  )
}
