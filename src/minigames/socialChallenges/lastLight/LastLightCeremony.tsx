import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ChallengePortrait } from '../ChallengeStage'
import type { ChallengePlayer } from '../shared'

interface Loss {
  player: ChallengePlayer
  flames: number
  cue: number
}

interface CandleArtwork {
  candle: string
  flame: string
}

export function LastLightCandle({
  state,
  artwork,
}: {
  state: 'steady' | 'guarded' | 'exposed' | 'snuffed'
  artwork: CandleArtwork
}) {
  return (
    <div className="last-light__wax" data-state={state} aria-hidden="true">
      <i className="last-light__candle-glow" />
      <img className="last-light__candle-body" src={artwork.candle} alt="" />
      <div className="last-light__wick">
        <i className="last-light__ember" />
        <i className="last-light__smoke" />
        <img className="last-light__wick-flame" src={artwork.flame} alt="" />
      </div>
    </div>
  )
}

function CandleLoss({
  player,
  flames,
  cue,
  duration,
  still,
  artwork,
}: Loss & { duration: number; still: boolean; artwork: CandleArtwork }) {
  const [revealed, setRevealed] = useState(false)
  const eliminated = flames === 0
  const revealAt = still ? duration : Math.min(duration, cue + (eliminated ? 850 : 560))

  useEffect(() => {
    const timeout = window.setTimeout(() => setRevealed(true), revealAt)
    return () => window.clearTimeout(timeout)
  }, [revealAt])

  return (
    <figure
      className="last-light__candle-shot"
      data-last={eliminated}
      data-revealed={revealed}
      style={{ '--snuff-at': cue + 'ms' } as CSSProperties}
    >
      <LastLightCandle state="snuffed" artwork={artwork} />
      <figcaption>
        <ChallengePortrait player={player} tone={eliminated && revealed ? 'out' : 'neutral'} />
        {revealed && (
          <span className="last-light__candle-caption">
            {eliminated ? 'Eliminated' : flames + (flames === 1 ? ' flame left' : ' flames left')}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

export function LastLightCeremony({
  losses,
  outcome,
  duration,
  still,
  children,
  artwork,
}: {
  losses: Loss[]
  outcome: string
  duration: number
  still: boolean
  children: ReactNode
  artwork: CandleArtwork
}) {
  const [settled, setSettled] = useState(false)
  const [showDeparture, setShowDeparture] = useState(false)
  const eliminated = losses.filter(({ flames }) => flames === 0)
  const firstElimination = eliminated[0]
  const lastElimination = eliminated.at(-1)
  const departure = eliminated.find(({ player }) => player.isHuman) ?? firstElimination
  const departureAt =
    lastElimination === undefined ? undefined : still ? duration : lastElimination.cue + 900

  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(true), duration)
    return () => window.clearTimeout(timeout)
  }, [duration])

  useEffect(() => {
    if (departureAt === undefined) return
    const timeout = window.setTimeout(() => setShowDeparture(true), departureAt)
    return () => window.clearTimeout(timeout)
  }, [departureAt])

  return (
    <>
      <div
        className="last-light__chamber-shot"
        data-settled={settled}
        data-elimination={Boolean(firstElimination)}
        data-departure={showDeparture}
        style={
          firstElimination
            ? ({ '--blackout-at': firstElimination.cue + 'ms' } as CSSProperties)
            : undefined
        }
      >
        <p className="last-light__scene-line" role="status" aria-hidden={showDeparture}>
          {settled ? outcome : losses.length ? 'Watch the flames' : 'The chamber holds its breath'}
        </p>
        {losses.length ? (
          <div
            className="last-light__candle-row"
            data-count={losses.length}
            aria-hidden={showDeparture}
          >
            {losses.map((loss) => (
              <CandleLoss
                key={loss.player.id}
                {...loss}
                duration={duration}
                still={still}
                artwork={artwork}
              />
            ))}
          </div>
        ) : (
          <div className="last-light__candle-shot last-light__candle-shot--held" aria-hidden="true">
            <LastLightCandle state="steady" artwork={artwork} />
          </div>
        )}
        {departure && showDeparture && (
          <div className="last-light__departure" role="status">
            <span className="last-light__departure-ember" aria-hidden="true" />
            <ChallengePortrait player={departure.player} tone="danger" />
            <p>
              {departure.player.isHuman
                ? 'Your last flame is gone'
                : departure.player.name + ' lost their last flame'}
            </p>
            <strong>{departure.player.isHuman ? 'You are eliminated' : 'Eliminated'}</strong>
            {eliminated.length > 1 && (
              <span className="last-light__departure-others">
                Also eliminated ·{' '}
                {eliminated
                  .filter(({ player }) => player.id !== departure.player.id)
                  .map(({ player }) => player.name)
                  .join(', ')}
              </span>
            )}
          </div>
        )}
      </div>
      {settled && children}
    </>
  )
}
