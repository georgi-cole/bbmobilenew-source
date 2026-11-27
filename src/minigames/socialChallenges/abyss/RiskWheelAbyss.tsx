import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { MAX_SPINS_PER_TURN, WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'
import { SoundManager } from '../../../services/sound/SoundManager'
import { useCompetitionResultCheckpoint } from '../../competitionResultContext'
import type { GenericMinigameProps } from '../../reactComponents'
import { buildChallengeCompletion, getChallengePlayers, socialPreference } from '../shared'
import { useChallengeAudio } from '../useChallengeAudio'
import { AbyssChoice, AbyssFinal, AbyssHandoffs, AbyssVerdict } from './AbyssRoundPanels'
import { SECTOR_ANGLE, formatBalance } from './abyssPresentation'
import { AbyssWheel } from './AbyssWheel'
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
const TERMINAL_LANDING_MS = 420
const ARTWORK = import.meta.env.BASE_URL + 'assets/minigames/risk-wheel-abyss.webp'

interface PendingSpin {
  next: Abyss
  audio: AbortController
  timer: number
}

function describeSpin(spin: NonNullable<Abyss['landed']>, previous: number, playoff: boolean) {
  const sector = WHEEL_SECTORS[spin.sector]
  switch (sector.type) {
    case 'bankrupt':
      return playoff ? 'VOID · Scores 0' : 'Balance erased'
    case 'skip':
      return 'STOP · Turn ends'
    case 'zero':
      return 'No change'
    default:
      return formatBalance(spin.score - previous)
  }
}

export default function RiskWheelAbyss(props: GenericMinigameProps) {
  const [players] = useState(() => getChallengePlayers(props))
  const [social] = useState(() => props)
  const human = players.find(({ isHuman }) => isHuman)?.id
  const cinematic = Boolean(props.premiumPresentation)
  const [game, setGame] = useState(() =>
    startAbyss(
      players.map(({ id }) => id),
      props.seed ?? 1,
      human
    )
  )
  const [selected, setSelected] = useState<string>()
  const [clock, setClock] = useState<{ game: Abyss; seconds: number }>()
  const [rotation, setRotation] = useState(0)
  const [duration, setDuration] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [terminalSpin, setTerminalSpin] = useState<Abyss['landed']>()
  const [spinOutcome, setSpinOutcome] = useState<string>()
  const [revealing, setRevealing] = useState(false)
  const [lastTransfers, setLastTransfers] = useState<Abyss['transfers']>([])
  const pendingSpin = useRef<PendingSpin>(null)
  const appPaused = useRef(false)
  const arena = useRef<HTMLElement>(null)
  const finishReported = useRef(false)
  const sound = useChallengeAudio('abyss')
  const preference = useMemo(
    () => (from: string, to: string) => socialPreference(social, from, to),
    [social]
  )
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const playing = human !== undefined && game.active.includes(human)
  const humanPlayoff = playing && game.playoff.includes(human)
  const playableSpin = game.phase === 'spin' ? playing : game.phase === 'playoff' && humanPlayoff
  const timed = playableSpin || (game.phase === 'handoff' && playing)
  const time = clock?.game === game ? clock.seconds : CHOICE_MS / 1000
  const candidates =
    game.phase === 'handoff' && playing ? game.active.filter((id) => id !== human) : []
  const target = candidates.length === 1 ? candidates[0] : selected
  const balance =
    terminalSpin?.score ?? (playing && game.phase !== 'playoff' ? game.roundScores[human] : 0)

  const settleSpin = useCallback(() => {
    const pending = pendingSpin.current
    if (!pending) return
    pendingSpin.current = null
    window.clearTimeout(pending.timer)
    pending.audio.abort()
    setGame(pending.next)
    setSpinning(false)
    setTerminalSpin(undefined)
  }, [])

  const spin = useCallback(
    (current: Abyss) => {
      const playoff = current.phase === 'playoff'
      if (pendingSpin.current || (!playoff && current.phase !== 'spin')) return
      const next = playoff ? spinPlayoff(current) : spinAbyss(current)
      if (!human || !next.landed) {
        setGame(next)
        return
      }
      const previous = playoff ? 0 : current.roundScores[human]
      const landed = next.landed
      const outcome = describeSpin(landed, previous, playoff)
      const sectorType = WHEEL_SECTORS[landed.sector].type
      const playLandingCue = () => {
        if (document.hidden || appPaused.current) return
        if (sectorType === 'devil') void SoundManager.play('minigame:risk_wheel_666')
        else if (sectorType === 'bankrupt' || sectorType === 'skip') {
          void SoundManager.play('minigame:risk_wheel_bankrupt_or_skip')
        } else if (landed.score < previous) void SoundManager.play('minigame:risk_wheel_bad')
        else if (landed.score > previous) sound('success')
      }
      const angle = -(landed.sector + 0.5) * SECTOR_ANGLE
      const hidden = document.hidden || appPaused.current
      const reducedMotion =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        document.body.classList.contains('no-animations')
      const spinDuration = hidden || reducedMotion ? 0 : cinematic ? 2_450 : 1_510
      setDuration(spinDuration)
      setRotation((previousAngle) => angle + 360 * Math.ceil((previousAngle + 1440 - angle) / 360))
      setSpinOutcome(outcome)
      if (!spinDuration) {
        setGame(next)
        playLandingCue()
        return
      }

      const audio = new AbortController()
      const timer = window.setTimeout(() => {
        const pending = pendingSpin.current
        if (!pending) return
        pending.audio.abort()
        playLandingCue()
        if (next.phase === current.phase) {
          settleSpin()
          return
        }
        setTerminalSpin(landed)
        pending.timer = window.setTimeout(settleSpin, TERMINAL_LANDING_MS)
      }, spinDuration)
      pendingSpin.current = { next, audio, timer }
      setSpinning(true)
      sound('roll', { signal: audio.signal, durationMs: spinDuration })
    },
    [cinematic, human, settleSpin, sound]
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

  const revealHandoffs = useCallback(
    (current: Abyss, recipient?: string) => {
      setGame(settleHandoffs(current, preference, recipient))
      setRevealing(true)
      if (!document.hidden && !appPaused.current) sound('reveal')
    },
    [preference, sound]
  )

  const revealAfterTimeout = useEffectEvent((current: Abyss) => revealHandoffs(current, target))

  useEffect(() => {
    if (spinning || (!timed && game.phase !== 'spin' && game.phase !== 'playoff')) return
    const delay = timed ? CHOICE_MS : 900
    const deadline = Date.now() + delay
    const tick = timed
      ? window.setInterval(() => {
          setClock({ game, seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) })
        }, 250)
      : undefined
    const timer = window.setTimeout(() => {
      if (game.phase === 'handoff') revealAfterTimeout(game)
      else if (playableSpin) spin(game)
      else
        setGame((current) => {
          if (current !== game) return current
          return current.phase === 'spin' ? finishSpins(current) : spinPlayoff(current)
        })
    }, delay)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(timer)
    }
  }, [game, playableSpin, spin, spinning, timed])

  useEffect(() => {
    if (!revealing) return
    const timer = window.setTimeout(() => setRevealing(false), cinematic ? 2_200 : 1_100)
    return () => window.clearTimeout(timer)
  }, [cinematic, revealing])

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

  const light = spinning && !terminalSpin
  const wheelScene = game.phase === 'spin' || game.phase === 'playoff'
  const playoff = game.phase === 'playoff'
  // A previous spin's highlight is irrelevant once the next round or playoff starts.
  const landedSector =
    terminalSpin?.sector ?? (game.phase === 'spin' ? game.landed?.sector : undefined)
  const wheelMessage = light
    ? 'The wheel turns'
    : (landedSector !== undefined && spinOutcome) ||
      (playableSpin
        ? playoff
          ? 'Lowest spin goes out. VOID scores 0.'
          : 'Tap the eye to spin'
        : playoff
          ? 'The tied players are spinning'
          : 'Other players are spinning')
  const scene = result
    ? 'final'
    : revealing
      ? 'handoff'
      : game.phase === 'handoff'
        ? 'choose'
        : wheelScene
          ? 'wheel'
          : 'verdict'
  const artwork = cinematic ? new URL(ARTWORK, document.baseURI).href : undefined

  useEffect(() => {
    if (arena.current) arena.current.scrollTop = 0
  }, [scene])

  function continueVerdict() {
    setLastTransfers(game.transfers)
    setSelected(undefined)
    setSpinOutcome(undefined)
    setGame(advanceVerdict(game))
  }

  function finish() {
    if (!result || finishReported.current) return
    finishReported.current = true
    props.onFinish?.(result.rawValue, undefined, result.completion)
  }

  return (
    <section
      className="abyss"
      ref={arena}
      aria-label="Risk Wheel: Abyss"
      data-presentation={cinematic ? 'cinematic' : 'standard'}
      data-scene={scene}
      style={artwork ? ({ '--abyss-plate': 'url("' + artwork + '")' } as CSSProperties) : undefined}
    >
      <div className="abyss-air" aria-hidden="true" />
      <header className="abyss-header">
        <h2 aria-label="Risk Wheel: Abyss">
          <span>Risk Wheel</span>Abyss
        </h2>
        <div className="abyss-round">
          Round <strong>{game.round}</strong>
          <span>{game.active.length} remain</span>
          {timed && (
            <span className="abyss-choice-time" role="timer" aria-label="Seconds remaining">
              {time}s
            </span>
          )}
        </div>
      </header>
      {!result && !revealing && (!playing || game.out === human) && (
        <button
          type="button"
          className="abyss-skip"
          onClick={() => setGame(simulateAbyss(game, preference))}
        >
          Skip to results
        </button>
      )}
      {wheelScene && (
        <div className="abyss-spinning-scene">
          {playableSpin && (
            <div className="abyss-hud">
              <div className="abyss-hud-balance">
                <span>{playoff ? 'Playoff score' : 'Your balance'}</span>
                <strong data-debt={balance < 0}>{formatBalance(balance)}</strong>
              </div>
              <div className="abyss-hud-spins">
                {playoff ? (
                  <span>Playoff {game.playoffWaves.length + 1}</span>
                ) : (
                  <>
                    <span>Spins left</span>
                    <div role="img" aria-label={MAX_SPINS_PER_TURN - game.spins + ' spins left'}>
                      {Array.from({ length: MAX_SPINS_PER_TURN }, (_, index) => (
                        <i key={index} data-ready={index >= game.spins} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <AbyssWheel
            rotation={rotation}
            duration={duration}
            spinning={light}
            landedSector={landedSector}
            canSpin={playableSpin && !spinning}
            spinLabel={playoff ? 'Spin playoff' : game.spins ? 'Spin again' : 'Spin'}
            onSpin={() => spin(game)}
          />
          <div className="abyss-wheel-footer">
            <p aria-live="polite" data-landed={!light && landedSector !== undefined}>
              {wheelMessage}
            </p>
            {game.phase === 'spin' && playing && game.spins > 0 && (
              <button
                className="abyss-seal"
                type="button"
                disabled={spinning}
                onClick={() => {
                  sound('lock')
                  setGame(finishSpins(game))
                }}
              >
                Seal balance
              </button>
            )}
          </div>
        </div>
      )}
      {game.phase === 'handoff' && (
        <AbyssChoice
          game={game}
          players={playerById}
          cinematic={cinematic}
          human={playing ? human : undefined}
          lastTransfers={lastTransfers}
          social={social}
          target={target}
          spinOutcome={spinOutcome}
          onSelect={setSelected}
          onReveal={() => revealHandoffs(game, target)}
        />
      )}
      {game.phase === 'verdict' &&
        (revealing ? (
          <AbyssHandoffs
            players={playerById}
            transfers={game.transfers}
            onContinue={() => setRevealing(false)}
          />
        ) : (
          <AbyssVerdict
            players={playerById}
            cinematic={cinematic}
            game={game}
            onContinue={continueVerdict}
          />
        ))}
      {result && (
        <AbyssFinal
          players={playerById}
          cinematic={cinematic}
          game={game}
          standings={abyssStandings(game)}
          onContinue={finish}
        />
      )}
    </section>
  )
}
