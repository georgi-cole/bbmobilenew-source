import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio'
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
const BOX_ART = ['amber', 'teal', 'violet'] as const
const BOX_ASSET_BASE = `${import.meta.env.BASE_URL}assets/minigames/boxed-out/`
const SELECTION_SECONDS = 15
const EYE_TEXT = [
  'Three boxes. One fatal crowd. Trust your instincts.',
  'A fortune awaits. But greed loves company.',
  'The Eye has seen your decisions. There is no going back.',
  'The crowd has spoken. Was it wise?',
]

function BoxedOutBox({
  box,
  value,
  selected,
  locked,
  occupancy,
  exploded,
  revealed,
  revealBeat,
  onSelect,
}: {
  box: BoxId
  value: number
  selected: boolean
  locked: boolean
  occupancy?: number
  exploded?: boolean
  revealed: boolean
  revealBeat: 'opening' | 'impact' | 'settled'
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={[
        'boxed-out-box',
        'boxed-out-box--' + box,
        selected ? 'boxed-out-box--selected' : '',
        locked ? 'boxed-out-box--locked' : '',
        revealBeat === 'opening' && locked ? 'boxed-out-box--opening' : '',
        exploded && revealBeat === 'impact' ? 'boxed-out-box--impact' : '',
        exploded && revealBeat === 'settled' ? 'boxed-out-box--collapsed' : '',
        revealed && !exploded ? 'boxed-out-box--safe' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onSelect}
      disabled={locked || revealed}
      aria-label={
        'Box ' + BOX_NAMES[box] + ': ' + value + ' points' + (selected ? ', selected' : '')
      }
      aria-pressed={selected}
    >
      <span className="boxed-out-box__stage">
        <span className="boxed-out-box__halo" aria-hidden="true" />
        <span className="boxed-out-box__open-light" aria-hidden="true" />
        <span className="boxed-out-box__image-wrap">
          <img
            className="boxed-out-box__art"
            src={`${BOX_ASSET_BASE}box-${BOX_ART[box]}.webp`}
            alt=""
            draggable={false}
          />
        </span>
        {exploded && revealBeat !== 'opening' && (
          <span className="boxed-out-box__collapse" aria-hidden="true">
            <span className="boxed-out-box__collapse-flash" />
            <span className="boxed-out-box__shockwave" />
            <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
          </span>
        )}
        <span className="boxed-out-box__pedestal" aria-hidden="true" />
      </span>
      <span className="boxed-out-box__reward">{value.toLocaleString('en-US')}</span>
      <span className="boxed-out-box__points">POINTS</span>
      {revealed && (
        <span className="boxed-out-box__count">
          {occupancy} picked · {exploded ? 'COLLAPSED' : 'SAFE'}
        </span>
      )}
      {selected && (
        <span className="boxed-out-box__selected-tag">{locked ? 'YOUR PICK' : 'SELECTED'}</span>
      )}
    </button>
  )
}

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
  const [remaining, setRemaining] = useState(SELECTION_SECONDS)
  const [revealBeat, setRevealBeat] = useState<'opening' | 'impact' | 'settled'>('settled')
  const [finaleBeat, setFinaleBeat] = useState<'idle' | 'judgment' | 'winner'>('idle')
  const [numericAnswer, setNumericAnswer] = useState('')
  const [announced, setAnnounced] = useState(false)
  const startedAt = useRef(0)
  const chosenBoxRef = useRef<BoxId | null>(null)
  const finishedRef = useRef(false)
  const revealCueRoundRef = useRef<number | null>(null)
  const winnerCuePlayedRef = useRef(false)
  const { playDeath, playNewTurn, playSafeStep, playWinner } = useGlassBridgeAudio(false)
  const latest = game?.reveals[game.reveals.length - 1]
  const human = players.find((player) => player.isHuman)
  const humanAlive = Boolean(game && human && game.lives[human.id] > 0)
  const awaitingHuman = game?.phase === 'select' && humanAlive
  const awaitingTiebreak =
    game?.phase === 'tiebreak' && Boolean(human && game.finalists.includes(human.id))
  const humanWasHit = Boolean(
    latest && human && latest.exploded !== null && latest.picks[human.id] === latest.exploded
  )
  const humanWasEliminated = Boolean(humanWasHit && human && latest?.eliminated.includes(human.id))

  useEffect(() => {
    if (!game || game.phase !== 'reveal') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const impactTimer = window.setTimeout(() => setRevealBeat('impact'), reducedMotion ? 0 : 900)
    const settleTimer = window.setTimeout(() => setRevealBeat('settled'), reducedMotion ? 0 : 2500)
    return () => {
      window.clearTimeout(impactTimer)
      window.clearTimeout(settleTimer)
    }
  }, [game, latest?.round])

  useEffect(() => {
    if (revealBeat !== 'impact' || !latest || revealCueRoundRef.current === latest.round) return
    revealCueRoundRef.current = latest.round
    if (humanWasHit) playDeath()
    else if (human && latest.participants.includes(human.id)) playSafeStep()
  }, [human, humanWasHit, latest, playDeath, playSafeStep, revealBeat])

  useEffect(() => {
    if (game?.phase !== 'finished' || finaleBeat !== 'winner' || winnerCuePlayedRef.current) return
    winnerCuePlayedRef.current = true
    playWinner()
  }, [finaleBeat, game?.phase, playWinner])

  useEffect(() => {
    if (game?.phase !== 'finished') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const judgmentTimer = window.setTimeout(() => setFinaleBeat('judgment'), 0)
    const revealTimer = window.setTimeout(() => setFinaleBeat('winner'), reducedMotion ? 40 : 1850)
    return () => {
      window.clearTimeout(judgmentTimer)
      window.clearTimeout(revealTimer)
    }
  }, [game?.phase])

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
      setRevealBeat('opening')
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
    if (!game) return

    if (game.phase === 'select' && !humanAlive) {
      const timeout = window.setTimeout(() => {
        setRevealBeat('opening')
        setGame((current) =>
          current?.phase === 'select' ? resolveBoxedOutRound(current) : current
        )
      }, 700)
      return () => window.clearTimeout(timeout)
    }

    if (game.phase === 'reveal' && !humanAlive && revealBeat === 'settled') {
      const timeout = window.setTimeout(() => {
        if (game.round < BOXED_OUT_ROUNDS && activePlayerIds(game).length > 1) playNewTurn()
        setRemaining(SELECTION_SECONDS)
        setSelected(null)
        chosenBoxRef.current = null
        setRevealBeat('opening')
        setGame((current) => (current?.phase === 'reveal' ? advanceBoxedOut(current) : current))
      }, 1700)
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
  }, [awaitingTiebreak, game, humanAlive, playNewTurn, revealBeat])

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
        <h2>BOXED OUT</h2>
        <p>This competition needs at least two valid contestants.</p>
      </div>
    )
  }

  const revealPending = game.phase === 'reveal' && revealBeat !== 'settled' && Boolean(latest)
  const shownScores = { ...game.scores }
  const shownLives = { ...game.lives }
  if (revealPending && latest) {
    for (const id of latest.participants) {
      const picked = latest.picks[id]
      const collapsed = latest.exploded !== null && picked === latest.exploded
      if (collapsed) shownLives[id] += 1
      else shownScores[id] -= latest.rewards[picked]
    }
  }
  const rank = standings({ ...game, scores: shownScores, lives: shownLives })
  const reveal = game.phase === 'reveal'
  const ended = game.phase === 'finished'
  const totalActive = activePlayerIds(game).length
  const allOutFinish = ended && totalActive === 0
  const winner = players.find((player) => player.id === game.winnerId)
  const question = game.phase === 'tiebreak' ? tiebreakQuestion(game) : null
  const shownActive = Object.values(shownLives).filter((lives) => lives > 0).length
  const eyeMessage = ended
    ? allOutFinish
      ? 'The final group fell. Banked score decides the last stand.'
      : 'Only one name shall be remembered.'
    : reveal && revealBeat === 'opening'
      ? 'Every choice is sealed. The Eye is watching.'
      : reveal && revealBeat === 'impact'
        ? 'The vault answers.'
        : reveal
          ? latest?.exploded === null
            ? 'A perfect split. The crowd escaped this time.'
            : 'The crowd has chosen its fate.'
          : question
            ? 'A final question. Do not go over.'
            : EYE_TEXT[(game.round - 1) % EYE_TEXT.length]
  const rootStyle = {
    '--boxed-out-vault': `url("${BOX_ASSET_BASE}vault-mobile.webp")`,
  } as CSSProperties
  const lock = () => {
    if (selected === null || game.phase !== 'select') return
    setRevealBeat('opening')
    setGame((current) => (current ? resolveBoxedOutRound(current, selected) : current))
  }
  const nextRound = () => {
    if (game.round < BOXED_OUT_ROUNDS && totalActive > 1) playNewTurn()
    setRemaining(SELECTION_SECONDS)
    setSelected(null)
    chosenBoxRef.current = null
    setGame((current) => (current ? advanceBoxedOut(current) : current))
  }
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
      style={rootStyle}
    >
      <header className="boxed-out__topbar">
        <span className="boxed-out__logo">
          THE BIG EYE <span>·</span> BOXED OUT
        </span>
        <span className="boxed-out__round">
          ROUND {game.round} / {BOXED_OUT_ROUNDS}
        </span>
      </header>
      <section className="boxed-out__eye" aria-live="polite">
        <span className="boxed-out__eye-icon" aria-hidden="true">
          ◉
        </span>
        <p>{eyeMessage}</p>
      </section>
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
                  revealBeat === 'impact' && humanWasHit && human && i === game.lives[human.id]
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
          <strong>{human ? shownScores[human.id].toLocaleString('en-US') : '—'}</strong>
        </div>
      </div>

      {(game.phase === 'select' || game.phase === 'reveal') && (
        <>
          <div className={`boxed-out__instruction${!reveal && remaining <= 5 ? ' is-urgent' : ''}`}>
            {reveal
              ? revealBeat === 'opening'
                ? 'THE EYE OPENS'
                : revealBeat === 'impact'
                  ? 'THE CROWD IS JUDGED'
                  : 'THE CHOICES ARE REVEALED'
              : humanAlive
                ? 'Pick a box. Avoid the crowd.'
                : 'The contestants are choosing…'}
            {!reveal && humanAlive && <span className="boxed-out__timer">{remaining}s</span>}
          </div>
          <div className="boxed-out__boxes">
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
                locked={reveal || !humanAlive}
                revealed={reveal && revealBeat === 'settled'}
                revealBeat={revealBeat}
                occupancy={latest?.occupancy[box]}
                exploded={reveal && latest?.exploded === box}
                onSelect={() => {
                  if (selected !== box) playSafeStep()
                  chosenBoxRef.current = box
                  setSelected(box)
                }}
              />
            ))}
          </div>
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

      {ended && finaleBeat === 'judgment' && (
        <section
          className="boxed-out__panel boxed-out__judgment"
          role="status"
          aria-live="assertive"
        >
          <span className="boxed-out__eyebrow">
            {allOutFinish ? 'THE LAST GROUP HAS FALLEN' : 'THE EYE WEIGHS THE SCORES'}
          </span>
          <span className="boxed-out__judgment-eye" aria-hidden="true">
            ◉
          </span>
          <h2>{allOutFinish ? 'Every life is gone.' : 'The verdict is sealed.'}</h2>
          <p>
            {allOutFinish
              ? `The final group fell in Round ${latest?.round ?? game.round}. Banked score decides the last stand.`
              : 'The Eye has counted every life and every point.'}
          </p>
        </section>
      )}

      {ended && finaleBeat === 'winner' && (
        <section className="boxed-out__panel boxed-out__winner" role="status">
          <span className="boxed-out__eyebrow">
            {allOutFinish ? 'THE LAST STAND SCORE VERDICT' : 'THE BIG EYE DECLARES'}
          </span>
          <span className="boxed-out__trophy" aria-hidden="true">
            ✦
          </span>
          <span className="boxed-out__winner-sparks" aria-hidden="true">
            ✧ ✦ ✧ ✦ ✧
          </span>
          <h2>{winner?.name ?? 'Winner'}</h2>
          <p>
            {allOutFinish ? 'LAST STAND CHAMPION' : 'BOXED OUT CHAMPION'}
            {allOutFinish && (
              <span className="boxed-out__winner-detail">
                Everyone in the final group lost their last life in Round{' '}
                {latest?.round ?? game.round}. {winner?.name ?? 'The winner'} had the highest banked
                score with {game.winnerId ? game.scores[game.winnerId].toLocaleString('en-US') : 0}{' '}
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
        </section>
      )}
      <section className="boxed-out__leaderboard" aria-label="Contestant standings">
        <div className="boxed-out__leaderboard-title">
          STANDINGS <span>{game.players.length} CONTESTANTS</span>
        </div>
        <div className="boxed-out__rankings">
          {rank.map((id, i) => {
            const p = players.find((player) => player.id === id)
            return (
              <div
                key={id}
                className={[
                  'boxed-out__ranking',
                  shownLives[id] === 0 ? 'is-out' : '',
                  ended && game.winnerId === id ? 'is-champion' : '',
                  revealPending &&
                  latest?.exploded !== null &&
                  latest?.exploded !== undefined &&
                  latest.picks[id] === latest.exploded
                    ? 'is-losing-life'
                    : '',
                  revealPending && latest?.eliminated.includes(id) ? 'is-eliminating' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>{i + 1}</span>
                <span className="boxed-out__contestant">
                  {p?.name ?? id}
                  {p?.isHuman ? ' (YOU)' : ''}
                  {(shownLives[id] === 0 || (revealPending && latest?.eliminated.includes(id))) && (
                    <span className="boxed-out__eliminated-stamp">OUT</span>
                  )}
                  {ended && game.winnerId === id && (
                    <span className="boxed-out__champion-stamp">WIN</span>
                  )}
                </span>
                <span className="boxed-out__rank-lives">
                  {'◉'.repeat(shownLives[id])}
                  {'○'.repeat(BOXED_OUT_LIVES - shownLives[id])}
                </span>
                <strong>{shownScores[id].toLocaleString('en-US')}</strong>
              </div>
            )
          })}
        </div>
      </section>
      {!humanAlive && !ended && game.phase !== 'reveal' && (
        <button
          className="boxed-out__secondary"
          type="button"
          onClick={() => setGame((current) => (current ? autoFinishBoxedOut(current) : current))}
        >
          SKIP TO FINAL VERDICT
        </button>
      )}
    </main>
  )
}
