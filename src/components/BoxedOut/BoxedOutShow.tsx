import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import type { BoxedOutPlayer, BoxId } from '../../features/boxedOut/rules'
import { crowdVisible, reached, type ShowBeat } from './presentation'

export const BOX_ASSET_BASE = `${import.meta.env.BASE_URL}assets/minigames/boxed-out/`
const ART = ['amber', 'teal', 'violet']

export function EyeGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={`bo-eye ${className}`} viewBox="0 0 120 80" fill="none" aria-hidden="true">
      <path className="bo-eye__outline" d="M5 40Q60-18 115 40Q60 98 5 40Z" />
      <circle className="bo-eye__iris" cx="60" cy="40" r="25" />
      <path className="bo-eye__pupil" d="M60 22Q48 40 60 58Q72 40 60 22Z" />
      <path className="bo-eye__fracture" d="M63 3L54 27L66 40L55 54L63 77" />
    </svg>
  )
}

export function ScoreCounter({ value, from = value }: { value: number; from?: number }) {
  const [shown, setShown] = useState(from)
  const current = useRef(from)
  useEffect(() => {
    const from = current.current
    if (from === value) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = window.setTimeout(() => {
        current.current = value
        setShown(value)
      }, 0)
      return () => window.clearTimeout(timer)
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 850)
      current.current = Math.round(from + (value - from) * (1 - (1 - progress) ** 3))
      setShown(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <span aria-label={value.toLocaleString('en-US')}>{shown.toLocaleString('en-US')}</span>
}

export function BoxedOutBox({
  box,
  value,
  selected,
  locked,
  occupancy = 0,
  exploded,
  reveal,
  beat,
  names,
  onSelect,
}: {
  box: BoxId
  value: number
  selected: boolean
  locked: boolean
  occupancy?: number
  exploded: boolean
  reveal: boolean
  beat: ShowBeat
  names: string[]
  onSelect: () => void
}) {
  const crowd = reveal && crowdVisible(beat, box)
  const broken = exploded && reached(beat, 'impact')
  const safe = reveal && !exploded && reached(beat, 'consequence')
  const source = `${BOX_ASSET_BASE}box-${ART[box]}.webp`
  return (
    <motion.button
      layout
      transition={{ layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } }}
      type="button"
      className={[
        'boxed-out-box',
        `boxed-out-box--${box}`,
        selected ? 'boxed-out-box--selected' : '',
        crowd ? 'bo-box--counted' : '',
        broken ? 'bo-box--broken' : '',
        safe ? 'bo-box--safe' : '',
        exploded && reveal && reached(beat, 'danger') ? 'bo-box--condemned' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      disabled={locked || reveal}
      aria-label={`Box ${'ABC'[box]}: ${value} points${selected ? ', selected' : ''}`}
      aria-pressed={selected}
    >
      <span className="boxed-out-box__stage">
        <span className="boxed-out-box__halo" aria-hidden="true" />
        <span className="bo-box__interior" aria-hidden="true" />
        <span className="boxed-out-box__image-wrap">
          <img className="boxed-out-box__art" src={source} alt="" draggable={false} />
        </span>
        <span className="bo-box__opened" aria-hidden="true">
          <img src={`${BOX_ASSET_BASE}box-${ART[box]}-open.webp`} alt="" draggable={false} />
        </span>
        {reveal && beat === 'sealing' && selected && (
          <span className="bo-box__lock" aria-hidden="true">
            <EyeGlyph />
          </span>
        )}
        {broken && (
          <span className="bo-box__destruction" aria-hidden="true">
            <span className="bo-box__beam" />
            <span className="bo-box__blast" />
            <span className="bo-box__dust" />
            {Array.from({ length: 6 }, (_, i) => (
              <span className={`bo-box__fragment bo-box__fragment--${i}`} key={i}>
                <img src={source} alt="" draggable={false} />
              </span>
            ))}
            <img
              className="bo-box__ruins"
              src={`${BOX_ASSET_BASE}${box === 0 ? 'chest-ruins' : `chest-ruins-${ART[box]}`}.webp`}
              alt=""
              draggable={false}
            />
          </span>
        )}
        {safe && (
          <span className="bo-box__treasure" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} style={{ '--mote': i } as CSSProperties} />
            ))}
          </span>
        )}
      </span>
      <span className="bo-box__caption">
        <span className="bo-box__letter" aria-hidden="true">
          {'ABC'[box]}
        </span>
        <span className="boxed-out-box__reward">{value.toLocaleString('en-US')}</span>
      </span>
      <span className="boxed-out-box__points">POINTS</span>
      <span
        className={`bo-box__crowd${reveal ? '' : ' bo-box__crowd--concealed'}`}
        aria-hidden={!reveal}
        aria-label={crowd ? names.join(', ') || 'No players' : 'Choices concealed'}
      >
        {crowd ? (
          <>
            <b>{occupancy}</b>
            <span className="bo-box__tokens" aria-hidden="true">
              {names.map((name, i) => (
                <i title={name} key={i} style={{ '--token': i } as CSSProperties}>
                  {name.slice(0, 1)}
                </i>
              ))}
            </span>
          </>
        ) : (
          <span className="bo-box__hidden">•••</span>
        )}
      </span>
      {reveal && reached(beat, 'consequence') && (
        <span className={`boxed-out-box__count ${broken ? 'bo-box__count--lost' : ''}`}>
          {broken ? 'COLLAPSED' : 'SAFE'}
        </span>
      )}
      {selected && (
        <span className="boxed-out-box__selected-tag">{locked ? 'YOUR PICK' : 'SELECTED'}</span>
      )}
    </motion.button>
  )
}

export function BoxedOutReadiness({
  players,
  readyIds,
}: {
  players: BoxedOutPlayer[]
  readyIds: Set<string>
}) {
  const count = players.filter((player) => readyIds.has(player.id)).length
  return (
    <motion.section
      className={`bo-ready${players.length > 4 ? ' bo-ready--many' : ''}`}
      aria-label="Contestant choices"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="bo-ready__heading">
        <span>CHOICES SEALED</span>
        <strong>
          {count}
          <small> / {players.length}</small>
        </strong>
      </div>
      <div
        className="bo-ready__progress"
        role="progressbar"
        aria-label="Choices sealed"
        aria-valuemin={0}
        aria-valuenow={count}
        aria-valuemax={players.length}
      >
        <span style={{ width: `${players.length ? (count / players.length) * 100 : 0}%` }} />
      </div>
      <div className="bo-ready__roster">
        {players.map((player) => {
          const ready = readyIds.has(player.id)
          return (
            <div
              key={player.id}
              className={`bo-ready__player${ready ? ' is-ready' : ''}${player.isHuman ? ' is-you' : ''}`}
              aria-label={`${player.name}: ${ready ? 'choice sealed' : 'choosing'}`}
            >
              <span className="bo-ready__avatar" aria-hidden="true">
                {player.name.slice(0, 1)}
              </span>
              <span className="bo-ready__name">
                <b>{player.isHuman ? 'You' : player.name}</b>
                <small>{ready ? 'Sealed' : 'Choosing…'}</small>
              </span>
              <span className="bo-ready__seal" aria-hidden="true">
                {ready ? (
                  <svg viewBox="0 0 20 20" fill="none">
                    <rect x="5" y="9" width="10" height="8" rx="2" />
                    <path d="M7 9V6a3 3 0 0 1 6 0v3" />
                  </svg>
                ) : (
                  <i />
                )}
              </span>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}

export function RoundEvent({
  beat,
  hit,
  eliminated,
  lives,
  gain,
  eliminatedNames,
  split,
}: {
  beat: ShowBeat
  hit: boolean
  eliminated: boolean
  lives: number
  gain: number
  eliminatedNames: string[]
  split: boolean
}) {
  if (beat === 'consequence')
    return (
      <div className={`bo-event bo-event--${hit ? 'life' : 'payout'}`} role="status">
        <div className="bo-event__symbol" aria-hidden="true">
          <EyeGlyph />
        </div>
        <span className="bo-event__kicker">
          {hit ? 'THE EYE TAKES ITS PRICE' : split ? 'THE CROWD SPLITS' : 'YOU ESCAPED THE CROWD'}
        </span>
        <strong>
          {hit ? (
            'LIFE LOST'
          ) : gain > 0 ? (
            <>
              +<ScoreCounter value={gain} from={0} />
            </>
          ) : (
            'SAFE'
          )}
        </strong>
        {hit && (
          <span className="bo-event__lives" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className={i === lives ? 'bo-event__life-breaking' : i < lives ? '' : 'is-empty'}
              >
                <EyeGlyph />
              </span>
            ))}
          </span>
        )}
        <p>
          {hit
            ? eliminated
              ? 'Your final light goes out.'
              : `${lives} ${lives === 1 ? 'life remains' : 'lives remain'}. Points protected.`
            : gain > 0
              ? 'POINTS SECURED'
              : 'The remaining contestants survive.'}
        </p>
      </div>
    )
  if (beat === 'elimination')
    return (
      <div className="bo-event bo-event--elimination" role="status">
        <span className="bo-event__shutter bo-event__shutter--left" aria-hidden="true" />
        <span className="bo-event__shutter bo-event__shutter--right" aria-hidden="true" />
        <EyeGlyph />
        <span className="bo-event__kicker">NO LIVES LEFT</span>
        <strong>BOXPOCALYPSE</strong>
        <p>{eliminated ? 'You are eliminated' : eliminatedNames.join(' · ')}</p>
      </div>
    )
  return null
}
