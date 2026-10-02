import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Player as RemotionPlayer, type PlayerRef } from '@remotion/player'
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './SeasonCastOpeningCinematic.css'

const FPS = 30
const INTRO_FRAMES = 48
const REVEAL_FRAMES = 36
const FINALE_FRAMES = 78
const BASE = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '')

const ACCENTS = ['#c78cff', '#f3c56f', '#8fe8ff', '#ff95c8', '#c4ff9a', '#a9a4ff'] as const

type ShotVariant = 'left' | 'right' | 'center' | 'prism'

interface CastFilmProps {
  players: Player[]
  season: number
  gameId: string
}

export interface SeasonCastOpeningCinematicProps extends CastFilmProps {
  onComplete: () => void
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededCastOrder(players: Player[], gameId: string): Player[] {
  const user = players.find((player) => player.isUser)
  const others = players
    .filter((player) => player !== user)
    .map((player) => ({
      player,
      weight: hashText(`${gameId}:${player.id}:${player.name}`),
    }))
    .sort((a, b) => a.weight - b.weight || a.player.name.localeCompare(b.player.name))
    .map(({ player }) => player)

  return user ? [...others, user] : others
}

export function getSeasonCastOpeningDuration(playerCount: number): number {
  return INTRO_FRAMES + Math.max(1, playerCount) * REVEAL_FRAMES + FINALE_FRAMES
}

function easeInOut(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

function openingOpacity(frame: number, duration: number): number {
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })
  const fadeOut = interpolate(frame, [duration - 18, duration - 1], [1, 0], {
    extrapolateLeft: 'clamp',
  })
  return Math.min(fadeIn, fadeOut)
}

function FilmAudio({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const volume = openingOpacity(frame, durationInFrames) * 0.7

  return (
    <Audio
      src={`${BASE}/assets/sounds/minigames/move_into_me_alternative.mp3`}
      trimBefore={Math.round(46 * fps)}
      volume={volume}
      pauseWhenBuffering
    />
  )
}

function EyeStage({
  frame,
  accent,
  variant,
  pulse = 0,
}: {
  frame: number
  accent: string
  variant: ShotVariant | 'finale'
  pulse?: number
}) {
  const drift = Math.sin(frame / 19) * 2.2
  const sweep = ((frame * 1.45) % 170) - 35

  return (
    <AbsoluteFill
      className="season-cast-film__stage"
      data-variant={variant}
      style={
        {
          '--cast-accent': accent,
          '--cast-stage-drift': `${drift}%`,
          '--cast-stage-sweep': `${sweep}%`,
          '--cast-stage-pulse': pulse,
        } as React.CSSProperties
      }
    >
      <div className="season-cast-film__stage-vignette" />
      <div className="season-cast-film__eye">
        <span />
        <i />
        <b />
      </div>
      <div className="season-cast-film__beam season-cast-film__beam--a" />
      <div className="season-cast-film__beam season-cast-film__beam--b" />
      <div className="season-cast-film__beam season-cast-film__beam--c" />
      <div className="season-cast-film__floor" />
      <div className="season-cast-film__scan" />
    </AbsoluteFill>
  )
}

function OpeningTitle({ season }: { season: number }) {
  const frame = useCurrentFrame()
  const titleProgress = easeInOut(
    interpolate(frame, [5, 27], [0, 1], { extrapolateRight: 'clamp' })
  )
  const irisProgress = easeInOut(interpolate(frame, [0, 34], [0, 1], { extrapolateRight: 'clamp' }))
  const flash = interpolate(frame, [31, 35, 42], [0, 0.82, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill className="season-cast-film__opening">
      <EyeStage frame={frame} accent="#c78cff" variant="center" pulse={irisProgress} />
      <div
        className="season-cast-film__opening-iris"
        style={{
          transform: `scale(${0.68 + irisProgress * 0.36})`,
          opacity: 0.2 + irisProgress * 0.8,
        }}
      />
      <div
        className="season-cast-film__opening-copy"
        style={{
          opacity: titleProgress,
          transform: `translateY(${(1 - titleProgress) * 26}px) scale(${0.96 + titleProgress * 0.04})`,
        }}
      >
        <span>THE</span>
        <strong>BIG EYE</strong>
        <small>SEASON {season}</small>
      </div>
      <div className="season-cast-film__flash" style={{ opacity: flash }} />
    </AbsoluteFill>
  )
}

function ContestantShot({
  player,
  index,
  total,
  variant,
  accent,
}: {
  player: Player
  index: number
  total: number
  variant: ShotVariant
  accent: string
}) {
  const frame = useCurrentFrame()
  const progress = frame / Math.max(1, REVEAL_FRAMES - 1)
  const enter = easeInOut(interpolate(frame, [0, 11], [0, 1], { extrapolateRight: 'clamp' }))
  const exit = easeInOut(
    interpolate(frame, [REVEAL_FRAMES - 9, REVEAL_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
    })
  )
  const visible = enter * (1 - exit)
  const direction = variant === 'right' ? -1 : 1
  const heroScale = 1.08 - enter * 0.06 + exit * 0.035
  const x = direction * ((1 - enter) * 150 - exit * 90)
  const glow = interpolate(progress, [0, 0.42, 1], [0.3, 1, 0.55])
  const isUser = player.isUser === true

  return (
    <AbsoluteFill
      className="season-cast-film__shot"
      data-variant={variant}
      style={{ '--cast-accent': accent } as React.CSSProperties}
    >
      <EyeStage frame={frame + index * 17} accent={accent} variant={variant} pulse={glow} />

      <div
        className="season-cast-film__ghost-name"
        style={{
          opacity: visible * 0.12,
          transform: `translateX(${direction * (1 - enter) * 70}px)`,
        }}
        aria-hidden="true"
      >
        {player.name}
      </div>

      <div
        className="season-cast-film__portrait-shell"
        style={{
          opacity: visible,
          transform: `translate3d(${x}px, ${(1 - enter) * 20}px, 0) scale(${heroScale})`,
          filter: `blur(${(1 - enter) * 8}px)`,
        }}
      >
        <div className="season-cast-film__portrait-halo" />
        <FullSizeCutoutImage
          player={player}
          attire="informal"
          alt={player.name}
          className="season-cast-film__portrait"
          loading="eager"
          draggable={false}
        />
      </div>

      <div
        className="season-cast-film__nameplate"
        style={{
          opacity: visible,
          transform: `translate3d(${direction * -1 * (1 - enter) * 55}px, 0, 0)`,
        }}
      >
        <span>
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <h1>{player.name}</h1>
        <p>{isUser ? 'YOUR SEASON STARTS NOW' : 'HOUSEMATE'}</p>
        {isUser && <b>YOU</b>}
      </div>

      <div
        className="season-cast-film__wipe"
        style={{
          opacity: Math.min(1, exit * 1.35),
          transform: `translateX(${(1 - exit) * -118}%) skewX(-12deg)`,
        }}
      />
    </AbsoluteFill>
  )
}

function FinaleCast({ players, season }: { players: Player[]; season: number }) {
  const frame = useCurrentFrame()
  const enter = easeInOut(interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' }))
  const title = easeInOut(interpolate(frame, [16, 38], [0, 1], { extrapolateRight: 'clamp' }))
  const exit = easeInOut(
    interpolate(frame, [FINALE_FRAMES - 16, FINALE_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
    })
  )

  return (
    <AbsoluteFill className="season-cast-film__finale">
      <EyeStage frame={frame + 240} accent="#d8a8ff" variant="finale" pulse={enter} />
      <div className="season-cast-film__finale-grid" style={{ opacity: enter * (1 - exit) }}>
        {players.map((player, index) => {
          const stagger = Math.max(
            0,
            easeInOut(
              interpolate(frame, [index * 1.7, 20 + index * 1.7], [0, 1], {
                extrapolateRight: 'clamp',
              })
            )
          )
          return (
            <div
              className="season-cast-film__finale-person"
              key={player.id}
              style={{
                opacity: stagger,
                transform: `translateY(${(1 - stagger) * 34}px) scale(${0.94 + stagger * 0.06})`,
              }}
            >
              <PlayerAvatar
                player={player}
                size="md"
                showEvictedStyle={false}
                showRelationshipOutline={false}
              />
              <span>{player.name}</span>
            </div>
          )
        })}
      </div>
      <div
        className="season-cast-film__finale-title"
        style={{
          opacity: title * (1 - exit),
          transform: `translateY(${(1 - title) * 24}px)`,
        }}
      >
        <span>SEASON {season}</span>
        <strong>THE BIG EYE</strong>
        <small>THE CAST IS IN</small>
      </div>
      <div className="season-cast-film__finale-dark" style={{ opacity: exit }} />
    </AbsoluteFill>
  )
}

function SeasonCastFilm({ players, season, gameId }: CastFilmProps) {
  const orderedPlayers = useMemo(() => seededCastOrder(players, gameId), [gameId, players])
  const durationInFrames = getSeasonCastOpeningDuration(orderedPlayers.length)

  return (
    <AbsoluteFill className="season-cast-film">
      <FilmAudio durationInFrames={durationInFrames} />

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <OpeningTitle season={season} />
      </Sequence>

      {orderedPlayers.map((player, index) => {
        const variantIndex = hashText(`${gameId}:${player.id}:shot`) % 4
        const variant = (['left', 'right', 'center', 'prism'] as const)[variantIndex]
        const accent = ACCENTS[(hashText(`${gameId}:${player.id}:accent`) + index) % ACCENTS.length]
        return (
          <Sequence
            key={player.id}
            from={INTRO_FRAMES + index * REVEAL_FRAMES}
            durationInFrames={REVEAL_FRAMES}
          >
            <ContestantShot
              player={player}
              index={index}
              total={orderedPlayers.length}
              variant={variant}
              accent={accent}
            />
          </Sequence>
        )
      })}

      <Sequence
        from={INTRO_FRAMES + orderedPlayers.length * REVEAL_FRAMES}
        durationInFrames={FINALE_FRAMES}
      >
        <FinaleCast players={orderedPlayers} season={season} />
      </Sequence>

      <div className="season-cast-film__grain" aria-hidden="true" />
    </AbsoluteFill>
  )
}

export default function SeasonCastOpeningCinematic({
  players,
  season,
  gameId,
  onComplete,
}: SeasonCastOpeningCinematicProps) {
  const playerRef = useRef<PlayerRef>(null)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const orderedPlayers = useMemo(() => seededCastOrder(players, gameId), [gameId, players])
  const durationInFrames = getSeasonCastOpeningDuration(orderedPlayers.length)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return undefined

    const finish = () => {
      if (completedRef.current) return
      completedRef.current = true
      onCompleteRef.current()
    }

    player.addEventListener('ended', finish)
    return () => player.removeEventListener('ended', finish)
  }, [])

  const finish = () => {
    if (completedRef.current) return
    completedRef.current = true
    onCompleteRef.current()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="season-cast-opening"
      role="dialog"
      aria-modal="true"
      aria-label="Season cast opening cinematic"
    >
      <div className="season-cast-opening__player">
        <RemotionPlayer
          ref={playerRef}
          component={SeasonCastFilm}
          inputProps={{ players: orderedPlayers, season, gameId }}
          durationInFrames={durationInFrames}
          compositionWidth={1080}
          compositionHeight={1920}
          fps={FPS}
          controls={false}
          autoPlay
          clickToPlay={false}
          loop={false}
          acknowledgeRemotionLicense
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="season-cast-opening__preload" aria-hidden="true">
        {orderedPlayers.map((player) => (
          <FullSizeCutoutImage
            key={player.id}
            player={player}
            attire="informal"
            alt=""
            loading="eager"
          />
        ))}
      </div>
      <button type="button" className="season-cast-opening__skip" onClick={finish}>
        Skip intro
      </button>
    </div>,
    document.body
  )
}
