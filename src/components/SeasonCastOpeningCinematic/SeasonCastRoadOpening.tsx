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
import './SeasonCastOpeningRoad.css'

const FPS = 30
const INTRO_FRAMES = 60
const TRAVEL_FRAMES = 24
const REVEAL_FRAMES = 48
const SEGMENT_FRAMES = TRAVEL_FRAMES + REVEAL_FRAMES
const FINALE_FRAMES = 84
const BASE = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '')

const ACCENTS = ['#c78cff', '#f3c56f', '#8fe8ff', '#ff95c8', '#c4ff9a', '#a9a4ff'] as const

type RoadSide = 'left' | 'right'

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

function getDuration(playerCount: number): number {
  return INTRO_FRAMES + Math.max(1, playerCount) * SEGMENT_FRAMES + FINALE_FRAMES
}

function ease(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

function FilmAudio({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames - 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <Audio
      src={`${BASE}/assets/sounds/minigames/move_into_me_alternative.mp3`}
      trimBefore={Math.round(46 * fps)}
      volume={Math.min(fadeIn, fadeOut) * 0.72}
      pauseWhenBuffering
    />
  )
}

function RoadWorld({ frame, durationInFrames }: { frame: number; durationInFrames: number }) {
  const journey = Math.min(1, frame / Math.max(1, durationInFrames - 1))
  const bank = Math.sin(frame / 23) * 0.85
  const drift = Math.sin(frame / 37) * 1.2
  const dashOffset = (frame * 26) % 220
  const shoulderOffset = (frame * 18) % 160

  return (
    <AbsoluteFill
      className="season-cast-road"
      style={
        {
          '--road-bank': `${bank}deg`,
          '--road-horizon-drift': `${drift}%`,
          '--road-dash-offset': `${dashOffset}px`,
          '--road-shoulder-offset': `${shoulderOffset}px`,
        } as React.CSSProperties
      }
    >
      <div className="season-cast-road__sky" />
      <div className="season-cast-road__eye" aria-hidden="true">
        <span />
        <i />
      </div>
      <div className="season-cast-road__mountains season-cast-road__mountains--far" />
      <div className="season-cast-road__mountains season-cast-road__mountains--near" />
      <div className="season-cast-road__ground" />
      <div className="season-cast-road__road">
        <div className="season-cast-road__lane" />
        <div className="season-cast-road__edge season-cast-road__edge--left" />
        <div className="season-cast-road__edge season-cast-road__edge--right" />
      </div>
      {Array.from({ length: 8 }).map((_, index) => {
        const depth = (frame * 0.025 + index / 8) % 1
        const easedDepth = depth * depth
        return (
          <div
            key={`left-${index}`}
            className="season-cast-road__post"
            style={{
              top: `${36 + easedDepth * 62}%`,
              left: `${50 - (14 + easedDepth * 34)}%`,
              opacity: Math.min(1, 0.22 + easedDepth * 0.92),
              transform: `translate(-50%, -50%) scale(${0.2 + easedDepth * 1.22})`,
            }}
          />
        )
      })}
      {Array.from({ length: 8 }).map((_, index) => {
        const depth = (frame * 0.025 + index / 8 + 0.5) % 1
        const easedDepth = depth * depth
        return (
          <div
            key={`right-${index}`}
            className="season-cast-road__post"
            style={{
              top: `${36 + easedDepth * 62}%`,
              left: `${50 + (14 + easedDepth * 34)}%`,
              opacity: Math.min(1, 0.22 + easedDepth * 0.92),
              transform: `translate(-50%, -50%) scale(${0.2 + easedDepth * 1.22})`,
            }}
          />
        )
      })}
      <div className="season-cast-road__hud" aria-hidden="true">
        <span>THE BIG EYE</span>
        <i style={{ transform: `scaleX(${Math.max(0.03, journey)})` }} />
      </div>
      <div className="season-cast-road__vignette" />
    </AbsoluteFill>
  )
}

function OpeningTitle({ season }: { season: number }) {
  const frame = useCurrentFrame()
  const enter = ease(
    interpolate(frame, [4, 28], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const exit = ease(
    interpolate(frame, [INTRO_FRAMES - 18, INTRO_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )

  return (
    <AbsoluteFill className="season-cast-opening-title" style={{ opacity: enter * (1 - exit) }}>
      <div
        className="season-cast-opening-title__copy"
        style={{ transform: `translateY(${(1 - enter) * 44}px) scale(${0.95 + enter * 0.05})` }}
      >
        <span>THE ROAD TO</span>
        <strong>THE BIG EYE</strong>
        <small>SEASON {season}</small>
      </div>
      <div className="season-cast-opening-title__route">
        <i />
        <b />
      </div>
    </AbsoluteFill>
  )
}

function TravelCue({
  player,
  index,
  total,
  side,
  accent,
}: {
  player: Player
  index: number
  total: number
  side: RoadSide
  accent: string
}) {
  const frame = useCurrentFrame()
  const approach = ease(
    interpolate(frame, [0, TRAVEL_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const markerX = side === 'left' ? 29 : 71
  const markerOpacity = interpolate(approach, [0, 0.18, 1], [0, 0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      className="season-cast-travel-cue"
      style={{ '--cast-accent': accent } as React.CSSProperties}
    >
      <div
        className="season-cast-travel-cue__marker"
        style={{
          left: `${markerX}%`,
          top: `${42 + approach * 39}%`,
          opacity: markerOpacity,
          transform: `translate(-50%, -50%) scale(${0.34 + approach * 1.25})`,
        }}
      >
        <span>{String(index + 1).padStart(2, '0')}</span>
      </div>
      <div
        className={`season-cast-travel-cue__name season-cast-travel-cue__name--${side}`}
        style={{
          opacity: interpolate(approach, [0.45, 1], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <small>
          NEXT HOUSEMATE · {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </small>
        <strong>{player.name}</strong>
      </div>
      <div
        className="season-cast-travel-cue__rush"
        style={{
          opacity: interpolate(approach, [0.55, 1], [0, 0.9], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      />
    </AbsoluteFill>
  )
}

function ContestantReveal({
  player,
  index,
  total,
  side,
  accent,
}: {
  player: Player
  index: number
  total: number
  side: RoadSide
  accent: string
}) {
  const frame = useCurrentFrame()
  const enter = ease(
    interpolate(frame, [0, 13], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const exit = ease(
    interpolate(frame, [REVEAL_FRAMES - 12, REVEAL_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const portal = enter * (1 - exit)
  const originX = side === 'left' ? 29 : 71
  const direction = side === 'left' ? -1 : 1
  const isUser = player.isUser === true

  return (
    <AbsoluteFill
      className="season-cast-reveal"
      data-side={side}
      style={
        {
          '--cast-accent': accent,
          clipPath: `circle(${7 + portal * 122}% at ${originX}% 61%)`,
          transform: `scale(${0.94 + portal * 0.06})`,
        } as React.CSSProperties
      }
    >
      <div className="season-cast-reveal__backdrop" />
      <div className="season-cast-reveal__roadline" />
      <div className="season-cast-reveal__spotlight season-cast-reveal__spotlight--a" />
      <div className="season-cast-reveal__spotlight season-cast-reveal__spotlight--b" />
      <div className="season-cast-reveal__number" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        className="season-cast-reveal__portrait-shell"
        style={{
          opacity: portal,
          transform: `translate3d(${
            direction * (1 - enter) * 170 + direction * exit * 85
          }px, ${(1 - enter) * 34}px, 0) scale(${1.08 - enter * 0.05 + exit * 0.04})`,
          filter: `blur(${(1 - enter) * 7}px)`,
        }}
      >
        <div className="season-cast-reveal__halo" />
        <FullSizeCutoutImage
          player={player}
          attire="informal"
          alt={player.name}
          className="season-cast-reveal__portrait"
          loading="eager"
          draggable={false}
        />
      </div>
      <div
        className="season-cast-reveal__nameplate"
        style={{
          opacity: portal,
          transform: `translate3d(${direction * -1 * (1 - enter) * 70}px, ${
            (1 - enter) * 20
          }px, 0)`,
        }}
      >
        <span>
          HOUSEMATE {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <h1>{player.name}</h1>
        <p>{isUser ? 'YOUR ROAD STARTS HERE' : 'ON THE ROAD TO THE BIG EYE'}</p>
        {isUser && <b>YOU</b>}
      </div>
      <div className="season-cast-reveal__grain" />
      <div className="season-cast-reveal__pullback" style={{ opacity: Math.min(1, exit * 1.2) }} />
    </AbsoluteFill>
  )
}

function FinaleCast({ players, season }: { players: Player[]; season: number }) {
  const frame = useCurrentFrame()
  const enter = ease(
    interpolate(frame, [0, 26], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const title = ease(
    interpolate(frame, [16, 40], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const exit = ease(
    interpolate(frame, [FINALE_FRAMES - 18, FINALE_FRAMES - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )

  return (
    <AbsoluteFill className="season-cast-finale" style={{ opacity: 1 - exit }}>
      <div className="season-cast-finale__destination">
        <span>DESTINATION</span>
        <strong>THE BIG EYE</strong>
      </div>
      <div className="season-cast-finale__grid" style={{ opacity: enter }}>
        {players.map((player, index) => {
          const stagger = ease(
            interpolate(frame, [index * 1.6, 19 + index * 1.6], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          )
          return (
            <div
              className="season-cast-finale__person"
              key={player.id}
              style={{
                opacity: stagger,
                transform: `translateY(${(1 - stagger) * 28}px) scale(${0.92 + stagger * 0.08})`,
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
        className="season-cast-finale__title"
        style={{
          opacity: title,
          transform: `translateY(${(1 - title) * 28}px)`,
        }}
      >
        <span>SEASON {season}</span>
        <strong>THE CAST IS IN</strong>
        <small>THE ROAD ENDS. THE GAME BEGINS.</small>
      </div>
    </AbsoluteFill>
  )
}

function SeasonCastFilm({ players, season, gameId }: CastFilmProps) {
  const frame = useCurrentFrame()
  const orderedPlayers = useMemo(() => seededCastOrder(players, gameId), [gameId, players])
  const durationInFrames = getDuration(orderedPlayers.length)

  return (
    <AbsoluteFill className="season-cast-film">
      <FilmAudio durationInFrames={durationInFrames} />
      <RoadWorld frame={frame} durationInFrames={durationInFrames} />

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <OpeningTitle season={season} />
      </Sequence>

      {orderedPlayers.map((player, index) => {
        const segmentStart = INTRO_FRAMES + index * SEGMENT_FRAMES
        const side: RoadSide =
          hashText(`${gameId}:${player.id}:road-side`) % 2 === 0 ? 'left' : 'right'
        const accent = ACCENTS[(hashText(`${gameId}:${player.id}:accent`) + index) % ACCENTS.length]

        return (
          <AbsoluteFill key={player.id}>
            <Sequence from={segmentStart} durationInFrames={TRAVEL_FRAMES}>
              <TravelCue
                player={player}
                index={index}
                total={orderedPlayers.length}
                side={side}
                accent={accent}
              />
            </Sequence>
            <Sequence from={segmentStart + TRAVEL_FRAMES} durationInFrames={REVEAL_FRAMES}>
              <ContestantReveal
                player={player}
                index={index}
                total={orderedPlayers.length}
                side={side}
                accent={accent}
              />
            </Sequence>
          </AbsoluteFill>
        )
      })}

      <Sequence
        from={INTRO_FRAMES + orderedPlayers.length * SEGMENT_FRAMES}
        durationInFrames={FINALE_FRAMES}
      >
        <FinaleCast players={orderedPlayers} season={season} />
      </Sequence>

      <div className="season-cast-film__grain" aria-hidden="true" />
    </AbsoluteFill>
  )
}

export default function SeasonCastRoadOpening({
  players,
  season,
  gameId,
  onComplete,
}: SeasonCastOpeningCinematicProps) {
  const playerRef = useRef<PlayerRef>(null)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const orderedPlayers = useMemo(() => seededCastOrder(players, gameId), [gameId, players])
  const durationInFrames = getDuration(orderedPlayers.length)

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
