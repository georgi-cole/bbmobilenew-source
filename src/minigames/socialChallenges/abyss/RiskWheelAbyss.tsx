import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_SPINS_PER_TURN, WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'
import { useCompetitionResultCheckpoint } from '../../competitionResultContext'
import type { GenericMinigameProps } from '../../reactComponents'
import { ChallengePortrait, ChallengeStage } from '../ChallengeStage'
import { buildChallengeCompletion, getChallengePlayers, socialPreference } from '../shared'
import { useChallengeAudio } from '../useChallengeAudio'
import {
  abyssStandings,
  advanceVerdict,
  finishSpins,
  settleHandoffs,
  simulateAbyss,
  spinAbyss,
  spinPlayoff,
  startAbyss,
  type Abyss,
} from './abyssRules'
import './riskWheelAbyss.css'

const CHOICE_MS = 20_000
const SPIN_MS = 820
const WHEEL_ARTWORK = new URL(
  `${import.meta.env.BASE_URL}assets/minigames/risk-wheel-abyss.webp`,
  document.baseURI
).href
const format = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const sectorLabel = ({ type, value, label }: (typeof WHEEL_SECTORS)[number]) =>
  type === 'bankrupt'
    ? 'VOID'
    : type === 'skip'
      ? 'STOP'
      : value === undefined
        ? label
        : format.format(value)
const sectorColors = ['#234955', '#382a49', '#524130', '#29344d', '#1d4b48', '#632f37']
const wheelPaint =
  'conic-gradient(' +
  WHEEL_SECTORS.map((_, i) => {
    const width = 360 / WHEEL_SECTORS.length
    return (
      sectorColors[i % sectorColors.length] + ' ' + i * width + 'deg ' + (i + 1) * width + 'deg'
    )
  }).join(', ') +
  ')'

interface PendingSpin {
  next: Abyss
  audio: AbortController
  timer: number
}

export default function RiskWheelAbyss(props: GenericMinigameProps) {
  const [players] = useState(() => getChallengePlayers(props))
  const [social] = useState(() => props)
  const human = players.find(({ isHuman }) => isHuman)?.id
  const [game, setGame] = useState(() =>
    startAbyss(
      players.map(({ id }) => id),
      props.seed ?? 1,
      human
    )
  )
  const [selected, setSelected] = useState<string>()
  const [clock, setClock] = useState<{ game: typeof game; seconds: number }>()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const pendingSpin = useRef<PendingSpin>(null)
  const appPaused = useRef(false)
  const sound = useChallengeAudio('abyss')
  const preference = useMemo(
    () => (from: string, to: string) => socialPreference(social, from, to),
    [social]
  )
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const name = (id: string) => playerById.get(id)?.name ?? id
  const playing = Boolean(human && game.active.includes(human))
  const humanPlayoff = Boolean(human && game.playoff.includes(human))
  const timed =
    playing &&
    (game.phase === 'spin' ||
      game.phase === 'handoff' ||
      (game.phase === 'playoff' && humanPlayoff))
  const time = clock?.game === game ? clock.seconds : CHOICE_MS / 1000

  const settleSpin = useCallback(() => {
    const pending = pendingSpin.current
    if (!pending) return
    pendingSpin.current = null
    window.clearTimeout(pending.timer)
    pending.audio.abort()
    setGame(pending.next)
    setSpinning(false)
  }, [])

  const spin = useCallback(
    (current: Abyss) => {
      if (pendingSpin.current || current.phase !== 'spin') return
      const next = spinAbyss(current)
      const segment = 360 / WHEEL_SECTORS.length
      const angle = -((next.landed?.sector ?? 0) + 0.5) * segment
      setRotation((previous) => angle + 360 * Math.ceil((previous + 720 - angle) / 360))
      if (document.hidden || appPaused.current) {
        setGame(next)
        return
      }
      const audio = new AbortController()
      const timer = window.setTimeout(settleSpin, SPIN_MS)
      pendingSpin.current = { next, audio, timer }
      setSpinning(true)
      sound('roll', { signal: audio.signal, durationMs: SPIN_MS })
    },
    [settleSpin, sound]
  )

  useEffect(() => {
    const settleWhileHidden = () => {
      if (document.hidden) settleSpin()
    }
    const pause = () => {
      appPaused.current = true
      settleSpin()
    }
    const resume = () => {
      appPaused.current = false
    }
    document.addEventListener('visibilitychange', settleWhileHidden)
    document.addEventListener('pause', pause)
    document.addEventListener('resume', resume)
    window.addEventListener('pagehide', settleSpin)
    return () => {
      document.removeEventListener('visibilitychange', settleWhileHidden)
      document.removeEventListener('pause', pause)
      document.removeEventListener('resume', resume)
      window.removeEventListener('pagehide', settleSpin)
      const pending = pendingSpin.current
      if (pending) {
        pendingSpin.current = null
        window.clearTimeout(pending.timer)
        pending.audio.abort()
      }
    }
  }, [settleSpin])

  useEffect(() => {
    if (spinning) return
    const deadline = Date.now() + (timed ? CHOICE_MS : 900)
    if (!timed && game.phase !== 'spin' && game.phase !== 'playoff') return
    const tick = timed
      ? window.setInterval(() => {
          setClock({ game, seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) })
        }, 250)
      : undefined
    const timer = window.setTimeout(
      () => {
        if (game.phase === 'spin' && timed) {
          spin(game)
          return
        }
        setGame((current) => {
          if (current !== game) return current
          if (current.phase === 'spin') return finishSpins(current)
          if (current.phase === 'handoff') return settleHandoffs(current, preference)
          return spinPlayoff(current)
        })
      },
      timed ? CHOICE_MS : 900
    )
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(timer)
    }
  }, [game, preference, spin, spinning, timed])

  const result = useMemo(() => {
    if (game.phase !== 'results') return null
    const completion = buildChallengeCompletion(
      abyssStandings(game).map((id) => [id]),
      game.finalScores,
      human,
      'survival'
    )
    return { rawValue: completion.rawValue ?? 0, partial: false, completion }
  }, [game, human])
  useCompetitionResultCheckpoint(result)

  const standings = game.phase === 'results' ? abyssStandings(game) : game.active
  return (
    <ChallengeStage
      game="abyss"
      title="Risk Wheel: Abyss"
      subtitle={
        game.phase === 'results'
          ? undefined
          : `Round ${game.round} · ${game.active.length} remaining`
      }
      background={WHEEL_ARTWORK}
    >
      {timed && (
        <p className="abyss-clock" role="timer" aria-label="Seconds remaining">
          {time}s
        </p>
      )}
      {game.phase === 'spin' && (
        <div className="abyss-spin">
          <div className="abyss-wheel-box" aria-hidden="true">
            <div
              className="abyss-wheel"
              style={{ background: wheelPaint, transform: `rotate(${rotation}deg)` }}
            >
              {WHEEL_SECTORS.map((sector, i) => (
                <span
                  key={i}
                  style={{ transform: `rotate(${((i + 0.5) * 360) / WHEEL_SECTORS.length}deg)` }}
                >
                  {sectorLabel(sector)}
                </span>
              ))}
            </div>
            <div className="abyss-wheel-hub" />
          </div>
          {playing && (
            <>
              <p className="abyss-balance" aria-live="polite">
                {MAX_SPINS_PER_TURN - game.spins} spins left · Balance{' '}
                {format.format(game.roundScores[human!])}
              </p>
              <div className="abyss-actions">
                <button
                  className="abyss-primary"
                  type="button"
                  disabled={spinning}
                  onClick={() => spin(game)}
                >
                  {spinning ? 'Spinning…' : game.spins ? 'Spin again' : 'Spin the wheel'}
                </button>
                {game.spins > 0 && (
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setGame(finishSpins(game))}
                  >
                    Bank balance
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {game.phase === 'handoff' && (
        <>
          <h3>Pass your balance</h3>
          <p>You can pass a gain or a debt. All handoffs are revealed together.</p>
          {playing && <p>Your balance {format.format(game.roundScores[human!])}</p>}
        </>
      )}
      {game.phase === 'playoff' && (
        <>
          <h3>Playoff</h3>
          <p>
            {game.playoff.map(name).join(', ')} spin once each. Lowest spin goes out. VOID scores 0.
            Negative spins score lower.
          </p>
          {humanPlayoff && (
            <button type="button" onClick={() => setGame(spinPlayoff(game))}>
              Spin playoff
            </button>
          )}
        </>
      )}
      {game.phase === 'verdict' && (
        <>
          <h3>{game.out ? `${name(game.out)} is out` : 'The lowest score is tied'}</h3>
          {Object.keys(game.playoffScores).length > 0 ? (
            <ul className="abyss-tally" aria-label="Playoff scores">
              {Object.entries(game.playoffScores).map(([id, score]) => (
                <li key={id}>
                  {name(id)} · {format.format(score)}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="abyss-tally" aria-label="Balance handoffs">
              {game.transfers.map(({ from, to, amount }) => (
                <li key={from}>
                  {name(from)} sent {format.format(amount)} to {name(to)}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setSelected(undefined)
              setGame(advanceVerdict(game))
            }}
          >
            {game.out ? 'Continue' : 'Start playoff'}
          </button>
        </>
      )}
      {result && <h3>{name(standings[0])} wins</h3>}
      <ul className="abyss-roster" aria-label={result ? 'Final standings' : 'Contestants'}>
        {standings.map((id, index) => {
          const player = playerById.get(id)!
          const tone = id === game.out || game.eliminated.includes(id) ? 'out' : 'neutral'
          const portrait = (
            <ChallengePortrait player={player} tone={tone}>
              <span>
                {result ? `${index + 1}. ` : ''}
                {format.format((result ? game.finalScores : game.roundScores)[id] ?? 0)}
              </span>
            </ChallengePortrait>
          )
          return (
            <li key={id}>
              {game.phase === 'handoff' && playing && id !== human ? (
                <button
                  type="button"
                  aria-pressed={selected === id}
                  onClick={() => setSelected(id)}
                >
                  {portrait}
                </button>
              ) : (
                portrait
              )}
            </li>
          )
        })}
      </ul>
      {game.phase === 'handoff' && (
        <button
          className="abyss-primary"
          type="button"
          disabled={playing && !selected}
          onClick={() => {
            setGame(settleHandoffs(game, preference, selected))
            sound('link')
          }}
        >
          {playing ? 'Seal handoff' : 'Reveal handoffs'}
        </button>
      )}
      {!result && (!playing || game.out === human) && (
        <button type="button" onClick={() => setGame(simulateAbyss(game, preference))}>
          Skip to results
        </button>
      )}
      {result && (
        <button
          type="button"
          onClick={() => props.onFinish?.(result.rawValue, undefined, result.completion)}
        >
          Continue
        </button>
      )}
    </ChallengeStage>
  )
}
