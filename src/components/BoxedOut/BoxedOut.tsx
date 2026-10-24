import { useEffect, useMemo, useRef, useState } from 'react'
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
  onFinish?: (value: number, tiebreakerMs?: number, completion?: {
    authoritativeWinnerId?: string | null
    authoritativeLastPlaceId?: string | null
    authoritativeRankedIds?: string[]
    rawValue?: number
    rawResults?: Record<string, number>
  }) => void
}

const BOX_NAMES = ['A', 'B', 'C'] as const
const SELECTION_SECONDS = 15
const EYE_TEXT = [
  'Three boxes. One fatal crowd. Trust your instincts.',
  'A fortune awaits. But greed loves company.',
  'The Eye has seen your decisions. There is no going back.',
  'The crowd has spoken. Was it wise?',
]

function BoxedOutBox({ box, value, selected, locked, occupancy, exploded, revealed, onSelect }: {
  box: BoxId
  value: number
  selected: boolean
  locked: boolean
  occupancy?: number
  exploded?: boolean
  revealed: boolean
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
        exploded ? 'boxed-out-box--exploded' : '',
        revealed && !exploded ? 'boxed-out-box--safe' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      disabled={locked || revealed}
      aria-label={'Box ' + BOX_NAMES[box] + ': ' + value + ' points' + (selected ? ', selected' : '')}
      aria-pressed={selected}
    >
      <span className="boxed-out-box__stage">
        <span className="boxed-out-box__halo" />
        <span className="boxed-out-box__lid" />
        <span className="boxed-out-box__body">
          <span className="boxed-out-box__insignia">✦</span>
          <span className="boxed-out-box__letter">{BOX_NAMES[box]}</span>
        </span>
        <span className="boxed-out-box__pedestal" />
        {exploded && <span className="boxed-out-box__blast" aria-hidden="true">✴</span>}
      </span>
      <span className="boxed-out-box__reward">{value.toLocaleString('en-US')}</span>
      <span className="boxed-out-box__points">POINTS</span>
      {revealed && <span className="boxed-out-box__count">{occupancy} picked · {exploded ? 'BOOM' : 'SAFE'}</span>}
      {!revealed && selected && <span className="boxed-out-box__selected-tag">SELECTED</span>}
    </button>
  )
}

export default function BoxedOut({ seed = 0, participants, participantIds, onFinish }: Props) {
  const players = useMemo<BoxedOutPlayer[]>(() => {
    if (participants?.length) return participants.map(({ id, name, isHuman }) => ({ id, name, isHuman }))
    return (participantIds ?? []).map((id) => ({ id, name: id, isHuman: false }))
  }, [participantIds, participants])

  const [game, setGame] = useState<BoxedOutState | null>(() => {
    if (players.length < 2) return null
    try { return createBoxedOutState(players, seed) } catch { return null }
  })
  const [selected, setSelected] = useState<BoxId | null>(null)
  const [remaining, setRemaining] = useState(SELECTION_SECONDS)
  const [numericAnswer, setNumericAnswer] = useState('')
  const [announced, setAnnounced] = useState(false)
  const startedAt = useRef(0)
  const chosenBoxRef = useRef<BoxId | null>(null)
  const finishedRef = useRef(false)
  const latest = game?.reveals[game.reveals.length - 1]
  const human = players.find((player) => player.isHuman)
  const humanAlive = Boolean(game && human && game.lives[human.id] > 0)
  const awaitingHuman = game?.phase === 'select' && humanAlive
  const awaitingTiebreak = game?.phase === 'tiebreak' && Boolean(human && game.finalists.includes(human.id))

  useEffect(() => {
    if (!awaitingHuman || !game) return
    startedAt.current = Date.now()
    setRemaining(SELECTION_SECONDS)
    setSelected(null)
    chosenBoxRef.current = null
    const interval = window.setInterval(() => {
      setRemaining(Math.max(0, SELECTION_SECONDS - Math.floor((Date.now() - startedAt.current) / 1000)))
    }, 250)
    const timeout = window.setTimeout(() => {
      setGame((current) => {
        if (!current || current.phase !== 'select') return current
        const choice = chosenBoxRef.current ?? (Math.floor(random01(current.seed, 'timeout:' + current.round) * 3) as BoxId)
        return resolveBoxedOutRound(current, choice)
      })
    }, SELECTION_SECONDS * 1000)
    return () => { window.clearInterval(interval); window.clearTimeout(timeout) }
  }, [awaitingHuman, game])

  useEffect(() => {
    if (!game || (game.phase !== 'select' && game.phase !== 'tiebreak')) return
    const needsHuman = game.phase === 'select' ? humanAlive : awaitingTiebreak
    if (needsHuman) return
    const timeout = window.setTimeout(() => setGame((current) => current ? autoFinishBoxedOut(current) : current), 350)
    return () => window.clearTimeout(timeout)
  }, [game, humanAlive, awaitingTiebreak])

  useEffect(() => {
    if (!awaitingTiebreak) return
    startedAt.current = Date.now()
    setNumericAnswer('')
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

  const rank = standings(game)
  const reveal = game.phase === 'reveal'
  const ended = game.phase === 'finished'
  const question = game.phase === 'tiebreak' ? tiebreakQuestion(game) : null
  const totalActive = activePlayerIds(game).length
  const lock = () => {
    if (selected === null || game.phase !== 'select') return
    setGame((current) => current ? resolveBoxedOutRound(current, selected) : current)
  }
  const nextRound = () => {
    setGame((current) => current ? advanceBoxedOut(current) : current)
  }
  const submitTiebreak = () => {
    if (!awaitingTiebreak || numericAnswer.trim() === '') return
    const answer = Number(numericAnswer)
    if (!Number.isSafeInteger(answer) || answer < 0) return
    const elapsed = Math.max(0, Date.now() - startedAt.current)
    setGame((current) => current ? resolveBoxedOutTiebreak(current, answer, elapsed) : current)
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
    <main className="boxed-out">
      <header className="boxed-out__topbar">
        <span className="boxed-out__logo">THE BIG EYE <span>·</span> BOXED OUT</span>
        <span className="boxed-out__round">ROUND {game.round} / {BOXED_OUT_ROUNDS}</span>
      </header>
      <section className="boxed-out__eye" aria-live="polite">
        <span className="boxed-out__eye-icon" aria-hidden="true">◉</span>
        <p>{ended ? 'Only one name shall be remembered.' : reveal ? latest?.exploded === null ? 'A perfect split. The crowd escaped this time.' : 'The crowd has chosen its fate.' : question ? 'A final question. Do not go over.' : EYE_TEXT[(game.round - 1) % EYE_TEXT.length]}</p>
      </section>
      <div className="boxed-out__status">
        <div>
          <span className="boxed-out__stat-label">YOUR LIVES</span>
          <div className="boxed-out__lives" aria-label={(human ? game.lives[human.id] : 0) + ' of ' + BOXED_OUT_LIVES + ' lives remaining'}>
            {Array.from({ length: BOXED_OUT_LIVES }, (_, i) => <span key={i} className={human && i < game.lives[human.id] ? 'is-live' : ''}>◉</span>)}
          </div>
        </div>
        <div className="boxed-out__status-center"><span className="boxed-out__stat-label">STILL IN</span><strong>{totalActive}</strong></div>
        <div className="boxed-out__status-right"><span className="boxed-out__stat-label">YOUR SCORE</span><strong>{human ? game.scores[human.id].toLocaleString('en-US') : '—'}</strong></div>
      </div>

      {(game.phase === 'select' || game.phase === 'reveal') && (
        <>
          <div className="boxed-out__instruction">
            {reveal ? 'THE CHOICES ARE REVEALED' : humanAlive ? 'Pick a box. Avoid the crowd.' : 'The contestants are choosing…'}
            {!reveal && humanAlive && <span className="boxed-out__timer">{remaining}s</span>}
          </div>
          <div className="boxed-out__boxes">
            {([0, 1, 2] as const).map((box) => (
              <BoxedOutBox
                key={box} box={box} value={game.rewards[box]}
                selected={selected === box} locked={reveal || !humanAlive}
                revealed={reveal} occupancy={latest?.occupancy[box]}
                exploded={reveal && latest?.exploded === box}
                onSelect={() => { chosenBoxRef.current = box; setSelected(box) }}
              />
            ))}
          </div>
          {reveal && latest && (
            <div className="boxed-out__reveal" role="status">
              <strong>{latest.exploded === null ? 'EVERY BOX SURVIVES' : 'BOX ' + BOX_NAMES[latest.exploded] + ' EXPLODES'}</strong>
              <p>{human && latest.picks[human.id] !== undefined
                ? latest.exploded === latest.picks[human.id]
                  ? 'No points this round. You lose one life.'
                  : '+' + latest.rewards[latest.picks[human.id]].toLocaleString('en-US') + ' points earned.'
                : 'The decisions have been counted.'}</p>
              {latest.eliminated.length > 0 && <small>Eliminated: {latest.eliminated.map((id) => players.find((player) => player.id === id)?.name ?? id).join(', ')}</small>}
            </div>
          )}
          {awaitingHuman && <button className="boxed-out__cta" type="button" disabled={selected === null} onClick={lock}>LOCK MY BOX</button>}
          {reveal && <button className="boxed-out__cta" type="button" onClick={nextRound}>{game.round === BOXED_OUT_ROUNDS || totalActive <= 1 ? 'SEE THE VERDICT' : 'NEXT ROUND'}</button>}
        </>
      )}

      {game.phase === 'tiebreak' && question && (
        <section className="boxed-out__panel">
          <span className="boxed-out__eyebrow">SUDDEN DEATH · QUESTION {game.questionIndex + 1}</span>
          <h2>{question.prompt}</h2>
          <p>Closest without going over wins. Equal answers are decided by response time.</p>
          {awaitingTiebreak ? (
            <form onSubmit={(event) => { event.preventDefault(); submitTiebreak() }}>
              <label htmlFor="boxed-out-number">Your answer</label>
              <input id="boxed-out-number" type="number" min="0" step="1" inputMode="numeric" value={numericAnswer} onChange={(event) => setNumericAnswer(event.target.value)} />
              <button className="boxed-out__cta" type="submit" disabled={!numericAnswer.trim()}>LOCK ANSWER</button>
            </form>
          ) : <p>The finalists are answering…</p>}
        </section>
      )}

      {ended && (
        <section className="boxed-out__panel boxed-out__winner" role="status">
          <span className="boxed-out__eyebrow">THE BIG EYE DECLARES</span>
          <span className="boxed-out__trophy" aria-hidden="true">✦</span>
          <h2>{players.find((player) => player.id === game.winnerId)?.name ?? 'Winner'}</h2>
          <p>BOXED OUT CHAMPION</p>
          <button className="boxed-out__cta" type="button" disabled={announced || !onFinish} onClick={() => { setAnnounced(true); complete() }}>CONTINUE</button>
        </section>
      )}
      <section className="boxed-out__leaderboard" aria-label="Contestant standings">
        <div className="boxed-out__leaderboard-title">STANDINGS <span>{game.players.length} CONTESTANTS</span></div>
        <div className="boxed-out__rankings">
          {rank.map((id, i) => {
            const p = players.find((player) => player.id === id)
            return <div key={id} className={'boxed-out__ranking ' + (game.lives[id] === 0 ? 'is-out' : '')}>
              <span>{i + 1}</span><span className="boxed-out__contestant">{p?.name ?? id}{p?.isHuman ? ' (YOU)' : ''}</span>
              <span className="boxed-out__rank-lives">{'◉'.repeat(game.lives[id])}{'○'.repeat(BOXED_OUT_LIVES - game.lives[id])}</span>
              <strong>{game.scores[id].toLocaleString('en-US')}</strong>
            </div>
          })}
        </div>
      </section>
      {!humanAlive && !ended && game.phase !== 'reveal' && (
        <button className="boxed-out__secondary" type="button" onClick={() => setGame((current) => current ? autoFinishBoxedOut(current) : current)}>
          SKIP TO FINAL VERDICT
        </button>
      )}
    </main>
  )
}
