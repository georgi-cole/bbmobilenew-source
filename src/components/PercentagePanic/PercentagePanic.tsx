import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import {
  advancePercentageRound, choosePercentageDuelOrder, createPercentagePanic,
  percentagePanicRankedIds, pickAiDuelGuess, resolvePercentageDuelGuess,
  resolvePercentageRound, type PercentagePanicState,
} from '../../features/percentagePanic/logic'
import './PercentagePanic.css'

interface Player {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
}

interface Props {
  participantIds: string[]
  participants?: Player[]
  seed?: number
  prizeType?: 'LOH' | 'POS'
  onComplete?: (result?: ReactMinigameCompletion, rawValue?: number) => void
}

const ROUND_SECONDS = 20
const QUICK_PICKS = [0, 10, 25, 50, 75, 100]

export default function PercentagePanic({
  participantIds, participants = [], seed = 0, prizeType = 'LOH', onComplete,
}: Props) {
  const [state, setState] = useState<PercentagePanicState>(() => {
    const humanId = participants.find((p) => p.isHuman)?.id ?? null
    return createPercentagePanic(participantIds, humanId, seed || cryptoSeed())
  })
  const [guess, setGuess] = useState(50)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [watching, setWatching] = useState(false)
  const guessRef = useRef(50)
  const startRef = useRef(0)
  const completionRef = useRef(false)
  const humanActive = state.humanId != null && state.activeIds.includes(state.humanId)

  const names = useMemo(
    () => Object.fromEntries(participants.map((p) => [p.id, p.name])),
    [participants]
  )
  const players = useMemo(
    () => Object.fromEntries(participants.map((p) => [p.id, p])),
    [participants]
  )
  const nameOf = (id: string) => names[id] || id
  const changeGuess = (value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)))
    guessRef.current = clamped
    setGuess(clamped)
  }

  useEffect(() => {
    if (state.phase !== 'question') return
    startRef.current = performance.now()
    if (!humanActive) {
      const timeout = window.setTimeout(() => setState((s) => resolvePercentageRound(s)), 900)
      return () => window.clearTimeout(timeout)
    }
    const interval = window.setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil(ROUND_SECONDS - (performance.now() - startRef.current) / 1000)))
    }, 160)
    const timeout = window.setTimeout(() => {
      setState((s) => resolvePercentageRound(s, guessRef.current, ROUND_SECONDS * 1000))
    }, ROUND_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [state.phase, state.roundNumber, humanActive])

  useEffect(() => {
    if (state.phase !== 'order' || !state.finalists || state.chooserId === state.humanId) return
    const timeout = window.setTimeout(
      () => setState((s) => s.chooserId && s.finalists
        ? choosePercentageDuelOrder(s, s.finalists[0]) : s),
      1100
    )
    return () => window.clearTimeout(timeout)
  }, [state.phase, state.chooserId, state.humanId, state.finalists])

  useEffect(() => {
    if (state.phase !== 'duel' || state.duelTurnId === state.humanId) return
    const timeout = window.setTimeout(() => setState((s) =>
      s.phase === 'duel' && s.duelTurnId && s.duelTurnId !== s.humanId
        ? resolvePercentageDuelGuess(s, s.duelTurnId, pickAiDuelGuess(s)) : s
    ), watching ? 120 : 1050)
    return () => window.clearTimeout(timeout)
  }, [state.phase, state.duelTurnId, state.humanId, state.duelGuesses.length, watching])

  useEffect(() => {
    if (state.phase !== 'reveal' || humanActive) return
    const timeout = window.setTimeout(
      () => setState(advancePercentageRound), watching ? 120 : 1800
    )
    return () => window.clearTimeout(timeout)
  }, [state.phase, state.roundNumber, humanActive, watching])

  const nextRound = () => {
    // Reset input and clock in the user interaction, not synchronously in an effect.
    changeGuess(50)
    setTimeLeft(ROUND_SECONDS)
    setState(advancePercentageRound)
  }

  const lock = () => {
    const responseMs = Math.max(0, Math.min(ROUND_SECONDS * 1000, Math.floor(performance.now() - startRef.current)))
    setState((s) => resolvePercentageRound(s, guessRef.current, responseMs))
  }
  const duelAnswer = (value: number) => {
    if (!state.duelTurnId) return
    setState((s) => resolvePercentageDuelGuess(s, state.duelTurnId!, value))
  }

  const finish = () => {
    if (completionRef.current || !state.winnerId) return
    completionRef.current = true
    onComplete?.({
      authoritativeWinnerId: state.winnerId,
      authoritativeLastPlaceId: state.eliminatedIds[0] ?? null,
      authoritativeRankedIds: percentagePanicRankedIds(state),
      rawResults: { ...state.scores },
      rawValue: state.humanId ? state.scores[state.humanId] : 0,
    }, state.humanId ? state.scores[state.humanId] : 0)
  }

  const result = state.lastRound
  const worst = result?.eliminatedIds ?? []
  const roundRows = result
    ? [...result.answers].sort((a, b) => a.error - b.error || a.responseMs - b.responseMs)
    : []
  const canDuel = state.phase === 'duel' && state.duelTurnId === state.humanId
  const sliderMin = state.phase === 'duel' ? state.duelBounds[0] : 0
  const sliderMax = state.phase === 'duel' ? state.duelBounds[1] : 100
  const safeGuess = Math.max(sliderMin, Math.min(sliderMax, guess))

  return (
    <div className="pp-shell" data-phase={state.phase}>
      <div className="pp-studio" aria-hidden="true"><span /><span /><span /><span /></div>
      <section className="pp-stage" aria-label="Percentage Panic studio">
        <header className="pp-header">
          <div>
            <p className="pp-overline">THE BIG EYE • {prizeType} COMPETITION</p>
            <h2>PERCENTAGE <em>PANIC</em></h2>
          </div>
          <span className="pp-round">{
            state.phase === 'duel' || state.phase === 'order' ? 'FINAL TWO'
              : state.phase === 'winner' ? 'WINNER'
                : `ROUND ${state.roundNumber}`
          }</span>
        </header>

        <div className="pp-roster" aria-label="Contestants">
          {state.contestants.map((id) => {
            const active = state.activeIds.includes(id)
            return <div className={`pp-contestant ${active ? '' : 'pp-contestant--out'}`} key={id}>
              <span className="pp-avatar">
                {players[id]?.avatar && !players[id].avatar?.startsWith('data:') &&
                  /^https?:|^\//.test(players[id].avatar || '') ? (
                    <img src={players[id].avatar} alt="" />
                  ) : (nameOf(id)[0] || '?')}
              </span>
              <span className="pp-contestant__name">{nameOf(id)}</span>
              <strong>{state.scores[id]}</strong>
            </div>
          })}
        </div>

        <div className="pp-screen">
          <span className="pp-screen__badge">{
            state.phase === 'reveal' ? 'THE TRUTH' :
            state.phase === 'winner' ? 'CHAMPION REVEALED' :
            state.phase === 'order' ? 'THE FINAL SHOWDOWN' : 'WORLDWIDE FACT CHECK'
          }</span>
          {state.phase === 'winner' ? (
            <>
              <p className="pp-screen__super">THE WINNER IS</p>
              <h3 className="pp-screen__winner">{nameOf(state.winnerId || '')}</h3>
              <p>They survived the percentages and conquered the final guess.</p>
            </>
          ) : state.phase === 'order' ? (
            <>
              <h3>Two contestants. One final truth.</h3>
              <p>{nameOf(state.chooserId || '')} earned the right to choose who guesses first.</p>
            </>
          ) : (
            <>
              <p className="pp-screen__super">{state.question.category} · {state.question.regionOrCountry}</p>
              <h3>{state.question.prompt}</h3>
              {state.phase === 'reveal' && (
                <div className="pp-truth">{state.question.answerPercent}%</div>
              )}
            </>
          )}
          {state.phase !== 'winner' && state.phase !== 'order' && (
            <span className="pp-screen__source">{state.phase === 'reveal'
              ? `Source: ${state.question.sourceName} · ${state.question.referenceYear}`
              : 'LOCK YOUR ESTIMATE BEFORE THE CLOCK RUNS OUT'}</span>
          )}
        </div>

        {state.phase === 'question' && humanActive && (
          <div className="pp-console">
            <div className="pp-console__top"><span>YOUR ESTIMATE</span><strong>{timeLeft}s</strong></div>
            <output className="pp-value">{guess}%</output>
            <input aria-label="Choose a percentage from zero to one hundred" type="range"
              min="0" max="100" step="1" value={guess}
              onChange={(e) => changeGuess(Number(e.target.value))} />
            <div className="pp-range"><span>0%</span><span>100%</span></div>
            <div className="pp-picks">{QUICK_PICKS.map((value) => (
              <button type="button" key={value} onClick={() => changeGuess(value)}>{value}%</button>
            ))}</div>
            <button className="pp-primary" type="button" onClick={lock}>LOCK GUESS</button>
          </div>
        )}

        {state.phase === 'question' && !humanActive && (
          <div className="pp-console pp-console--center">
            <p>The remaining contestants are locking their guesses…</p>
            <button type="button" onClick={() => setWatching(true)}>Fast-forward spectator mode</button>
          </div>
        )}

        {state.phase === 'reveal' && result && (
          <div className="pp-results">
            {result.suddenDeath && <p className="pp-alert">All tied! Nobody leaves. New sudden-death question.</p>}
            <div className="pp-results__header"><span>CONTESTANT</span><span>GUESS</span><span>ERROR</span><span>TOTAL</span></div>
            {roundRows.map((a) => (
              <div className={`pp-results__row ${worst.includes(a.playerId) ? 'pp-results__row--out' : ''}`} key={a.playerId}>
                <span>{nameOf(a.playerId)}{worst.includes(a.playerId) ? ' • OUT' : ''}</span>
                <span>{a.guess}%</span><span>−{a.error}</span><strong>{state.scores[a.playerId]}</strong>
              </div>
            ))}
            <a className="pp-source" href={state.question.sourceUrl} target="_blank" rel="noopener noreferrer">
              Check published source ↗
            </a>
            <button className="pp-primary" type="button" onClick={nextRound}>
              {state.winnerId ? 'REVEAL WINNER' : state.finalists ? 'ENTER THE FINAL TWO' : 'NEXT QUESTION'}
            </button>
          </div>
        )}

        {state.phase === 'order' && state.finalists && (
          <div className="pp-console pp-console--center">
            <div className="pp-finalists">{state.finalists.map((id) =>
              <div key={id}><strong>{nameOf(id)}</strong><span>{state.scores[id]} pts</span></div>
            )}</div>
            {state.chooserId === state.humanId ? (
              <>
                <p>You have the higher score. Who takes the first guess?</p>
                <div className="pp-actions">
                  <button className="pp-primary" onClick={() =>
                    setState((s) => choosePercentageDuelOrder(s, state.humanId!))}>I GUESS FIRST</button>
                  <button className="pp-secondary" onClick={() =>
                    setState((s) => choosePercentageDuelOrder(s, state.finalists!.find((id) => id !== state.humanId)!))}>
                    I GUESS SECOND
                  </button>
                </div>
              </>
            ) : <p>{nameOf(state.chooserId || '')} is choosing the order…</p>}
          </div>
        )}

        {state.phase === 'duel' && (
          <div className="pp-console">
            <div className="pp-console__top">
              <span>{nameOf(state.duelTurnId || '')}'S TURN</span>
              <strong>{state.duelBounds[0]}–{state.duelBounds[1]}%</strong>
            </div>
            <div className="pp-history" aria-label="Final round guess history">
              {state.duelGuesses.map((g, i) => <div key={i}>
                <span>{nameOf(g.playerId)}: {g.guess}%</span>
                <strong>{g.feedback === 'higher' ? 'HIGHER ↑' : g.feedback === 'lower' ? 'LOWER ↓' : 'CORRECT!'}</strong>
              </div>)}
            </div>
            {canDuel ? (
              <>
                <output className="pp-value">{safeGuess}%</output>
                <input aria-label="Final duel percentage guess" type="range"
                  min={sliderMin} max={sliderMax} value={safeGuess}
                  onChange={(e) => changeGuess(Number(e.target.value))} />
                <div className="pp-range"><span>{sliderMin}%</span><span>{sliderMax}%</span></div>
                <div className="pp-picks">{[sliderMin, Math.floor((sliderMin + sliderMax) / 2), sliderMax]
                  .filter((v, i, arr) => arr.indexOf(v) === i).map((v) =>
                    <button key={v} type="button" onClick={() => changeGuess(v)}>{v}%</button>)}</div>
                <button className="pp-primary" type="button" onClick={() => duelAnswer(safeGuess)}>SUBMIT GUESS</button>
              </>
            ) : <p className="pp-wait">Waiting for the next guess…</p>}
          </div>
        )}

        {state.phase === 'winner' && (
          <div className="pp-console pp-console--center">
            <p>Final answer: <strong>{state.question.answerPercent}%</strong></p>
            <button className="pp-primary" type="button" onClick={finish}>CONTINUE</button>
          </div>
        )}
      </section>
    </div>
  )
}
