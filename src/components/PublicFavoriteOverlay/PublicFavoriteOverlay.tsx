import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion'
import { PUBLIC_FAVORITE_FORECAST_EYEOLEANS } from '../../economy/eyeoleans'
import { findByName, getById } from '../../data/houseguests'
import { selectPublicOpinion } from '../../publicOpinion'
import { useAppSelector } from '../../store/hooks'
import type { GameState, Player } from '../../types'
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting'
import {
  getProfilePhotoAvatarId,
  joinPublicAssetPath,
  resolveAvatarCandidates,
} from '../../utils/avatar'
import {
  buildHouseguestSpotlightItems,
  getActiveSpotlightPlayers,
  getSpotlightRotationDelayMs,
  selectSpotlightItem,
} from './publicFavoriteSpotlight'
import { buildPublicFavoriteForecast } from './publicFavoriteOutcome'
import { buildFinaleAudienceFeed } from './finaleAudienceFeed'
import './PublicFavoriteOverlay.css'
import './PublicFavoriteProfessional.css'

interface Props {
  candidates: Player[]
  seed: number
  mode?: 'favorite' | 'season_winner'
  awardAmount?: number
  eliminationIntervalMs?: number
  onComplete: (winnerId: string) => void
  onAudienceSurgeRequest?: (playerId: string) => Promise<boolean> | boolean
  onForecastAward?: (eventId: string) => void
  canBankEyeoleans?: boolean
  forecastEventScope?: string
}

type VoteTrend = 'up' | 'down' | 'stable'
type PublicVotePhase = 'intro' | 'live_results' | 'elimination' | 'final_two' | 'final_reveal'

interface SpotlightState {
  playerId: string
  endsAt: number
}

interface VoteEntry {
  playerId: string
  name: string
  percent: number
  rank: number
  previousRank: number
  trend: VoteTrend
  isLeader: boolean
  isSpotlighted: boolean
}

function AnimatedPercent({ value }: { value: number }) {
  const motionValue = useMotionValue(value)
  const spring = useSpring(motionValue, { stiffness: 90, damping: 24, mass: 0.7 })
  const display = useTransform(spring, (current) => `${Math.round(current)}%`)

  useEffect(() => {
    motionValue.set(value)
  }, [motionValue, value])

  return <motion.span>{display}</motion.span>
}

const ELIMINATION_INTERVAL_MS = 4800
const SEASON_WINNER_VOTE_MS = 23_000
const SEASON_WINNER_IDENTITY_REVEAL_MS = 10_000
const VOTE_TICK_INTERVAL_MS = 1000
const CLOCK_INTERVAL_MS = 500
const SPOTLIGHT_SELECTION_WINDOW_MS = 7000
const SPOTLIGHT_DURATION_MS = 7000
const ELIMINATION_HOLD_MS = 1200
const FINAL_TWO_EXTRA_HOLD_MS = 3500
const FAST_FORWARD_ELIMINATION_INTERVAL_MS = 850
const FAST_FORWARD_TICK_INTERVAL_MS = 300
const MAX_VISIBLE_RANKS = 8
const FORECAST_STREAK_STORAGE_KEY = 'bbmobilenew:public-favorite-forecast-streak:v1'

function readForecastStreak(): number {
  if (typeof window === 'undefined') return 0
  try {
    const value = Number(window.localStorage.getItem(FORECAST_STREAK_STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function saveForecastStreak(value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FORECAST_STREAK_STORAGE_KEY, String(Math.max(0, value)))
  } catch {
    // Cosmetic rewards must never block a finale result.
  }
}

function formatEyeoleans(amount: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)} Eyeoleans`
}

function countdown(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000))
}

function formatRevealCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function voteTrend(previousRank: number, rank: number): VoteTrend {
  if (previousRank > rank) return 'up'
  if (previousRank < rank) return 'down'
  return 'stable'
}

function PlayerPortrait({
  player,
  className = '',
  preferGreyAvatar = false,
}: {
  player: Player
  className?: string
  preferGreyAvatar?: boolean
}) {
  const sources = useMemo(() => {
    const standardSources = resolveAvatarCandidates(player)
    if (!preferGreyAvatar) return standardSources
    const profile = getById(player.id) ?? findByName(player.name)
    if (!profile || player.isUser || getProfilePhotoAvatarId(player.avatar)) return standardSources
    const portraitName = profile.name
    const greySources = [
      joinPublicAssetPath(`assets/skins/backup-grey-lux/${portraitName}_avatar.webp`),
      joinPublicAssetPath(`assets/skins/backup-grey-lux/${portraitName.toLowerCase()}_avatar.webp`),
    ]
    return [...new Set([...greySources, ...standardSources])]
  }, [player, preferGreyAvatar])
  const [sourceState, setSourceState] = useState<{ sources: string[]; index: number }>({
    sources,
    index: 0,
  })
  const sourceIndex = sourceState.sources === sources ? sourceState.index : 0
  const source = sources[sourceIndex]

  return (
    <div className={`pf-overlay__portrait ${className}`.trim()}>
      {source ? (
        <img
          src={source}
          alt={player.name}
          className="pf-overlay__avatar-img"
          loading="eager"
          decoding="async"
          onError={() =>
            setSourceState((current) => ({
              sources,
              index: current.sources === sources ? current.index + 1 : 1,
            }))
          }
        />
      ) : (
        <span className="pf-overlay__portrait-fallback" aria-hidden="true">
          {player.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function TrendMarker({ entry }: { entry: VoteEntry }) {
  const symbol = entry.trend === 'up' ? '▲' : entry.trend === 'down' ? '▼' : '•'
  const label =
    entry.trend === 'up'
      ? `Up from rank ${entry.previousRank}`
      : entry.trend === 'down'
        ? `Down from rank ${entry.previousRank}`
        : `Holding at rank ${entry.rank}`

  return (
    <span
      className={`pf-overlay__trend pf-overlay__trend--${entry.trend}`}
      title={label}
      aria-label={label}
    >
      {symbol}
    </span>
  )
}

function VoteRankingBoard({
  entries,
  candidatesById,
  selectedPlayerId,
  onSelect,
  identitiesHidden,
  anonymousLabelsById,
}: {
  entries: VoteEntry[]
  candidatesById: Record<string, Player>
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
  identitiesHidden: boolean
  anonymousLabelsById: Record<string, string>
}) {
  const visibleEntries = entries.slice(0, MAX_VISIBLE_RANKS)
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length)

  return (
    <section className="pf-overlay__board" aria-label="Public vote ranking board">
      <div className="pf-overlay__board-header">
        <p className="pf-overlay__board-title">Live audience vote</p>
        <span>{entries.length} remaining</span>
      </div>
      <div className="pf-overlay__board-list">
        {visibleEntries.map((entry) => {
          const player = candidatesById[entry.playerId]
          if (!player) return null
          const displayName = identitiesHidden
            ? (anonymousLabelsById[entry.playerId] ?? 'Finalist')
            : entry.name
          return (
            <motion.button
              key={entry.playerId}
              type="button"
              className={`pf-overlay__rank-card${entry.isLeader ? ' pf-overlay__rank-card--leader' : ''}${entry.isSpotlighted ? ' pf-overlay__rank-card--surge' : ''}${selectedPlayerId === entry.playerId ? ' pf-overlay__rank-card--selected' : ''}`}
              onClick={() => {
                if (!identitiesHidden) onSelect(entry.playerId)
              }}
              aria-label={`${displayName}, rank ${entry.rank}, ${entry.percent}%`}
              aria-disabled={identitiesHidden}
              layout
              transition={{ layout: { type: 'spring', stiffness: 75, damping: 20, mass: 0.8 } }}
            >
              <span className="pf-overlay__rank-number">#{entry.rank}</span>
              {identitiesHidden ? (
                <span
                  className="pf-overlay__portrait pf-overlay__portrait--sealed"
                  aria-hidden="true"
                >
                  ?
                </span>
              ) : (
                <PlayerPortrait player={player} />
              )}
              <div className="pf-overlay__rank-copy">
                <div className="pf-overlay__rank-name-row">
                  <span className="pf-overlay__rank-name">{displayName}</span>
                  <TrendMarker entry={entry} />
                </div>
                <div className="pf-overlay__accent-rail" aria-hidden="true">
                  <span className="pf-overlay__accent-track" />
                  <motion.span
                    className="pf-overlay__accent-fill"
                    animate={{ width: `${Math.max(4, entry.percent)}%` }}
                    transition={{ type: 'spring', stiffness: 82, damping: 22, mass: 0.9 }}
                  />
                </div>
              </div>
              <div className="pf-overlay__rank-tail">
                <span className="pf-overlay__percent-value">{entry.percent}%</span>
                {entry.isSpotlighted ? (
                  <span className="pf-overlay__rank-tag">Spotlight</span>
                ) : entry.isLeader ? (
                  <span className="pf-overlay__rank-tag">Live lead</span>
                ) : null}
              </div>
            </motion.button>
          )
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="pf-overlay__remaining-note">
          +{hiddenCount} hubmates remain below the live cut.
        </p>
      )}
    </section>
  )
}

function TopThreeVoteBoard({
  entries,
  candidatesById,
  selectedPlayerId,
  onSelect,
}: {
  entries: VoteEntry[]
  candidatesById: Record<string, Player>
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
}) {
  const topThree = entries.slice(0, 3)
  const visibleShareTotal = topThree.reduce((total, entry) => total + entry.percent, 0)
  const isFinalTwo = topThree.length === 2

  return (
    <section
      className="pf-overlay__top-three"
      aria-label={isFinalTwo ? 'Final two live audience vote' : 'Top three live audience vote'}
    >
      <div className="pf-overlay__board-header">
        <p className="pf-overlay__board-title">Live audience vote</p>
        <span>{isFinalTwo ? 'Final 2' : `Top 3 of ${entries.length}`}</span>
      </div>
      <div
        className={`pf-overlay__top-three-candidates${isFinalTwo ? ' pf-overlay__top-three-candidates--final-two' : ''}`}
      >
        {topThree.map((entry, index) => {
          const player = candidatesById[entry.playerId]
          if (!player) return null
          return (
            <motion.button
              key={entry.playerId}
              type="button"
              className={`pf-overlay__top-three-player pf-overlay__top-three-player--${index + 1}${selectedPlayerId === entry.playerId ? ' is-selected' : ''}${entry.isSpotlighted ? ' is-spotlighted' : ''}`}
              onClick={() => onSelect(entry.playerId)}
              aria-label={`${entry.name}, rank ${entry.rank}, ${entry.percent}% of the audience vote${entry.isSpotlighted ? ', spotlighted' : ''}`}
              aria-pressed={selectedPlayerId === entry.playerId}
              layout
              transition={{ layout: { type: 'spring', stiffness: 75, damping: 20, mass: 0.8 } }}
            >
              <span className="pf-overlay__top-three-rank">{entry.rank}</span>
              <PlayerPortrait player={player} className="pf-overlay__top-three-portrait" />
              <strong className="pf-overlay__top-three-name">{entry.name}</strong>
              <span className="pf-overlay__top-three-percent">
                <AnimatedPercent value={entry.percent} />
              </span>
            </motion.button>
          )
        })}
      </div>
      <div
        className="pf-overlay__share-track"
        role="img"
        aria-label={`Segments show relative shares within the visible ${isFinalTwo ? 'final two' : 'top three'}; percentages show each player's share of the full audience vote`}
      >
        {topThree.map((entry, index) => (
          <motion.span
            key={`visible-rank-${index}`}
            className={`pf-overlay__share-segment pf-overlay__share-segment--${index + 1}`}
            animate={{
              width: `${visibleShareTotal > 0 ? (entry.percent / visibleShareTotal) * 100 : 100 / Math.max(topThree.length, 1)}%`,
            }}
            initial={{ width: 0 }}
            transition={{ type: 'spring', stiffness: 68, damping: 20, mass: 1.05 }}
            title={`${entry.name}: ${entry.percent}%`}
          />
        ))}
      </div>
      <p className="pf-overlay__top-three-note">
        The crowd is still deciding. One shift can change the whole night.
      </p>
    </section>
  )
}

function AudiencePlayerRail({
  players,
  selectedPlayerId,
  forecastPlayerId,
  activeSpotlight,
  onSelect,
}: {
  players: Player[]
  selectedPlayerId: string | null
  forecastPlayerId: string | null
  activeSpotlight: SpotlightState | null
  onSelect: (playerId: string) => void
}) {
  if (players.length === 0) return null

  return (
    <section className="pf-overlay__audience-rail" aria-label="Choose a player to view">
      <p className="pf-overlay__audience-rail-title">The housemates</p>
      <div className="pf-overlay__audience-rail-track">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`pf-overlay__audience-rail-player${selectedPlayerId === player.id ? ' is-selected' : ''}${forecastPlayerId === player.id ? ' is-forecast' : ''}${activeSpotlight?.playerId === player.id ? ' is-spotlighted' : ''}`}
            onClick={() => onSelect(player.id)}
            aria-pressed={selectedPlayerId === player.id}
          >
            <PlayerPortrait player={player} className="pf-overlay__audience-rail-portrait" />
            <span>{player.name}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function ForecastPick({
  candidates,
  selectedPlayerId,
  canBankEyeoleans,
  onSelect,
  onLock,
}: {
  candidates: Player[]
  selectedPlayerId: string | null
  canBankEyeoleans: boolean
  onSelect: (playerId: string) => void
  onLock: () => void
}) {
  const selectedPlayer = candidates.find((player) => player.id === selectedPlayerId) ?? null
  const game = useAppSelector((state) => state.game)
  const selectedPlayerFullName = selectedPlayer
    ? (getById(selectedPlayer.id)?.fullName ??
      findByName(selectedPlayer.name)?.fullName ??
      selectedPlayer.name)
    : null
  const selectedPlayerDays = selectedPlayer ? getPlayerDaysInGame(selectedPlayer, game) : null

  return (
    <section className="pf-overlay__your-call" aria-label="Forecast pick">
      <div className="pf-overlay__forecast-heading">
        <span className="pf-overlay__live-badge">
          <span className="pf-overlay__live-dot" aria-hidden="true" /> LIVE
        </span>
        <span className="pf-overlay__forecast-scope">SEASON VOTE</span>
      </div>
      <div className="pf-overlay__your-call-copy">
        <h3 className="pf-overlay__your-call-title">Choose the Public Favorite</h3>
        <p className="pf-overlay__your-call-description">
          Predict who the public will choose. Lock in your pick, then watch the live vote unfold.
        </p>
      </div>
      <AnimatePresence initial={false}>
        {selectedPlayer && (
          <motion.div
            className="pf-overlay__forecast-feature"
            aria-live="polite"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
          >
            <PlayerPortrait
              player={selectedPlayer}
              className="pf-overlay__forecast-feature-portrait"
              preferGreyAvatar
            />
            <div>
              <span>Your pick</span>
              <strong>{selectedPlayerFullName}</strong>
              <small className="pf-overlay__forecast-feature-days">
                Total days in the game: {selectedPlayerDays}{' '}
                {selectedPlayerDays === 1 ? 'day' : 'days'}
              </small>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className="pf-overlay__forecast-cast"
        aria-label={`Choose your forecast from ${candidates.length} eligible hubmates`}
      >
        {candidates.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`pf-overlay__forecast-cast-player${selectedPlayerId === player.id ? ' is-selected' : ''}`}
            aria-pressed={selectedPlayerId === player.id}
            onClick={() => onSelect(player.id)}
          >
            <PlayerPortrait
              player={player}
              className="pf-overlay__forecast-cast-portrait"
              preferGreyAvatar
            />
            <span>{player.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="pf-overlay__your-call-cta"
        disabled={!selectedPlayerId}
        onClick={onLock}
      >
        Lock forecast
      </button>
      <p className="pf-overlay__forecast-reward">
        {canBankEyeoleans
          ? `Correct pick: +${formatEyeoleans(PUBLIC_FAVORITE_FORECAST_EYEOLEANS)}`
          : 'Correct picks build your streak.'}
      </p>
      {canBankEyeoleans && (
        <p className="pf-overlay__forecast-currency-note">
          Eyeoleans are the Hub’s in-game currency. Use them in the market.
        </p>
      )}
    </section>
  )
}

function getPlayerDaysInGame(player: Player, game: GameState | undefined): number {
  const enteredAtDay = Math.max(1, player.enteredAtDay ?? 1)
  const lastDay = Math.max(enteredAtDay, player.evictedAtWeek ?? game?.week ?? enteredAtDay)
  const numberedDays = lastDay - enteredAtDay + 1
  if (game?.weekendsEnabledForSeason !== true) return numberedDays

  const completedWeekendMilestones = new Set(game.completedWeekendDays ?? [])
  if (game.finaleWeekendCompleted) completedWeekendMilestones.add(15)

  const completedWeekendDays =
    Array.from(completedWeekendMilestones).filter(
      (afterDay) => enteredAtDay <= afterDay && lastDay > afterDay
    ).length * 2

  const activeWeekend = game.weekendInterlude?.active ? game.weekendInterlude : null
  const currentWeekendDays =
    activeWeekend &&
    player.status !== 'evicted' &&
    player.status !== 'jury' &&
    enteredAtDay <= activeWeekend.afterDay
      ? Math.min(2, activeWeekend.weekendDay)
      : 0

  return numberedDays + completedWeekendDays + currentWeekendDays
}

const FORECAST_SHARD_VECTORS = [
  { x: 66, y: -88, rotate: 24 },
  { x: 98, y: -25, rotate: 76 },
  { x: 65, y: 58, rotate: 132 },
  { x: -7, y: 88, rotate: 190 },
  { x: -78, y: 60, rotate: 230 },
  { x: -96, y: -20, rotate: 282 },
  { x: -67, y: -87, rotate: 328 },
  { x: -4, y: -106, rotate: 358 },
]

function ForecastEliminationBurst({ player }: { player: Player }) {
  return (
    <motion.div
      className="pf-overlay__forecast-burst"
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="pf-overlay__forecast-burst-avatar"
        initial={{ scale: 0.82, opacity: 0.4 }}
        animate={{ scale: [0.82, 1.22, 1.68], opacity: [0.4, 1, 0] }}
        transition={{ duration: 1.35, times: [0, 0.32, 1] }}
      >
        <PlayerPortrait player={player} />
      </motion.div>
      <div className="pf-overlay__forecast-burst-shards" aria-hidden="true">
        {FORECAST_SHARD_VECTORS.map((vector, index) => (
          <motion.i
            key={index}
            className={`pf-overlay__forecast-burst-shard pf-overlay__forecast-burst-shard--${index + 1}`}
            initial={{ scale: 0.25, opacity: 0 }}
            animate={{
              x: [0, vector.x * 0.42, vector.x],
              y: [0, vector.y * 0.42, vector.y],
              rotate: [0, vector.rotate * 0.38, vector.rotate],
              scale: [0.12, 1.15, 0.42],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.28, delay: 0.18 + index * 0.028 }}
          />
        ))}
      </div>
      <motion.p
        initial={{ y: 7, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.28 }}
      >
        {player.name} leaves the count
      </motion.p>
    </motion.div>
  )
}

function HousemateSpotlight({
  spotlight,
  finalTwoNames,
  revealCountdown,
  identitiesHidden,
  showRevealCountdown,
}: {
  spotlight: ReturnType<typeof selectSpotlightItem>
  finalTwoNames: string | null
  revealCountdown: number
  identitiesHidden: boolean
  showRevealCountdown: boolean
}) {
  if (identitiesHidden) {
    return (
      <motion.section
        className="pf-overlay__spotlight pf-overlay__spotlight--sealed"
        role="region"
        aria-label="Finalist identities sealed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="pf-overlay__sealed-copy">
          <p className="pf-overlay__leader-kicker">The final vote is live</p>
          <h3 className="pf-overlay__leader-name">Two identities. One crown.</h3>
          <p className="pf-overlay__spotlight-fact">
            The percentages are moving, but the faces behind them remain hidden for now.
          </p>
        </div>
        <div className="pf-overlay__sealed-pair" aria-hidden="true">
          <span>?</span>
          <span>?</span>
        </div>
      </motion.section>
    )
  }
  if (!spotlight) return null
  const { player } = spotlight.item

  return (
    <motion.section
      className="pf-overlay__spotlight"
      role="region"
      aria-label="Hubmate Spotlight"
      data-testid="housemate-spotlight"
      layout
    >
      <div className="pf-overlay__leader-copy">
        <p className="pf-overlay__leader-kicker">
          {finalTwoNames ? `Final two · ${finalTwoNames}` : 'Hubmate file'}
        </p>
        <h3 className="pf-overlay__leader-name">{player.name}</h3>
        <motion.p
          key={`${player.id}-${spotlight.fact}`}
          className="pf-overlay__spotlight-fact"
          initial={{ opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {spotlight.fact}
        </motion.p>
        {showRevealCountdown && (
          <p
            className="pf-overlay__moment-stat pf-overlay__moment-stat--final-countdown"
            aria-label={`Final reveal in ${formatRevealCountdown(revealCountdown)}`}
          >
            <span>Final reveal in</span>
            <strong>{formatRevealCountdown(revealCountdown)}</strong>
          </p>
        )}
      </div>
      <div className="pf-overlay__leader-portrait-wrap">
        <div className="pf-overlay__leader-glow" aria-hidden="true" />
        <PlayerPortrait
          player={player}
          className="pf-overlay__leader-avatar pf-overlay__leader-avatar--portrait"
        />
      </div>
    </motion.section>
  )
}

function ViewerSpotlightPanel({
  selectedPlayer,
  activeSpotlight,
  used,
  pending,
  canActivate,
  onActivate,
}: {
  selectedPlayer: Player | null
  activeSpotlight: SpotlightState | null
  used: boolean
  pending: boolean
  canActivate: boolean
  onActivate: () => void
}) {
  return (
    <section className="pf-overlay__surge-panel" aria-label="Audience spotlight">
      <div className="pf-overlay__surge-copy">
        <p className="pf-overlay__surge-description">
          {activeSpotlight && selectedPlayer
            ? `The audience has its eyes on ${selectedPlayer.name}.`
            : selectedPlayer
              ? `Give ${selectedPlayer.name} the moment. See how the audience responds.`
              : 'Choose a housemate to bring into the spotlight.'}
        </p>
      </div>
      <button
        type="button"
        className="pf-overlay__surge-cta"
        onClick={onActivate}
        disabled={!selectedPlayer || !canActivate || pending}
        aria-label={
          pending
            ? 'Spotlight connecting'
            : activeSpotlight
              ? 'Spotlight active'
              : used
                ? 'Spotlight complete'
                : `Spotlight ${selectedPlayer?.name ?? 'housemate'}`
        }
      >
        {pending
          ? 'On air…'
          : activeSpotlight
            ? 'In the spotlight'
            : used
              ? 'Spotlight complete'
              : `Spotlight${selectedPlayer ? ` ${selectedPlayer.name}` : ''}`}
      </button>
    </section>
  )
}

function LiveForecastTracker({ player, entry }: { player: Player; entry: VoteEntry | null }) {
  return (
    <section className="pf-overlay__live-forecast" aria-label="Your live forecast">
      <div className="pf-overlay__live-forecast-heading">
        <span>Your call</span>
        <span>{entry ? 'Live position' : 'Vote update'}</span>
      </div>
      <div className="pf-overlay__live-forecast-main">
        <PlayerPortrait
          player={player}
          className="pf-overlay__live-forecast-portrait"
          preferGreyAvatar
        />
        <div className="pf-overlay__live-forecast-copy">
          <strong title={player.name}>{player.name}</strong>
          <span>{entry ? `#${entry.rank} in the audience vote` : 'Out of the vote'}</span>
        </div>
        <div className="pf-overlay__live-forecast-result">
          {entry ? <AnimatedPercent value={entry.percent} /> : <span>—</span>}
        </div>
      </div>
      <div
        className="pf-overlay__live-forecast-track"
        role="img"
        aria-label={
          entry
            ? `${player.name} has ${entry.percent}% of the audience vote`
            : `${player.name} is out of the vote`
        }
      >
        <motion.span
          animate={{ width: `${entry ? Math.max(2, entry.percent) : 0}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 22 }}
        />
      </div>
    </section>
  )
}

function FinaleAudienceFeed({ items }: { items: ReturnType<typeof buildFinaleAudienceFeed> }) {
  if (items.length === 0) return null
  return (
    <section className="pf-overlay__audience-feed" aria-label="Live audience reactions">
      <header>
        <span className="pf-overlay__live-dot" />
        <strong>Audience live</strong>
        <small>Comments and voting activity</small>
      </header>
      <div className="pf-overlay__audience-feed-list" aria-live="polite">
        {items.map((item) => (
          <motion.p
            key={item.id}
            className={`pf-overlay__audience-feed-item pf-overlay__audience-feed-item--${item.kind}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span>{item.kind === 'service' ? 'LIVE DESK' : 'VIEWER'}</span>
            {item.text}
          </motion.p>
        ))}
      </div>
    </section>
  )
}

function FinalReveal({
  winner,
  runnerUp,
  awardAmount,
  mode,
  forecastPick,
  forecastStreak,
  canBankEyeoleans,
  onClose,
}: {
  winner: Player | undefined
  runnerUp: Player | undefined
  awardAmount: number
  mode: 'favorite' | 'season_winner'
  forecastPick: Player | null
  forecastStreak: number
  canBankEyeoleans: boolean
  onClose: () => void
}) {
  return (
    <motion.div
      className="pf-overlay__winner-stage"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="pf-overlay__winner-badge">FINAL REVEAL</span>
      <p className="pf-overlay__eyebrow">
        {mode === 'season_winner' ? 'Season Winner' : `Public's Favorite Player`}
      </p>
      <div className="pf-overlay__winner-avatar-wrap">
        <div className="pf-overlay__winner-glow" aria-hidden="true" />
        {winner ? (
          <PlayerPortrait
            player={winner}
            className="pf-overlay__winner-avatar pf-overlay__winner-avatar--portrait"
          />
        ) : (
          <span className="pf-overlay__winner-fallback" aria-hidden="true">
            🏆
          </span>
        )}
      </div>
      {winner && runnerUp && mode === 'season_winner' && (
        <p className="pf-overlay__runner-up">{runnerUp.name} finishes as runner-up.</p>
      )}
      <h2 className="pf-overlay__headline">{winner?.name ?? 'Result unavailable'}</h2>
      {winner && mode === 'favorite' && (
        <p className="pf-overlay__winner-prize">Wins {formatEyeoleans(awardAmount)}!</p>
      )}
      {winner && forecastPick && mode === 'favorite' && (
        <p className="pf-overlay__called-winner">
          {forecastPick.id === winner.id
            ? canBankEyeoleans
              ? `Forecast right · +${formatEyeoleans(PUBLIC_FAVORITE_FORECAST_EYEOLEANS)} · ${forecastStreak}× streak`
              : `Forecast right · ${forecastStreak}× streak`
            : `Your call: ${forecastPick.name}`}
        </p>
      )}
      <p className="pf-overlay__sub">
        {mode === 'season_winner'
          ? 'The audience has spoken. The season belongs to its champion.'
          : 'The season-long audience record has spoken.'}
      </p>
      <button type="button" className="pf-overlay__winner-cta" onClick={onClose} disabled={!winner}>
        Continue
      </button>
    </motion.div>
  )
}

export default function PublicFavoriteOverlay({
  candidates,
  seed,
  mode = 'favorite',
  awardAmount = 25000,
  eliminationIntervalMs,
  onComplete,
  onAudienceSurgeRequest,
  onForecastAward,
  canBankEyeoleans = false,
  forecastEventScope,
}: Props) {
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const configuredEliminationIntervalMs =
    eliminationIntervalMs ??
    (mode === 'season_winner' ? SEASON_WINNER_VOTE_MS : ELIMINATION_INTERVAL_MS)
  const effectiveIntroMs = 0
  const prefersReducedMotion = useReducedMotion()
  const forecast = useMemo(
    () => buildPublicFavoriteForecast(candidates, publicOpinion, seed),
    [candidates, publicOpinion, seed]
  )
  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates])
  const candidatesById = useMemo(
    () => Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates]
  )
  const anonymousLabelsById = useMemo(
    () => Object.fromEntries(candidates.map((candidate) => [candidate.id, '?'])),
    [candidates]
  )

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [introSkipBoostMs, setIntroSkipBoostMs] = useState(0)
  const [fastForwarding, setFastForwarding] = useState(false)
  const [nextShiftAt, setNextShiftAt] = useState(() => Date.now() + configuredEliminationIntervalMs)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(candidates[0]?.id ?? null)
  const [forecastPickId, setForecastPickId] = useState<string | null>(candidates[0]?.id ?? null)
  const [forecastLocked, setForecastLocked] = useState(mode !== 'favorite')
  const [voteStartedAt, setVoteStartedAt] = useState<number | null>(
    mode === 'favorite' ? null : Date.now()
  )
  const [forecastStreak] = useState(readForecastStreak)
  const [spotlightPending, setSpotlightPending] = useState(false)
  const [spotlightUsed, setSpotlightUsed] = useState(false)
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightState | null>(null)
  const [eliminationMoment, setEliminationMoment] = useState<{
    player: Player
    startedAt: number
  } | null>(null)
  const [forecastEliminationBurst, setForecastEliminationBurst] = useState<Player | null>(null)
  const [spotlightRotation, setSpotlightRotation] = useState(0)
  const [audienceFeedCount, setAudienceFeedCount] = useState(3)
  const previousRanksRef = useRef<Record<string, number>>({})
  const previousEliminatedCountRef = useRef(0)
  const eliminatedIdsRef = useRef<Set<string>>(new Set())
  const completionFiredRef = useRef(false)
  const forecastResolvedRef = useRef(false)
  const forecastEliminationBurstRef = useRef(false)
  const requestLockedRef = useRef(false)
  const mountedRef = useRef(true)
  const fastForwardButtonRef = useRef<HTMLButtonElement | null>(null)

  const effectiveEliminationIntervalMs = fastForwarding
    ? Math.min(configuredEliminationIntervalMs, FAST_FORWARD_ELIMINATION_INTERVAL_MS)
    : configuredEliminationIntervalMs
  const finalTwoHoldMs = mode === 'favorite' && !fastForwarding ? FINAL_TWO_EXTRA_HOLD_MS : 0

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs: effectiveEliminationIntervalMs,
    finalTwoHoldMs,
    tickIntervalMs: fastForwarding ? FAST_FORWARD_TICK_INTERVAL_MS : VOTE_TICK_INTERVAL_MS,
    driftAmount: fastForwarding ? 1.4 : 2.4,
    targetPercentages: forecast.targetPercentages,
    paused: mode === 'favorite' && !forecastLocked,
  })
  const remainingPlayerCount = Math.max(0, candidateIds.length - eliminated.length)
  const displayedEliminationIntervalMs =
    effectiveEliminationIntervalMs + (remainingPlayerCount === 2 ? finalTwoHoldMs : 0)
  const finaleAudienceFeed = useMemo(
    () =>
      mode === 'season_winner'
        ? buildFinaleAudienceFeed(
            candidates.map((candidate) => candidate.name),
            seed
          )
        : [],
    [candidates, mode, seed]
  )

  useEffect(() => {
    mountedRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fastForwardButtonRef.current?.focus()
    return () => {
      mountedRef.current = false
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (isComplete) return
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isComplete])

  useEffect(() => {
    if (mode !== 'season_winner' || isComplete || finaleAudienceFeed.length === 0) return
    const id = window.setInterval(
      () => setAudienceFeedCount((count) => Math.min(finaleAudienceFeed.length, count + 1)),
      fastForwarding ? 650 : 1700
    )
    return () => window.clearInterval(id)
  }, [fastForwarding, finaleAudienceFeed.length, isComplete, mode])

  useEffect(() => {
    if (isComplete || voteStartedAt === null) return
    setNextShiftAt(Date.now() + displayedEliminationIntervalMs)
  }, [displayedEliminationIntervalMs, eliminated.length, isComplete, voteStartedAt])

  useEffect(() => {
    if (eliminated.length <= previousEliminatedCountRef.current) {
      previousEliminatedCountRef.current = eliminated.length
      return
    }
    const eliminatedId = eliminated.at(-1)
    const player = eliminatedId ? candidatesById[eliminatedId] : undefined
    if (player) setEliminationMoment({ player, startedAt: Date.now() })
    previousEliminatedCountRef.current = eliminated.length
  }, [candidatesById, eliminated])

  useEffect(() => {
    const remainingAfterElimination = candidateIds.length - eliminated.length
    if (
      mode !== 'favorite' ||
      fastForwarding ||
      !forecastLocked ||
      !forecastPickId ||
      forecastEliminationBurstRef.current ||
      !eliminated.includes(forecastPickId) ||
      remainingAfterElimination < 2
    ) {
      return
    }
    const player = candidatesById[forecastPickId]
    if (!player) return
    forecastEliminationBurstRef.current = true
    setForecastEliminationBurst(player)
  }, [
    candidateIds.length,
    candidatesById,
    eliminated,
    fastForwarding,
    forecastLocked,
    forecastPickId,
    mode,
  ])

  useEffect(() => {
    if (!forecastEliminationBurst) return
    const id = window.setTimeout(() => setForecastEliminationBurst(null), 1850)
    return () => window.clearTimeout(id)
  }, [forecastEliminationBurst])

  useEffect(() => {
    if (!activeSpotlight) return
    if (activeSpotlight.endsAt <= nowMs || eliminated.includes(activeSpotlight.playerId)) {
      setActiveSpotlight(null)
    }
  }, [activeSpotlight, eliminated, nowMs])

  const activePlayers = useMemo(
    () => getActiveSpotlightPlayers(candidates, eliminated),
    [candidates, eliminated]
  )
  eliminatedIdsRef.current = new Set(eliminated)

  useEffect(() => {
    const firstActiveId = activePlayers[0]?.id ?? null
    if (!firstActiveId) {
      setSelectedPlayerId(null)
      return
    }
    if (!selectedPlayerId || eliminated.includes(selectedPlayerId)) {
      setSelectedPlayerId(firstActiveId)
    }
  }, [activePlayers, eliminated, selectedPlayerId])

  const spotlightItems = useMemo(() => buildHouseguestSpotlightItems(candidates), [candidates])
  const spotlight = useMemo(
    () => selectSpotlightItem(spotlightItems, spotlightRotation),
    [spotlightItems, spotlightRotation]
  )

  useEffect(() => {
    if (isComplete || !spotlight) return
    const id = window.setTimeout(() => {
      setSpotlightRotation((rotation) => {
        for (let offset = 1; offset <= spotlightItems.length; offset += 1) {
          const nextRotation = rotation + offset
          const nextPlayerId = selectSpotlightItem(spotlightItems, nextRotation)?.item.player.id
          if (nextPlayerId && !eliminatedIdsRef.current.has(nextPlayerId)) {
            return nextRotation
          }
        }
        return rotation
      })
    }, getSpotlightRotationDelayMs(spotlight.fact))
    return () => window.clearTimeout(id)
  }, [isComplete, spotlight, spotlightItems])

  // The rewarded spotlight is a visible, short-lived +5-point surge. The
  // voting simulation keeps the authoritative outcome, while this display
  // treatment redistributes the remaining visible share smoothly and always
  // stays at 100%.
  const displayedVotes = useMemo(() => {
    if (!activeSpotlight || !votes[activeSpotlight.playerId]) return votes
    const boostedId = activeSpotlight.playerId
    const boost = Math.min(5, 100 - (votes[boostedId] ?? 0))
    const donorTotal = Object.entries(votes).reduce(
      (sum, [playerId, percent]) => (playerId === boostedId ? sum : sum + percent),
      0
    )
    if (donorTotal <= 0 || boost <= 0) return votes
    return Object.fromEntries(
      Object.entries(votes).map(([playerId, percent]) => [
        playerId,
        playerId === boostedId
          ? percent + boost
          : Math.max(0, percent - (percent / donorTotal) * boost),
      ])
    ) as Record<string, number>
  }, [activeSpotlight, votes])

  const rankedPlayers = useMemo(
    () =>
      [...activePlayers].sort(
        (left, right) => (displayedVotes[right.id] ?? 0) - (displayedVotes[left.id] ?? 0)
      ),
    [activePlayers, displayedVotes]
  )
  const voteEntries = useMemo<VoteEntry[]>(
    () =>
      rankedPlayers.map((player, index) => {
        const rank = index + 1
        const previousRank = previousRanksRef.current[player.id] ?? rank
        return {
          playerId: player.id,
          name: player.name,
          percent: displayedVotes[player.id] ?? 0,
          rank,
          previousRank,
          trend: voteTrend(previousRank, rank),
          isLeader: rank === 1,
          isSpotlighted: activeSpotlight?.playerId === player.id,
        }
      }),
    [activeSpotlight?.playerId, displayedVotes, rankedPlayers]
  )

  useEffect(() => {
    previousRanksRef.current = Object.fromEntries(
      rankedPlayers.map((player, index) => [player.id, index + 1])
    )
  }, [rankedPlayers])

  const elapsedMs = voteStartedAt === null ? 0 : nowMs - voteStartedAt + introSkipBoostMs
  const eliminationActive =
    !isComplete && eliminationMoment && nowMs - eliminationMoment.startedAt < ELIMINATION_HOLD_MS
      ? eliminationMoment
      : null
  const finalTwoNames =
    activePlayers.length === 2 ? `${activePlayers[0].name} vs ${activePlayers[1].name}` : null
  const selectedPlayer = selectedPlayerId ? (candidatesById[selectedPlayerId] ?? null) : null
  const forecastPick = forecastPickId ? (candidatesById[forecastPickId] ?? null) : null
  const forecastOpen = mode === 'favorite' && !forecastLocked
  const canActivateSpotlight =
    !isComplete &&
    !spotlightUsed &&
    !spotlightPending &&
    elapsedMs >= effectiveIntroMs &&
    elapsedMs < effectiveIntroMs + SPOTLIGHT_SELECTION_WINDOW_MS
  const phase: PublicVotePhase = isComplete
    ? 'final_reveal'
    : elapsedMs < effectiveIntroMs
      ? 'intro'
      : eliminationActive
        ? 'elimination'
        : activePlayers.length === 2
          ? 'final_two'
          : 'live_results'
  const identitiesHidden =
    mode === 'season_winner' &&
    activePlayers.length === 2 &&
    elapsedMs < SEASON_WINNER_IDENTITY_REVEAL_MS

  const statusLine = forecastOpen
    ? 'Make your forecast before the live vote opens'
    : phase === 'intro'
      ? 'Audience record is being verified'
      : identitiesHidden
        ? 'The vote is moving while both identities remain hidden'
        : phase === 'elimination'
          ? 'Standings paused for elimination'
          : phase === 'final_two'
            ? 'Every vote can still change who takes the crown'
            : `Next result in ${countdown(nextShiftAt - nowMs)}s`
  const revealCountdown = isComplete
    ? 0
    : Math.max(
        1,
        countdown(
          Math.max(0, nextShiftAt - nowMs) +
            Math.max(0, activePlayers.length - 2) * effectiveEliminationIntervalMs
        )
      )
  const showFinalCountdown =
    mode === 'season_winner' && !isComplete && revealCountdown > 0 && revealCountdown <= 3

  const handleFastForward = useCallback(() => {
    if (fastForwarding || isComplete || spotlightPending) return
    const remaining = Math.max(0, effectiveIntroMs - elapsedMs)
    if (remaining > 0) setIntroSkipBoostMs((current) => current + remaining)
    setForecastEliminationBurst(null)
    setFastForwarding(true)
    setNextShiftAt(Date.now() + FAST_FORWARD_ELIMINATION_INTERVAL_MS)
    setNowMs(Date.now())
  }, [effectiveIntroMs, elapsedMs, fastForwarding, isComplete, spotlightPending])

  const handleForecastLock = useCallback(() => {
    if (!forecastPickId || forecastLocked) return
    const startedAt = Date.now()
    setSelectedPlayerId(forecastPickId)
    setForecastLocked(true)
    setVoteStartedAt(startedAt)
    setNextShiftAt(startedAt + effectiveEliminationIntervalMs)
    setNowMs(startedAt)
  }, [effectiveEliminationIntervalMs, forecastLocked, forecastPickId])

  const handleSpotlight = useCallback(async () => {
    if (
      !selectedPlayerId ||
      !canActivateSpotlight ||
      requestLockedRef.current ||
      spotlightPending ||
      spotlightUsed
    ) {
      return
    }

    requestLockedRef.current = true
    setSpotlightPending(true)
    try {
      const granted = await Promise.resolve(
        onAudienceSurgeRequest ? onAudienceSurgeRequest(selectedPlayerId) : true
      )
      if (!mountedRef.current || !granted) return
      setSpotlightUsed(true)
      setActiveSpotlight({
        playerId: selectedPlayerId,
        endsAt: Date.now() + SPOTLIGHT_DURATION_MS,
      })
    } catch {
      // A dismissed or unavailable rewarded placement leaves the option unused.
    } finally {
      requestLockedRef.current = false
      if (mountedRef.current) setSpotlightPending(false)
    }
  }, [
    canActivateSpotlight,
    onAudienceSurgeRequest,
    selectedPlayerId,
    spotlightPending,
    spotlightUsed,
  ])

  const resolvedWinnerId = winnerId ?? (isComplete ? forecast.winnerId : null)
  const winner = resolvedWinnerId ? candidatesById[resolvedWinnerId] : undefined
  const runnerUp =
    mode === 'season_winner' && winner
      ? candidates.find((candidate) => candidate.id !== winner.id)
      : undefined
  const resolvedForecastStreak =
    mode === 'favorite' && isComplete && forecastPickId && resolvedWinnerId
      ? forecastPickId === resolvedWinnerId
        ? forecastStreak + 1
        : 0
      : forecastStreak

  useEffect(() => {
    if (mode !== 'favorite' || !isComplete || !resolvedWinnerId || !forecastPickId) return
    if (forecastResolvedRef.current) return
    forecastResolvedRef.current = true
    saveForecastStreak(resolvedForecastStreak)
    if (forecastPickId === resolvedWinnerId) {
      const eventScope = forecastEventScope?.trim() || String(seed)
      const eventId = `public-favorite-forecast:${eventScope}:${[...candidateIds].sort().join(',')}`
      onForecastAward?.(eventId)
    }
  }, [
    candidateIds,
    forecastEventScope,
    forecastPickId,
    isComplete,
    mode,
    onForecastAward,
    resolvedForecastStreak,
    resolvedWinnerId,
    seed,
  ])
  const handleClose = useCallback(() => {
    if (!resolvedWinnerId || completionFiredRef.current) return
    completionFiredRef.current = true
    onComplete(resolvedWinnerId)
  }, [onComplete, resolvedWinnerId])

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <div
        className={`pf-overlay${prefersReducedMotion ? ' pf-overlay--reduced-motion' : ''}${forecastOpen ? ' pf-overlay--forecast' : ''}${isComplete ? ' pf-overlay--complete' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === 'season_winner'
            ? 'Final public season winner vote'
            : `Public's Favorite Player overlay`
        }
      >
        <div className="pf-overlay__dim" aria-hidden="true" />
        <div className="pf-overlay__studio" aria-hidden="true" />
        <div className="pf-overlay__scanlines" aria-hidden="true" />
        <div className="pf-overlay__stage">
          <AnimatePresence>
            {forecastEliminationBurst && !isComplete && !fastForwarding && (
              <ForecastEliminationBurst player={forecastEliminationBurst} />
            )}
          </AnimatePresence>
          {!isComplete && !forecastOpen && (
            <header
              className={`pf-overlay__broadcast-banner${eliminationActive ? ' is-cut' : ''}`}
              aria-label="Public vote status"
            >
              <div className="pf-overlay__broadcast-bar">
                <div className="pf-overlay__broadcast-id">
                  <span className="pf-overlay__broadcast-live">
                    <span className="pf-overlay__live-dot" aria-hidden="true" /> LIVE
                  </span>
                  <span className="pf-overlay__broadcast-label">Audience vote</span>
                </div>
                <button
                  ref={fastForwardButtonRef}
                  type="button"
                  className="pf-overlay__broadcast-forward"
                  onClick={handleFastForward}
                  disabled={fastForwarding || spotlightPending}
                  aria-label="Fast forward public favorite vote"
                >
                  <span aria-hidden="true">»</span>
                  {fastForwarding ? 'Forwarding' : 'Fast forward'}
                </button>
              </div>
              <div className="pf-overlay__broadcast-copy" aria-live="polite">
                <h2 className="pf-overlay__broadcast-headline">
                  {eliminationActive
                    ? `${eliminationActive.player.name} leaves the vote`
                    : mode === 'season_winner'
                      ? 'The Final Two Face the Public'
                      : 'Public Favorite Player'}
                </h2>
                <p className="pf-overlay__broadcast-caption">
                  {eliminationActive ? 'The audience has made its call.' : statusLine}
                </p>
              </div>
            </header>
          )}

          {!isComplete ? (
            <div className="pf-overlay__broadcast">
              <div
                className={`pf-overlay__board-shell pf-overlay__board-shell--${phase}${forecastOpen ? ' pf-overlay__board-shell--forecast' : mode === 'favorite' ? ' pf-overlay__board-shell--favorite-live' : ''}`}
              >
                {forecastOpen ? (
                  <ForecastPick
                    candidates={candidates}
                    selectedPlayerId={forecastPickId}
                    canBankEyeoleans={canBankEyeoleans}
                    onSelect={setForecastPickId}
                    onLock={handleForecastLock}
                  />
                ) : (
                  <>
                    <HousemateSpotlight
                      spotlight={spotlight}
                      finalTwoNames={finalTwoNames}
                      revealCountdown={revealCountdown}
                      identitiesHidden={identitiesHidden}
                      showRevealCountdown={showFinalCountdown}
                    />
                    {mode === 'favorite' ? (
                      <>
                        <TopThreeVoteBoard
                          entries={voteEntries}
                          candidatesById={candidatesById}
                          selectedPlayerId={selectedPlayerId}
                          onSelect={setSelectedPlayerId}
                        />
                        <AudiencePlayerRail
                          players={activePlayers}
                          selectedPlayerId={selectedPlayerId}
                          forecastPlayerId={forecastPickId}
                          activeSpotlight={activeSpotlight}
                          onSelect={setSelectedPlayerId}
                        />
                      </>
                    ) : (
                      <VoteRankingBoard
                        entries={voteEntries}
                        candidatesById={candidatesById}
                        selectedPlayerId={selectedPlayerId}
                        onSelect={setSelectedPlayerId}
                        identitiesHidden={identitiesHidden}
                        anonymousLabelsById={anonymousLabelsById}
                      />
                    )}
                    {mode === 'season_winner' && (
                      <FinaleAudienceFeed
                        items={finaleAudienceFeed.slice(
                          Math.max(0, audienceFeedCount - 5),
                          audienceFeedCount
                        )}
                      />
                    )}
                    {!identitiesHidden && (
                      <ViewerSpotlightPanel
                        selectedPlayer={selectedPlayer}
                        activeSpotlight={activeSpotlight}
                        used={spotlightUsed}
                        pending={spotlightPending}
                        canActivate={canActivateSpotlight}
                        onActivate={handleSpotlight}
                      />
                    )}
                    {mode === 'favorite' && forecastPick && (
                      <LiveForecastTracker
                        player={forecastPick}
                        entry={
                          voteEntries.find((entry) => entry.playerId === forecastPick.id) ?? null
                        }
                      />
                    )}
                  </>
                )}
              </div>
              <AnimatePresence>
                {phase === 'intro' && (
                  <motion.div
                    className="pf-overlay__intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="pf-overlay__intro-live">LIVE</span>
                    <p className="pf-overlay__intro-title">
                      {mode === 'season_winner' ? 'Final Public Vote' : 'Public Favorite Vote'}
                    </p>
                    <p className="pf-overlay__intro-subtitle">
                      {mode === 'season_winner'
                        ? 'The percentages go live first. Halfway through, the identities behind them will be revealed.'
                        : 'Season-long audience records are being verified.'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <FinalReveal
              winner={winner}
              runnerUp={runnerUp}
              awardAmount={awardAmount}
              mode={mode}
              forecastPick={forecastPick}
              forecastStreak={resolvedForecastStreak}
              canBankEyeoleans={canBankEyeoleans}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </MotionConfig>
  )
}
