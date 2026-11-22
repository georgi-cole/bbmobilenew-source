import { useState, type CSSProperties, type ReactNode } from 'react'
import { resolveAvatarCandidates } from '../../utils/avatar'
import type { ChallengePlayer } from './shared'
import type { ChallengeGame } from './useChallengeAudio'
import './challengeStage.css'

export function ChallengeStage({
  game,
  title,
  subtitle,
  scenery,
  background,
  cinematic,
  children,
}: {
  game: ChallengeGame
  title: string
  subtitle?: string
  scenery?: ReactNode
  background?: string
  cinematic?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`social-challenge social-challenge--${game}`}
      data-presentation={cinematic === undefined ? undefined : cinematic ? 'cinematic' : 'standard'}
      aria-label={title}
      style={
        background ? ({ '--challenge-art': `url("${background}")` } as CSSProperties) : undefined
      }
    >
      <div className="social-challenge__art" aria-hidden="true" />
      {scenery}
      <div className="social-challenge__body">
        <header className="social-challenge__header">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </header>
        {children}
      </div>
    </section>
  )
}

export function ChallengePortrait({
  player,
  children,
  tone = 'neutral',
}: {
  player: ChallengePlayer
  children?: ReactNode
  tone?: 'neutral' | 'safe' | 'danger' | 'out'
}) {
  const [imageIndex, setImageIndex] = useState(0)
  const candidates = resolveAvatarCandidates({
    id: player.id,
    name: player.name,
    avatar: player.avatar ?? '',
    isUser: player.isHuman,
  })
  const image = candidates[imageIndex]
  return (
    <span className={`social-challenge__portrait social-challenge__portrait--${tone}`}>
      <span className="social-challenge__avatar">
        <span aria-hidden="true">{player.name.slice(0, 1).toLocaleUpperCase()}</span>
        {image && (
          <img
            src={image}
            alt=""
            decoding="async"
            onError={() => setImageIndex((current) => current + 1)}
          />
        )}
      </span>
      <span className="social-challenge__name" title={player.name}>
        {player.name}
      </span>
      {children}
    </span>
  )
}
