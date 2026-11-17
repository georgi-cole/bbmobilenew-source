import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GameState, Player, TribunalHighlight } from '../../types'
import { useAppSelector } from '../../store/hooks'
import { selectIsVipActive } from '../../store/vipSlice'
import { shouldPlayCinematic } from '../../cinematic/ceremonies/runtime.mjs'
import { captureVipCinematicMediaResolver } from '../../cinematic/media/vipCinematicPack'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { buildTribunalRecapShots } from '../../features/tribunal/tribunalRecapShots'
import { tribunalVoteLabel } from '../../features/tribunal/tribunalHighlights'
import { joinPublicAssetPath } from '../../utils/avatar'
import { statusBadgeImageSrc } from '../../utils/statusBadges'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'
import TribunalCeremonyExcerpt, {
  TRIBUNAL_EXCERPT_MS,
  TRIBUNAL_POWERS_MS,
} from './TribunalCeremonyExcerpt'
import TribunalPowerHolders from './TribunalPowerHolders'
import hubRoom from '../../assets/finale/elimination-living-room.webp'

interface Props {
  game: GameState
  highlight?: TribunalHighlight
  voteReady: boolean
  paused?: boolean
  onSceneNavigationChange?: (navigation: RecapSceneNavigation | null) => void
}

export interface RecapSceneNavigation {
  advance: () => void
}

function FeaturedCutout({
  player,
  arrival,
  voteReady,
}: {
  player: Player
  arrival: boolean
  voteReady: boolean
}) {
  // These legacy formal assets are silhouettes; reuse the visible cutouts as the finale does.
  const formal =
    voteReady &&
    (player.isUser ||
      ![player.id.toLowerCase(), player.name.toLowerCase()].some(
        (name) => name === 'sol' || name === 'bea'
      ))
  const cutout = (
    <FullSizeCutoutImage
      player={player}
      attire={formal ? 'formal' : 'informal'}
      grounded={arrival}
      className="tribunal-highlights__cutout"
      alt={player.name}
      draggable={false}
    />
  )
  return arrival ? (
    <div className="tribunal-highlights__arrival-person">
      <span className="tribunal-highlights__contact-shadow" aria-hidden="true" />
      {cutout}
    </div>
  ) : (
    cutout
  )
}

function FinalistRecord({
  player,
  reduced,
  moment,
}: {
  player: Player
  reduced: boolean
  moment: number
}) {
  const records = [
    {
      label: 'loh wins',
      value: player.stats?.lohWins ?? 0,
      singular: 'LOH win',
      plural: 'LOH wins',
      short: 'LOH',
    },
    {
      label: 'pos wins',
      value: player.stats?.posWins ?? 0,
      singular: 'Safety win',
      plural: 'Safety wins',
      short: 'POS',
    },
    {
      label: 'nominations',
      value: player.stats?.timesNominated ?? 0,
      singular: 'nomination',
      plural: 'nominations',
      short: 'NOM',
    },
  ]
  const record = records[moment % records.length]
  return (
    <div
      className="tribunal-recap__finalist-record"
      role="group"
      aria-label={`${player.name}'s season record`}
    >
      <span className="tribunal-highlights__sr-only">
        {records.map((entry) => (
          <span key={entry.label} aria-label={`${entry.value} ${entry.label}`}>
            {entry.value} {entry.label}.{' '}
          </span>
        ))}
      </span>
      {reduced ? (
        <span className="tribunal-recap__record-static" aria-hidden="true">
          {records.map((entry) => `${entry.value} ${entry.short}`).join(' · ')}
        </span>
      ) : (
        <AnimatePresence initial={false}>
          <motion.div
            key={moment}
            className="tribunal-recap__record-moment"
            aria-hidden="true"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.45 }}
          >
            <strong>{record.value}</strong>
            <span>{record.value === 1 ? record.singular : record.plural}</span>
            <motion.i
              className="tribunal-recap__record-signal"
              initial={{ scaleX: 0, opacity: 0.4 }}
              animate={{ scaleX: 1, opacity: 0.8 }}
              transition={{ duration: 4.2, ease: 'linear' }}
            />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

function EliminatedAvatarTile({ player, reduced }: { player: Player; reduced: boolean }) {
  const [markUnavailable, setMarkUnavailable] = useState(false)
  return (
    <div className="tribunal-recap__avatar-tile" data-testid="tribunal-eliminated-avatar">
      <ResolvedAvatarImage
        id={player.id}
        name={player.name}
        avatar={player.avatar}
        isUser={player.isUser}
        alt={player.name}
        draggable={false}
        className="tribunal-recap__tile-portrait"
        style={reduced ? { animation: 'none' } : undefined}
      />
      <motion.div
        className="tribunal-recap__tile-cross"
        role="img"
        aria-label={`${player.name} eliminated`}
        initial={reduced ? false : { opacity: 0, scale: 1.12 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.18, delay: reduced ? 0 : 0.16 }}
      >
        {markUnavailable ? (
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M16 16 84 84M84 16 16 84" />
          </svg>
        ) : (
          <img
            src={joinPublicAssetPath('evictionmark/evictionmark.png')}
            alt=""
            draggable={false}
            onError={() => setMarkUnavailable(true)}
          />
        )}
      </motion.div>
    </div>
  )
}

function EliminationStamp({ reduced }: { reduced: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <motion.div
      className="tribunal-recap__stamp"
      aria-label="Eliminated"
      initial={reduced ? false : { opacity: 0, scale: 1.18, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      transition={{ duration: reduced ? 0 : 0.22, delay: reduced ? 0 : 0.45 }}
    >
      <img
        src={joinPublicAssetPath('assets/eliminated_stamp.png')}
        alt=""
        onError={() => setFailed(true)}
      />
    </motion.div>
  )
}

function RecapFilm({
  game,
  highlight,
  cinematic,
  reduced,
  onSceneNavigationChange,
  paused,
}: {
  game: GameState
  highlight: TribunalHighlight
  cinematic: boolean
  reduced: boolean
  paused: boolean
  onSceneNavigationChange?: Props['onSceneNavigationChange']
}) {
  const shots = useMemo(() => buildTribunalRecapShots(highlight), [highlight])
  const [index, setIndex] = useState(0)
  const [replay, setReplay] = useState(0)
  const [excerptState, setExcerptState] = useState({ key: '', available: false })
  const [powerBackdrop, setPowerBackdrop] = useState(() => {
    try {
      return captureVipCinematicMediaResolver()('assets/ceremonies/shared/royal-room.webp')
    } catch {
      return hubRoom
    }
  })
  const finalIndex = shots.length - 1
  const shotIndex = cinematic && !reduced ? Math.min(index, finalIndex) : finalIndex
  const shot = shots[shotIndex]
  const finished = shotIndex === finalIndex
  useEffect(() => {
    onSceneNavigationChange?.(
      cinematic && !reduced && !finished
        ? {
            advance: () => setIndex((value) => Math.min(value + 1, finalIndex)),
          }
        : null
    )
    return () => onSceneNavigationChange?.(null)
  }, [cinematic, reduced, finished, finalIndex, onSceneNavigationChange])
  const excerptKey = `${shotIndex}:${replay}`
  const players = useMemo(
    () =>
      shot.playerIds
        .map((id) => game.players.find((player) => player.id === id))
        .filter((player) => player !== undefined),
    [game.players, shot.playerIds]
  )
  const excerptPlayer = players[0]
  const excerptScene =
    cinematic && !reduced && excerptPlayer && shot.kind !== 'exit' && shot.kind !== 'powers'
      ? shot.kind === 'block'
        ? 'nominations'
        : shot.kind
      : null
  const needsExcerpt = Boolean(
    excerptScene || (cinematic && !reduced && excerptPlayer && shot.kind === 'powers')
  )
  const markExcerptReady = useCallback(
    (available: boolean) => setExcerptState({ key: excerptKey, available }),
    [excerptKey]
  )
  useEffect(() => {
    if (paused || !cinematic || reduced || index >= finalIndex) return
    if (needsExcerpt && excerptState.key !== excerptKey) return
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === 'visible')
          setIndex((value) => Math.min(value + 1, finalIndex))
      },
      shot.kind === 'powers' ? TRIBUNAL_POWERS_MS : TRIBUNAL_EXCERPT_MS
    )
    return () => window.clearInterval(timer)
  }, [
    paused,
    cinematic,
    reduced,
    index,
    finalIndex,
    replay,
    needsExcerpt,
    excerptState.key,
    excerptKey,
    shot.kind,
  ])
  return (
    <>
      <AnimatePresence initial={false}>
        <motion.div
          key={`${shotIndex}:${replay}`}
          className={`tribunal-recap__shot tribunal-recap__shot--${shot.kind}`}
          data-excerpt-state={
            needsExcerpt
              ? excerptState.key !== excerptKey
                ? 'loading'
                : excerptState.available
                  ? 'ready'
                  : 'fallback'
              : undefined
          }
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : cinematic ? 0.55 : 0.16 }}
        >
          <motion.img
            className="tribunal-recap__background"
            src={
              shot.kind === 'loh' || shot.kind === 'safety' || shot.kind === 'powers'
                ? powerBackdrop
                : hubRoom
            }
            onError={() => setPowerBackdrop(hubRoom)}
            alt=""
            aria-hidden="true"
            initial={false}
            animate={{ scale: cinematic && !reduced ? 1.045 : 1 }}
            transition={{
              duration: (shot.kind === 'powers' ? TRIBUNAL_POWERS_MS : TRIBUNAL_EXCERPT_MS) / 1000,
              ease: 'linear',
            }}
          />
          <div className="tribunal-recap__shade" aria-hidden="true" />
          <div className="tribunal-highlights__screen-label">
            <span className="tribunal-highlights__led" />
            DAY {highlight.week} · {shot.label}
          </div>
          {shot.kind === 'powers' ? (
            <TribunalPowerHolders
              players={players}
              lohId={highlight.lohId}
              posWinnerId={highlight.posWinnerId}
              onReady={markExcerptReady}
            />
          ) : finished ? (
            <div className="tribunal-recap__exit-tiles">
              {players.map((player) => (
                <EliminatedAvatarTile key={player.id} player={player} reduced={reduced} />
              ))}
            </div>
          ) : (
            <div
              className={`tribunal-highlights__figures tribunal-recap__cast${players.length > 1 ? ' tribunal-recap__cast--group' : ''}`}
            >
              {players.map((player) => (
                <motion.div
                  className="tribunal-highlights__figure"
                  key={player.id}
                  initial={reduced ? false : { opacity: 0, x: 7 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduced ? 0 : 0.35 }}
                >
                  <FullSizeCutoutImage
                    player={player}
                    attire="informal"
                    alt={player.name}
                    className="tribunal-highlights__cutout"
                    draggable={false}
                  />
                  <div className="tribunal-highlights__nameplate">
                    <strong>{player.name}</strong>
                    <span>
                      {shot.kind === 'safety' && player.id === highlight.savedId
                        ? 'SAVED'
                        : shot.label}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {(shot.kind === 'loh' || shot.kind === 'safety') && (
            <img
              className="tribunal-recap__badge"
              src={statusBadgeImageSrc(shot.kind === 'loh' ? 'loh' : 'pos')}
              alt=""
              aria-hidden="true"
            />
          )}
          {excerptScene && excerptPlayer && (
            <>
              <TribunalCeremonyExcerpt
                scene={excerptScene}
                players={players}
                onReady={markExcerptReady}
              />
              {shot.kind !== 'block' && (
                <div className="tribunal-recap__excerpt-name">
                  <strong>{excerptPlayer.name}</strong>
                  <span>
                    {shot.kind === 'safety' && highlight.savedId
                      ? `Saved ${game.players.find((player) => player.id === highlight.savedId)?.name ?? 'a nominee'}`
                      : shot.label}
                  </span>
                </div>
              )}
            </>
          )}
          {finished && (
            <>
              <div className="tribunal-recap__exit-summary">
                <span>{players.length > 1 ? 'JOIN THE TRIBUNAL' : 'JOINS THE TRIBUNAL'}</span>
                {players.map((player) => (
                  <div key={player.id}>
                    <strong>{player.name}</strong>
                    <small>{tribunalVoteLabel(highlight, player.id) ?? 'ELIMINATED'}</small>
                  </div>
                ))}
              </div>
              <EliminationStamp reduced={reduced} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {cinematic && !reduced && (
        <div className="tribunal-recap__film-controls">
          <div
            className="tribunal-recap__beats"
            aria-label={`Recap moment ${shotIndex + 1} of ${shots.length}`}
          >
            {shots.map((entry, number) => (
              <i key={entry.kind} className={number <= shotIndex ? 'is-seen' : ''} />
            ))}
          </div>
          <button
            onClick={() => {
              if (finished) {
                setIndex(0)
                setReplay((value) => value + 1)
              } else setIndex(finalIndex)
            }}
          >
            {finished ? 'Replay recap' : 'Show result'}
          </button>
        </div>
      )}
    </>
  )
}

/** The screen shell never unmounts between days; only its broadcast contents change. */
export default function TribunalRecapScreen({
  game,
  highlight,
  voteReady,
  onSceneNavigationChange,
  paused = false,
}: Props) {
  const vip = useAppSelector(selectIsVipActive)
  const settings = useAppSelector((state) => state.settings)
  const reduced = usePresentationReducedMotion()
  const staticRecords = reduced || !settings.gameUX.animations
  const [finalistMoment, setFinalistMoment] = useState(0)
  useEffect(() => {
    if (paused || !voteReady || staticRecords) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setFinalistMoment((value) => (value + 1) % 3)
    }, 4500)
    return () => window.clearInterval(timer)
  }, [voteReady, staticRecords, paused])
  const demoFilm =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('recapStyle') === 'cinematic'
  const cinematic =
    !reduced &&
    settings.gameUX.animations &&
    (demoFilm || shouldPlayCinematic({ game, settings }, vip))
  const arrival = !highlight && !voteReady
  const featured = voteReady
    ? game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    : game.players.filter((player) => player.isUser)
  return (
    <div
      className={`tribunal-highlights__screen${arrival ? ' tribunal-highlights__screen--arrival' : ''}${voteReady ? ' tribunal-highlights__screen--finalists' : ''}`}
      data-testid="tribunal-broadcast-frame"
    >
      {highlight && !voteReady ? (
        <RecapFilm
          key={highlight.id}
          game={game}
          highlight={highlight}
          cinematic={cinematic}
          reduced={reduced}
          onSceneNavigationChange={onSceneNavigationChange}
          paused={paused}
        />
      ) : (
        <>
          {voteReady && (
            <>
              <img
                className="tribunal-recap__finalist-background"
                src={hubRoom}
                alt=""
                aria-hidden="true"
              />
              <div className="tribunal-recap__finalist-shade" aria-hidden="true" />
            </>
          )}
          {arrival && (
            <div className="tribunal-highlights__room" aria-hidden="true">
              <img
                className="tribunal-highlights__city"
                src={joinPublicAssetPath('assets/tribunal/phone-city-v8.webp')}
                alt=""
              />
              <img
                className="tribunal-highlights__backplate"
                src={joinPublicAssetPath('assets/tribunal/sequester-room-v9.webp')}
                alt=""
              />
              <div className="tribunal-highlights__window-glow" />
            </div>
          )}
          <div className="tribunal-highlights__screen-label">
            <span className="tribunal-highlights__led" />
            {arrival ? 'WELCOME TO SEQUESTER' : 'THE FINALISTS'}
          </div>
          <div className="tribunal-highlights__spotlight" aria-hidden="true" />
          <div
            className={`tribunal-highlights__figures${featured.length > 1 ? ' tribunal-recap__cast--group' : ''}`}
          >
            {featured.map((player) => (
              <div className="tribunal-highlights__figure" key={player.id}>
                <FeaturedCutout player={player} arrival={arrival} voteReady={voteReady} />
                <div className="tribunal-highlights__nameplate">
                  <strong>{player.name}</strong>
                  {voteReady ? (
                    <FinalistRecord
                      player={player}
                      reduced={staticRecords}
                      moment={finalistMoment}
                    />
                  ) : (
                    <span>TRIBUNAL MEMBER</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="tribunal-highlights__screen-edge" aria-hidden="true" />
    </div>
  )
}
