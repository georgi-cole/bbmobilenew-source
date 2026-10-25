import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio'
import { SoundManager } from '../../services/sound/SoundManager'
import {
  BOX_ASSET_BASE,
  BoxedOutBox,
  BoxedOutReadiness,
  EyeGlyph,
  RoundEvent,
  ScoreCounter,
} from './BoxedOutShow'
import { displayedRound, reached, roundTimeline, type ShowBeat } from './presentation'
import {
  BOXED_OUT_LIVES,
  BOXED_OUT_ROUNDS,
  activePlayerIds,
  advanceBoxedOut,
  autoFinishBoxedOut,
  createBoxedOutState,
  random01,
  resolveBoxedOutRound,
  resolveBoxedOutTiebreak,
  standings,
  tiebreakQuestion,
  type BoxId,
  type BoxedOutPlayer,
  type BoxedOutState,
} from '../../features/boxedOut/rules'
import './BoxedOut.css'
import './BoxedOutShow.css'

interface Props {
  seed?: number
  autoStart?: boolean
  participants?: Array<{
    id: string
    name: string
    isHuman: boolean
    avatar?: string
    precomputedScore: number
    previousPR: number | null
  }>
  participantIds?: string[]
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null
      authoritativeLastPlaceId?: string | null
      authoritativeRankedIds?: string[]
      rawValue?: number
      rawResults?: Record<string, number>
    }
  ) => void
}

const BOX_NAMES = ['A', 'B', 'C'] as const
const SELECTION_SECONDS = 15

export default function BoxedOut({ seed = 0, participants, participantIds, onFinish }: Props) {
  const players = useMemo<BoxedOutPlayer[]>(() => {
    if (participants?.length)
      return participants.map(({ id, name, isHuman }) => ({ id, name, isHuman }))
    return (participantIds ?? []).map((id) => ({ id, name: id, isHuman: false }))
  }, [participantIds, participants])

  const [game, setGame] = useState<BoxedOutState | null>(() => {
    if (players.length < 2) return null
    try {
      return createBoxedOutState(players, seed)
    } catch {
      return null
    }
  })
  const [selected, setSelected] = useState<BoxId | null>(null)
  const [humanLocked, setHumanLocked] = useState(false)
  const [readyAiIds, setReadyAiIds] = useState<string[]>([])
  const [remaining, setRemaining] = useState(SELECTION_SECONDS)
  const [revealBeat, setRevealBeat] = useState<ShowBeat>('idle')
  const [finaleBeat, setFinaleBeat] = useState<'idle' | 'apocalypse' | 'judgment' | 'winner'>(
    'idle'
  )
  const [handoff, setHandoff] = useState<{ label: string; stage: 'close' | 'open' } | null>(null)
  const handoffTimers = useRef<number[]>([])
  const reducedMotion = useReducedMotion() ?? false
  const [numericAnswer, setNumericAnswer] = useState('')
  const [announced, setAnnounced] = useState(false)
  const startedAt = useRef(0)
  const chosenBoxRef = useRef<BoxId | null>(null)
  const finishedRef = useRef(false)
  const revealCues = useRef(new Set<string>())
  const winnerCuePlayedRef = useRef(false)
  const { playDeath, playNewTurn, playSafeStep, playWinner } = useGlassBridgeAudio(false)
  const latest = game?.reveals[game.reveals.length - 1]
  const human = players.find((player) => player.isHuman)
  const humanAlive = Boolean(game && human && game.lives[human.id] > 0)
  const awaitingHuman = game?.phase === 'select' && humanAlive && !handoff && !humanLocked
  const activeAi = useMemo(
    () =>
      game ? game.players.filter((player) => !player.isHuman && game.lives[player.id] > 0) : [],
    [game]
  )
  const allAiReady = activeAi.every((player) => readyAiIds.includes(player.id))
  const awaitingTiebreak =
    game?.phase === 'tiebreak' && !handoff && Boolean(human && game.finalists.includes(human.id))
  const humanWasHit = Boolean(
    latest && human && latest.exploded !== null && latest.picks[human.id] === latest.exploded
  )
  const humanWasEliminated = Boolean(humanWasHit && human && latest?.eliminated.includes(human.id))
  const allOutFinish = Boolean(
    game &&
    (game.phase === 'finished' || game.phase === 'tiebreak') &&
    activePlayerIds(game).length === 0
  )

  const advanceWithCurtain = useCallback(() => {
    if (!game || game.phase !== 'reveal' || handoff) return
    const verdict = game.round >= BOXED_OUT_ROUNDS || activePlayerIds(game).length <= 1
    if (reducedMotion) {
      setSelected(null)
      setHumanLocked(false)
      setReadyAiIds([])
      setRemaining(SELECTION_SECONDS)
      setRevealBeat('idle')
      setGame((current) => (current ? advanceBoxedOut(current) : current))
      return
    }
    playNewTurn()
    setHandoff({ label: verdict ? 'THE VERDICT' : `ROUND ${game.round + 1}`, stage: 'close' })
    handoffTimers.current = [
      window.setTimeout(() => {
        setSelected(null)
        setHumanLocked(false)
        setReadyAiIds([])
        chosenBoxRef.current = null
        setRemaining(SELECTION_SECONDS)
        setRevealBeat('idle')
        setGame((current) => (current?.phase === 'reveal' ? advanceBoxedOut(current) : current))
        setHandoff({ label: verdict ? 'THE VERDICT' : `ROUND ${game.round + 1}`, stage: 'open' })
      }, 640),
      window.setTimeout(() => setHandoff(null), 1450),
    ]
  }, [game, handoff, playNewTurn, reducedMotion])

  useEffect(() => () => handoffTimers.current.forEach(window.clearTimeout), [])

  useEffect(() => {
    if (!game || game.phase !== 'select' || handoff) return
    // Commit times never depend on the human's box or expose an AI's precomputed pick.
    const timers = activeAi.map((player) =>
      window.setTimeout(
        () => {
          setReadyAiIds((current) =>
            current.includes(player.id) ? current : [...current, player.id]
          )
        },
        900 + Math.floor(random01(game.seed, `commit:${game.round}:${player.id}`) * 2600)
      )
    )
    return () => timers.forEach(window.clearTimeout)
  }, [activeAi, game, handoff])

  useEffect(() => {
    if (
      !game ||
      game.phase !== 'select' ||
      handoff ||
      !humanLocked ||
      !allAiReady ||
      selected === null
    )
      return
    const timer = window.setTimeout(() => {
      setRevealBeat('sealing')
      setGame((current) =>
        current?.phase === 'select' ? resolveBoxedOutRound(current, selected) : current
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [allAiReady, game, handoff, humanLocked, selected])

  useEffect(() => {
    for (const file of [
      'chest-ruins.webp',
      'chest-ruins-teal.webp',
      'chest-ruins-violet.webp',
      'champion-crest.webp',
      'box-amber-open.webp',
      'box-teal-open.webp',
      'box-violet-open.webp',
    ]) {
      const image = new Image()
      image.src = `${BOX_ASSET_BASE}${file}`
    }
  }, [])

  useEffect(() => {
    if (!game || game.phase !== 'reveal') return
    const timers = roundTimeline(
      latest?.exploded !== null,
      Boolean(latest?.eliminated.length),
      reducedMotion
    ).map(({ at, beat }) => window.setTimeout(() => setRevealBeat(beat), at))
    return () => timers.forEach(window.clearTimeout)
  }, [game, latest?.round, latest?.eliminated.length, latest?.exploded, reducedMotion])

  useEffect(() => {
    if (game?.phase !== 'reveal' || !latest) return
    const cue = `${latest.round}:${revealBeat}`
    if (revealCues.current.has(cue)) return
    revealCues.current.add(cue)
    if (revealBeat === 'sealing' && !humanLocked)
      void SoundManager.play('ui:confirm', { volume: 0.45, durationMs: 500 })
    else if (revealBeat.startsWith('crowd-'))
      void SoundManager.play('ui:tribunal_vote_reveal', { volume: 0.35, durationMs: 350 })
    else if (revealBeat === 'danger')
      void SoundManager.play('minigame:gb_new_turn', { volume: 0.35, durationMs: 850 })
    else if (revealBeat === 'impact') {
      void SoundManager.play('minigame:cinematic_thunder', { volume: 0.45, durationMs: 1600 })
      if (humanWasHit) playDeath()
    } else if (
      revealBeat === 'consequence' &&
      human &&
      latest.participants.includes(human.id) &&
      !humanWasHit
    )
      playSafeStep()
    else if (revealBeat === 'elimination')
      void SoundManager.play('player:wildcard_eliminated', { volume: 0.45, durationMs: 1400 })
    else if (reducedMotion && revealBeat === 'settled') {
      if (humanWasHit) playDeath()
      else if (human && latest.participants.includes(human.id)) playSafeStep()
    }
  }, [
    game?.phase,
    human,
    humanLocked,
    humanWasHit,
    latest,
    playDeath,
    playSafeStep,
    reducedMotion,
    revealBeat,
  ])

  useEffect(() => {
    if (game?.phase !== 'finished' || finaleBeat !== 'winner' || winnerCuePlayedRef.current) return
    winnerCuePlayedRef.current = true
    playWinner()
  }, [finaleBeat, game?.phase, playWinner])

  useEffect(() => {
    const tiedAllOut = game?.phase === 'tiebreak' && allOutFinish
    if ((game?.phase !== 'finished' && !tiedAllOut) || handoff) return
    const apocalypseTimer = allOutFinish
      ? window.setTimeout(() => setFinaleBeat('apocalypse'), 0)
      : undefined
    if (tiedAllOut) {
      const dismissTimer = window.setTimeout(
        () => setFinaleBeat('judgment'),
        reducedMotion ? 40 : 1250
      )
      return () => {
        if (apocalypseTimer !== undefined) window.clearTimeout(apocalypseTimer)
        window.clearTimeout(dismissTimer)
      }
    }
    const judgmentTimer = window.setTimeout(
      () => setFinaleBeat('judgment'),
      allOutFinish ? (reducedMotion ? 0 : 1050) : 0
    )
    const revealTimer = window.setTimeout(
      () => setFinaleBeat('winner'),
      reducedMotion ? 40 : allOutFinish ? 3500 : 2450
    )
    return () => {
      if (apocalypseTimer !== undefined) window.clearTimeout(apocalypseTimer)
      window.clearTimeout(judgmentTimer)
      window.clearTimeout(revealTimer)
    }
  }, [allOutFinish, game?.phase, handoff, reducedMotion])

  useEffect(() => {
    if (!awaitingHuman || !game) return
    startedAt.current = Date.now()
    chosenBoxRef.current = null
    const interval = window.setInterval(() => {
      setRemaining(
        Math.max(0, SELECTION_SECONDS - Math.floor((Date.now() - startedAt.current) / 1000))
      )
    }, 250)
    const timeout = window.setTimeout(() => {
      setRevealBeat('sealing')
      setGame((current) => {
        if (!current || current.phase !== 'select') return current
        const choice =
          chosenBoxRef.current ??
          (Math.floor(random01(current.seed, 'timeout:' + current.round) * 3) as BoxId)
        return resolveBoxedOutRound(current, choice)
      })
    }, SELECTION_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [awaitingHuman, game])

  useEffect(() => {
    if (!game || handoff) return

    if (game.phase === 'select' && !humanAlive && allAiReady) {
      const timeout = window.setTimeout(() => {
        setRevealBeat('sealing')
        setGame((current) =>
          current?.phase === 'select' ? resolveBoxedOutRound(current) : current
        )
      }, 400)
      return () => window.clearTimeout(timeout)
    }

    if (game.phase === 'reveal' && !humanAlive && revealBeat === 'settled') {
      const timeout = window.setTimeout(() => {
        advanceWithCurtain()
      }, 2200)
      return () => window.clearTimeout(timeout)
    }

    if (game.phase === 'tiebreak' && !awaitingTiebreak) {
      const timeout = window.setTimeout(() => {
        setGame((current) =>
          current?.phase === 'tiebreak' ? resolveBoxedOutTiebreak(current) : current
        )
      }, 1500)
      return () => window.clearTimeout(timeout)
    }
  }, [advanceWithCurtain, allAiReady, awaitingTiebreak, game, handoff, humanAlive, revealBeat])

  useEffect(() => {
    if (!awaitingTiebreak) return
    startedAt.current = Date.now()
  }, [awaitingTiebreak, game?.questionIndex])

  useEffect(() => {
    if (!awaitingTiebreak) return
    const currentIndex = game?.questionIndex
    const timeout = window.setTimeout(() => {
      setGame((current) =>
        current && current.phase === 'tiebreak' && current.questionIndex === currentIndex
          ? resolveBoxedOutTiebreak(current)
          : current
      )
    }, SELECTION_SECONDS * 1000)
    return () => window.clearTimeout(timeout)
  }, [awaitingTiebreak, game?.questionIndex])

  if (!game) {
    return (
      <div className="boxed-out boxed-out--error" role="alert">
        <h2>BOXPOCALYPSE</h2>
        <p>This competition needs at least two valid contestants.</p>
      </div>
    )
  }

  const { scores: shownScores, lives: shownLives } = displayedRound(game, revealBeat)
  const rankingDisplay =
    game.phase === 'reveal' && revealBeat !== 'settled'
      ? displayedRound(game, 'sealing')
      : { scores: shownScores, lives: shownLives }
  const rank = standings({ ...game, ...rankingDisplay })
  const reveal = game.phase === 'reveal'
  const ended = game.phase === 'finished'
  const totalActive = activePlayerIds(game).length
  const winner = players.find((player) => player.id === game.winnerId)
  const question = game.phase === 'tiebreak' ? tiebreakQuestion(game) : null
  const shownActive = Object.values(shownLives).filter((lives) => lives > 0).length
  const gain =
    human && latest && latest.picks[human.id] !== undefined && !humanWasHit
      ? latest.rewards[latest.picks[human.id]]
      : 0
  const rootStyle = {
    '--boxed-out-vault': `url("${BOX_ASSET_BASE}vault-mobile.webp")`,
  } as CSSProperties
  const lock = () => {
    if (selected === null || game.phase !== 'select' || handoff || humanLocked) return
    void SoundManager.play('ui:confirm', { volume: 0.45, durationMs: 500 })
    setHumanLocked(true)
  }
  const nextRound = advanceWithCurtain
  const submitTiebreak = () => {
    if (!awaitingTiebreak || numericAnswer.trim() === '') return
    const answer = Number(numericAnswer)
    if (!Number.isSafeInteger(answer) || answer < 0) return
    const elapsed = Math.max(0, Date.now() - startedAt.current)
    setNumericAnswer('')
    setGame((current) => (current ? resolveBoxedOutTiebreak(current, answer, elapsed) : current))
  }
  const complete = () => {
    if (finishedRef.current || !game.winnerId || !onFinish) return
    finishedRef.current = true
    const ranked = [game.winnerId, ...rank.filter((id) => id !== game.winnerId)]
    const worst = ranked[ranked.length - 1]
    onFinish(human ? game.scores[human.id] : game.scores[game.winnerId], undefined, {
      authoritativeWinnerId: game.winnerId,
      authoritativeLastPlaceId: worst,
      authoritativeRankedIds: ranked,
      rawValue: human ? game.scores[human.id] : game.scores[game.winnerId],
      rawResults: { ...game.scores },
    })
  }

  return (
    <main
      className={[
        'boxed-out',
        `boxed-out--${game.phase}`,
        ended ? `boxed-out--finale-${finaleBeat}` : '',
        game.phase === 'reveal' ? `boxed-out--${revealBeat}` : '',
        game.phase === 'select' && selected !== null ? 'boxed-out--has-selection' : '',
        game.phase === 'reveal' && revealBeat === 'impact' && humanWasHit
          ? 'boxed-out--human-hit'
          : '',
        game.phase === 'reveal' && revealBeat === 'impact' && humanWasEliminated
          ? 'boxed-out--human-eliminated'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-beat={reveal ? revealBeat : undefined}
      data-human-result={humanWasHit ? 'hit' : 'safe'}
      style={rootStyle}
    >
      <header className="boxed-out__topbar">
        <span className="boxed-out__logo">
          THE BIG EYE <span>·</span> BOXPOCALYPSE
        </span>
        <span className="boxed-out__round">
          ROUND {game.round} / {BOXED_OUT_ROUNDS}
        </span>
      </header>
      <div className="boxed-out__status">
        <div>
          <span className="boxed-out__stat-label">YOUR LIVES</span>
          <div
            className="boxed-out__lives"
            aria-label={
              (human ? shownLives[human.id] : 0) + ' of ' + BOXED_OUT_LIVES + ' lives remaining'
            }
          >
            {Array.from({ length: BOXED_OUT_LIVES }, (_, i) => (
              <span
                key={i}
                className={[
                  human && i < shownLives[human.id] ? 'is-live' : 'is-spent',
                  reveal &&
                  revealBeat === 'consequence' &&
                  humanWasHit &&
                  human &&
                  i === game.lives[human.id]
                    ? 'is-loss'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                ◉
              </span>
            ))}
          </div>
        </div>
        <div className="boxed-out__status-center">
          <span className="boxed-out__stat-label">{allOutFinish ? 'FINAL GROUP' : 'STILL IN'}</span>
          <strong>{allOutFinish ? (latest?.participants.length ?? 0) : shownActive}</strong>
        </div>
        <div className="boxed-out__status-right">
          <span className="boxed-out__stat-label">YOUR SCORE</span>
          <strong>
            <ScoreCounter value={human ? shownScores[human.id] : 0} />
          </strong>
        </div>
      </div>

      {(game.phase === 'select' || game.phase === 'reveal') && (
        <>
          <div className={`boxed-out__instruction${!reveal && remaining <= 5 ? ' is-urgent' : ''}`}>
            {reveal
              ? revealBeat === 'sealing'
                ? 'CHOICE SEALED'
                : revealBeat.startsWith('crowd-')
                  ? 'WHERE DID EVERYONE GO?'
                  : revealBeat === 'danger'
                    ? 'THE CROWD HAS A PRICE'
                    : revealBeat === 'impact'
                      ? 'JUDGMENT'
                      : revealBeat === 'consequence'
                        ? humanWasHit
                          ? 'ONE LIGHT LOST'
                          : 'FORTUNE FAVOURS YOU'
                        : revealBeat === 'elimination'
                          ? 'THE FALLEN'
                          : 'ROUND COMPLETE'
              : humanLocked
                ? 'Your choice is sealed.'
                : humanAlive
                  ? 'Pick a box. Avoid the crowd.'
                  : 'The contestants are choosing…'}
            {!reveal && awaitingHuman && <span className="boxed-out__timer">{remaining}s</span>}
          </div>
          <motion.div
            layout="size"
            className="bo-board"
            key={game.round}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              layout: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.45 },
            }}
          >
            <div
              className="boxed-out__boxes"
              data-selection={!reveal ? (selected ?? undefined) : undefined}
            >
              {([0, 1, 2] as const).map((box) => (
                <BoxedOutBox
                  key={box}
                  box={box}
                  value={game.rewards[box]}
                  selected={
                    reveal
                      ? human?.id !== undefined && latest?.picks[human.id] === box
                      : selected === box
                  }
                  locked={reveal || !humanAlive || Boolean(handoff) || humanLocked}
                  reveal={reveal}
                  beat={revealBeat}
                  names={
                    reveal && latest
                      ? latest.participants
                          .filter((id) => latest.picks[id] === box)
                          .map((id) => players.find((p) => p.id === id)?.name ?? id)
                      : []
                  }
                  occupancy={latest?.occupancy[box]}
                  exploded={Boolean(reveal && latest?.exploded === box)}
                  onSelect={() => {
                    if (selected !== box)
                      void SoundManager.play('ui:wildcard_select', { volume: 0.4, durationMs: 250 })
                    const choice = selected === box ? null : box
                    chosenBoxRef.current = choice
                    setSelected(choice)
                  }}
                />
              ))}
            </div>
            <AnimatePresence>
              {reveal &&
                (revealBeat === 'consequence' || revealBeat === 'elimination') &&
                latest && (
                  <motion.div
                    className="bo-event-wrap"
                    key={revealBeat}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.3 }}
                  >
                    <RoundEvent
                      beat={revealBeat}
                      hit={humanWasHit}
                      eliminated={humanWasEliminated}
                      lives={human ? game.lives[human.id] : 0}
                      gain={gain}
                      split={latest.exploded === null}
                      eliminatedNames={latest.eliminated.map(
                        (id) => players.find((p) => p.id === id)?.name ?? id
                      )}
                    />
                  </motion.div>
                )}
            </AnimatePresence>
          </motion.div>
          {reveal && latest && revealBeat === 'settled' && (
            <div className="boxed-out__reveal" role="status" aria-live="polite">
              <strong>
                {latest.exploded === null
                  ? 'EVERY BOX SURVIVES'
                  : 'BOX ' + BOX_NAMES[latest.exploded] + ' EXPLODES'}
              </strong>
              <p>
                {humanWasHit
                  ? humanWasEliminated
                    ? 'That was your last life. You are eliminated.'
                    : 'You lose one life. Your points stay banked.'
                  : human && latest.picks[human.id] !== undefined
                    ? latest.exploded === latest.picks[human.id]
                      ? 'No points this round.'
                      : '+' +
                        latest.rewards[latest.picks[human.id]].toLocaleString('en-US') +
                        ' points banked.'
                    : 'The decisions have been counted.'}
              </p>
              {latest.eliminated.length > 0 && (
                <small>
                  Eliminated:{' '}
                  {latest.eliminated
                    .map((id) => players.find((player) => player.id === id)?.name ?? id)
                    .join(', ')}
                </small>
              )}
            </div>
          )}
          {awaitingHuman && selected !== null && (
            <button className="boxed-out__cta boxed-out__cta--lock" type="button" onClick={lock}>
              LOCK MY BOX
            </button>
          )}
          {game.phase === 'select' && humanLocked && (
            <p className="bo-locked-note" role="status">
              Waiting for the other choices to be sealed…
            </p>
          )}
          {game.phase === 'select' && (
            <BoxedOutReadiness
              players={game.players.filter((player) => game.lives[player.id] > 0)}
              readyIds={new Set([...readyAiIds, ...(humanLocked && human ? [human.id] : [])])}
            />
          )}
          {reveal && revealBeat === 'settled' && (
            <button
              className="boxed-out__cta boxed-out__cta--advance"
              type="button"
              onClick={nextRound}
            >
              {game.round === BOXED_OUT_ROUNDS || totalActive <= 1
                ? 'SEE VERDICT'
                : 'ROUND ' + (game.round + 1)}
            </button>
          )}
        </>
      )}

      {game.phase === 'tiebreak' && question && (
        <section className="boxed-out__panel">
          <span className="boxed-out__eyebrow">
            SUDDEN DEATH · QUESTION {game.questionIndex + 1}
          </span>
          <h2>{question.prompt}</h2>
          <p>Closest without going over wins. Equal answers are decided by response time.</p>
          {awaitingTiebreak ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submitTiebreak()
              }}
            >
              <label htmlFor="boxed-out-number">Your answer</label>
              <input
                id="boxed-out-number"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={numericAnswer}
                onChange={(event) => setNumericAnswer(event.target.value)}
              />
              <button className="boxed-out__cta" type="submit" disabled={!numericAnswer.trim()}>
                LOCK ANSWER
              </button>
            </form>
          ) : (
            <p>The finalists are answering…</p>
          )}
        </section>
      )}

      {(ended || (allOutFinish && finaleBeat === 'apocalypse')) && (
        <div
          className={`bo-final-stage bo-final-stage--${finaleBeat}${reducedMotion ? ' bo-final-stage--reduced-motion' : ''}`}
        >
          <div className="bo-final-rays" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ '--ray': i } as CSSProperties} />
            ))}
          </div>
          <AnimatePresence>
            {allOutFinish && finaleBeat === 'apocalypse' && (
              <motion.div
                key="boxpocalypse"
                className="bo-boxpocalypse-flash"
                role="status"
                aria-live="assertive"
                initial={{ opacity: 0, scale: 1.22, filter: 'blur(12px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                transition={{ duration: reducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <span>THE LAST BOXES FALL</span>
                <strong>BOXPOCALYPSE</strong>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {finaleBeat === 'judgment' && (
              <motion.section
                key="judgment"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.45 }}
                className="boxed-out__panel boxed-out__judgment"
                role="status"
                aria-live="assertive"
              >
                <span className="boxed-out__eyebrow">
                  {allOutFinish ? 'THE LAST GROUP HAS FALLEN' : 'THE EYE WEIGHS THE SCORES'}
                </span>
                <span className="boxed-out__judgment-eye" aria-hidden="true">
                  <EyeGlyph />
                </span>
                <h2>{allOutFinish ? 'Every life is gone.' : 'The verdict is sealed.'}</h2>
                <p>
                  {allOutFinish
                    ? `The final group fell in Round ${latest?.round ?? game.round}. Banked score decides the last stand.`
                    : 'The Eye has counted every life and every point.'}
                </p>
              </motion.section>
            )}

            {finaleBeat === 'winner' && (
              <motion.section
                key="winner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.5 }}
                className="boxed-out__panel boxed-out__winner"
                role="status"
              >
                <span className="boxed-out__eyebrow">
                  {allOutFinish ? 'THE LAST STAND SCORE VERDICT' : 'THE BIG EYE DECLARES'}
                </span>
                <span className="boxed-out__winner-seal" aria-hidden="true">
                  <img src={`${BOX_ASSET_BASE}champion-crest.webp`} alt="" draggable={false} />
                </span>
                <h2 aria-label={winner?.name ?? 'Winner'}>
                  {Array.from(winner?.name ?? 'Winner').map((letter, i) => (
                    <span aria-hidden="true" key={i} style={{ '--letter': i } as CSSProperties}>
                      {letter === ' ' ? ' ' : letter}
                    </span>
                  ))}
                </h2>
                <p>
                  {allOutFinish ? 'LAST STAND CHAMPION' : 'BOXPOCALYPSE CHAMPION'}
                  {allOutFinish && (
                    <span className="boxed-out__winner-detail">
                      Everyone in the final group lost their last life in Round{' '}
                      {latest?.round ?? game.round}. {winner?.name ?? 'The winner'} had the highest
                      banked score with{' '}
                      {game.winnerId ? game.scores[game.winnerId].toLocaleString('en-US') : 0}{' '}
                      points.
                    </span>
                  )}
                </p>
                <button
                  className="boxed-out__cta"
                  type="button"
                  disabled={announced || !onFinish}
                  onClick={() => {
                    setAnnounced(true)
                    complete()
                  }}
                >
                  CONTINUE
                </button>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      )}
      {((reveal && revealBeat === 'settled') || ended || game.phase === 'tiebreak') && (
        <motion.section
          key="standings"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          layout="position"
          transition={{ duration: reducedMotion ? 0 : 0.5 }}
          className="boxed-out__leaderboard"
          aria-label="Contestant standings"
        >
          <div className="boxed-out__leaderboard-title">
            STANDINGS <span>{game.players.length} CONTESTANTS</span>
          </div>
          <div className="boxed-out__rankings">
            {rank.map((id, i) => {
              const p = players.find((player) => player.id === id)
              return (
                <motion.div
                  key={id}
                  layout="position"
                  transition={{ duration: reducedMotion ? 0 : 0.65, ease: [0.2, 0.8, 0.2, 1] }}
                  className={[
                    'boxed-out__ranking',
                    shownLives[id] === 0 &&
                    (!reveal ||
                      !latest?.eliminated.includes(id) ||
                      reached(revealBeat, 'elimination'))
                      ? 'is-out'
                      : '',
                    ended && finaleBeat === 'winner' && game.winnerId === id ? 'is-champion' : '',
                    reveal &&
                    revealBeat === 'consequence' &&
                    latest?.exploded !== null &&
                    latest?.exploded !== undefined &&
                    latest.picks[id] === latest.exploded
                      ? 'is-losing-life'
                      : '',
                    reveal && revealBeat === 'elimination' && latest?.eliminated.includes(id)
                      ? 'is-eliminating'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span>{i + 1}</span>
                  <span className="boxed-out__contestant">
                    {p?.name ?? id}
                    {p?.isHuman ? ' (YOU)' : ''}
                    {shownLives[id] === 0 &&
                      (!reveal ||
                        !latest?.eliminated.includes(id) ||
                        reached(revealBeat, 'elimination')) && (
                        <span className="boxed-out__eliminated-stamp">OUT</span>
                      )}
                    {ended && finaleBeat === 'winner' && game.winnerId === id && (
                      <span className="boxed-out__champion-stamp">WIN</span>
                    )}
                  </span>
                  <span className="boxed-out__rank-lives">
                    {'◉'.repeat(shownLives[id])}
                    {'○'.repeat(BOXED_OUT_LIVES - shownLives[id])}
                  </span>
                  <strong>
                    <ScoreCounter value={shownScores[id]} />
                  </strong>
                </motion.div>
              )
            })}
          </div>
        </motion.section>
      )}
      {!humanAlive && !ended && game.phase !== 'reveal' && (
        <button
          className="boxed-out__secondary"
          type="button"
          onClick={() => setGame((current) => (current ? autoFinishBoxedOut(current) : current))}
        >
          SKIP TO FINAL VERDICT
        </button>
      )}
      {handoff && (
        <div className={`bo-handoff bo-handoff--${handoff.stage}`} role="status" aria-live="polite">
          <span className="bo-handoff__leaf bo-handoff__leaf--left" aria-hidden="true" />
          <span className="bo-handoff__leaf bo-handoff__leaf--right" aria-hidden="true" />
          <div className="bo-handoff__title">
            <EyeGlyph />
            <span>{handoff.label}</span>
          </div>
        </div>
      )}
    </main>
  )
}
