import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import { preloadImages } from '../../utils/preloadImages'
import studioBackdrop from '../../assets/percentage-panic/studio.webp'
import revealBackdrop from '../../assets/percentage-panic/forest-reveal.webp'
import eliminationBackdrop from '../../assets/percentage-panic/elimination.webp'
import finaleBackdrop from '../../assets/percentage-panic/finale.webp'
import {
  advancePercentageRound,
  chooseAiPercentageDuelFirst,
  choosePercentageDuelOrder,
  createPercentagePanic,
  percentagePanicLastPlaceIds,
  percentagePanicRankedGroups,
  percentagePanicRankedIds,
  pickAiDuelGuess,
  percentagePollDetail,
  percentageRoundSpotlights,
  percentagePanicGuessReaction,
  percentagePanicPlayerStyle,
  rankPercentagePanicByScore,
  resolvePercentageDuelGuess,
  resolvePercentageRound,
  type PercentagePanicState,
} from '../../features/percentagePanic/logic'
import { SoundManager } from '../../services/sound/SoundManager'
import { isEmoji } from '../../utils/avatar'
import ResolvedAvatarImage from '../ResolvedAvatarImage/ResolvedAvatarImage'
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
const HIGH_PRIORITY_BACKDROPS = [studioBackdrop, revealBackdrop]
const LOW_PRIORITY_BACKDROPS = [eliminationBackdrop, finaleBackdrop]

function waitForImage(source: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    const timeout = window.setTimeout(done, 6000)
    function done() {
      window.clearTimeout(timeout)
      resolve()
    }
    image.onload = done
    image.onerror = done
    image.src = source
    if (image.complete) done()
  })
}

export default function PercentagePanic({
  participantIds,
  participants = [],
  seed,
  prizeType = 'LOH',
  onComplete,
}: Props) {
  const [assetsReady, setAssetsReady] = useState(false)
  const [sessionSeed] = useState(() => seed ?? cryptoSeed())
  const [state, setState] = useState<PercentagePanicState>(() => {
    const humanId = participants.find((p) => p.isHuman)?.id ?? null
    return createPercentagePanic(participantIds, humanId, sessionSeed)
  })
  const [guess, setGuess] = useState(50)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [watching, setWatching] = useState(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintChoices, setHintChoices] = useState<number[] | null>(null)
  const [pendingDuelGuess, setPendingDuelGuess] = useState<{
    playerId: string
    guess: number
  } | null>(null)
  const guessRef = useRef(50)
  const startRef = useRef(0)
  const duelSuspenseRef = useRef(false)
  const duelTimerRef = useRef<number | null>(null)
  const contestantNodesRef = useRef(new Map<string, HTMLDivElement>())
  const rosterPositionsRef = useRef(new Map<string, DOMRect>())
  const playedRevealRoundRef = useRef<number | null>(null)
  const playedWinnerRef = useRef(false)
  const completionRef = useRef(false)
  const humanActive = state.humanId != null && state.activeIds.includes(state.humanId)

  useEffect(() => {
    if (state.phase === 'reveal' && playedRevealRoundRef.current !== state.roundNumber) {
      playedRevealRoundRef.current = state.roundNumber
      void SoundManager.play('minigame:results')
    }
    if (state.phase === 'winner' && !playedWinnerRef.current) {
      playedWinnerRef.current = true
      void SoundManager.play('minigame:gb_winner')
    }
  }, [state.phase, state.roundNumber])

  useEffect(() => {
    let cancelled = false
    preloadImages(HIGH_PRIORITY_BACKDROPS, 'high')
    preloadImages(LOW_PRIORITY_BACKDROPS, 'low')
    void Promise.all(HIGH_PRIORITY_BACKDROPS.map(waitForImage)).then(() => {
      if (!cancelled) setAssetsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

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
  const queueDuelAnswer = useCallback((playerId: string, value: number) => {
    if (duelSuspenseRef.current) return
    duelSuspenseRef.current = true
    setPendingDuelGuess({ playerId, guess: value })
    void SoundManager.play('ui:confirm')
    duelTimerRef.current = window.setTimeout(() => {
      setState((current) =>
        current.phase === 'duel' && current.duelTurnId === playerId
          ? resolvePercentageDuelGuess(current, playerId, value)
          : current
      )
      setPendingDuelGuess(null)
      duelSuspenseRef.current = false
      duelTimerRef.current = null
    }, 1000)
  }, [])

  useEffect(
    () => () => {
      if (duelTimerRef.current != null) window.clearTimeout(duelTimerRef.current)
    },
    []
  )
  const useHint = () => {
    if (hintsUsed >= 3 || hintChoices || state.phase !== 'question' || !state.humanId) return
    void SoundManager.play('ui:navigate')
    const answer = state.question.answerPercent
    const options = new Set<number>([answer])
    for (const offset of [-5, 5, -10, 10, -15, 15]) {
      const candidate = Math.max(0, Math.min(100, answer + offset))
      if (candidate !== answer) options.add(candidate)
      if (options.size === 3) break
    }
    // At the endpoints, fill the remaining slots with the nearest distinct values.
    for (let distance = 1; options.size < 3 && distance <= 100; distance += 1) {
      for (const candidate of [answer - distance, answer + distance]) {
        if (candidate >= 0 && candidate <= 100) options.add(candidate)
        if (options.size === 3) break
      }
    }
    const humanId = state.humanId
    setState((s) => ({ ...s, scores: { ...s.scores, [humanId]: s.scores[humanId] - 5 } }))
    setHintsUsed((n) => n + 1)
    setHintChoices([...options].sort((a, b) => a - b))
  }

  useEffect(() => {
    if (!assetsReady || state.phase !== 'question') return
    startRef.current = performance.now()
    if (!humanActive) {
      const timeout = window.setTimeout(() => setState((s) => resolvePercentageRound(s)), 900)
      return () => window.clearTimeout(timeout)
    }
    const interval = window.setInterval(() => {
      setTimeLeft(
        Math.max(0, Math.ceil(ROUND_SECONDS - (performance.now() - startRef.current) / 1000))
      )
    }, 160)
    const timeout = window.setTimeout(() => {
      setHintChoices(null)
      setState((s) => resolvePercentageRound(s, guessRef.current, ROUND_SECONDS * 1000))
    }, ROUND_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [assetsReady, state.phase, state.roundNumber, humanActive])

  useEffect(() => {
    if (
      !assetsReady ||
      state.phase !== 'order' ||
      !state.finalists ||
      state.chooserId === state.humanId
    )
      return
    const timeout = window.setTimeout(
      () =>
        setState((s) =>
          chooseAiPercentageDuelFirst(s)
            ? choosePercentageDuelOrder(s, chooseAiPercentageDuelFirst(s)!)
            : s
        ),
      1100
    )
    return () => window.clearTimeout(timeout)
  }, [assetsReady, state.phase, state.chooserId, state.humanId, state.finalists])

  useEffect(() => {
    if (
      !assetsReady ||
      state.phase !== 'duel' ||
      state.duelTurnId === state.humanId ||
      duelSuspenseRef.current
    )
      return
    const timeout = window.setTimeout(
      () => {
        if (state.duelTurnId) queueDuelAnswer(state.duelTurnId, pickAiDuelGuess(state))
      },
      watching ? 120 : 1050
    )
    return () => window.clearTimeout(timeout)
  }, [
    assetsReady,
    state.phase,
    state.duelTurnId,
    state.humanId,
    state.duelGuesses.length,
    pendingDuelGuess,
    queueDuelAnswer,
    state,
    watching,
  ])

  useEffect(() => {
    if (!assetsReady || state.phase !== 'reveal' || humanActive) return
    const timeout = window.setTimeout(() => setState(advancePercentageRound), watching ? 120 : 1800)
    return () => window.clearTimeout(timeout)
  }, [assetsReady, state.phase, state.roundNumber, humanActive, watching])

  const nextRound = () => {
    // Reset input and clock in the user interaction, not synchronously in an effect.
    changeGuess(50)
    setTimeLeft(ROUND_SECONDS)
    setHintChoices(null)
    void SoundManager.play('ui:navigate')
    setState(advancePercentageRound)
  }

  const lock = () => {
    setHintChoices(null)
    void SoundManager.play('ui:confirm')
    const responseMs = Math.max(
      0,
      Math.min(ROUND_SECONDS * 1000, Math.floor(performance.now() - startRef.current))
    )
    setState((s) => resolvePercentageRound(s, guessRef.current, responseMs))
  }
  const duelAnswer = (value: number) => {
    if (!state.duelTurnId) return
    queueDuelAnswer(state.duelTurnId, value)
  }

  const finish = () => {
    if (completionRef.current || !state.winnerId) return
    completionRef.current = true
    onComplete?.(
      {
        authoritativeWinnerId: state.winnerId,
        authoritativeLastPlaceId: percentagePanicLastPlaceIds(state)[0] ?? null,
        authoritativeLastPlaceIds: percentagePanicLastPlaceIds(state),
        authoritativeTiedGroups: percentagePanicRankedGroups(state).filter(
          (group) => group.length > 1
        ),
        authoritativeRankedIds: percentagePanicRankedIds(state),
        rawResults: { ...state.scores },
        rawValue: state.humanId ? state.scores[state.humanId] : 0,
      },
      state.humanId ? state.scores[state.humanId] : 0
    )
  }

  const result = state.lastRound
  const worst = result?.eliminatedIds ?? []
  const roundSpotlights = result ? percentageRoundSpotlights(result.answers) : null
  const answersByPlayer = new Map(
    (result?.answers ?? []).map((answer) => [answer.playerId, answer])
  )
  const leaderboardIds = useMemo(
    () => rankPercentagePanicByScore(state.contestants, state.scores, state.responseTotals),
    [state.contestants, state.scores, state.responseTotals]
  )
  const leaderboardOrderKey = leaderboardIds.join('|')
  const pollDetail = state.phase === 'reveal' ? percentagePollDetail(state.question) : null
  const currentRank = new Map(leaderboardIds.map((id, index) => [id, index + 1]))
  const scoresBeforeRound = Object.fromEntries(
    state.contestants.map((id) => [id, state.scores[id] - (answersByPlayer.get(id)?.score ?? 0)])
  )
  const timesBeforeRound = Object.fromEntries(
    state.contestants.map((id) => [
      id,
      state.responseTotals[id] - (answersByPlayer.get(id)?.responseMs ?? 0),
    ])
  )
  const previousRankedIds = rankPercentagePanicByScore(
    state.contestants,
    scoresBeforeRound,
    timesBeforeRound
  )
  const previousRank = new Map(previousRankedIds.map((id, index) => [id, index + 1]))
  const biggestMover =
    result && state.roundNumber > 1
      ? state.contestants
          .map((id) => ({ id, places: (previousRank.get(id) ?? 0) - (currentRank.get(id) ?? 0) }))
          .sort((a, b) => b.places - a.places)[0]
      : null
  const roundRows = result
    ? [...result.answers].sort(
        (a, b) => (currentRank.get(a.playerId) ?? 99) - (currentRank.get(b.playerId) ?? 99)
      )
    : []
  const canDuel = state.phase === 'duel' && state.duelTurnId === state.humanId
  const sliderMin = state.phase === 'duel' ? state.duelBounds[0] : 0
  const sliderMax = state.phase === 'duel' ? state.duelBounds[1] : 100
  const safeGuess = Math.max(sliderMin, Math.min(sliderMax, guess))
  const backdrop =
    state.phase === 'winner' || state.phase === 'order' || state.phase === 'duel'
      ? finaleBackdrop
      : state.phase === 'reveal'
        ? state.humanId && worst.includes(state.humanId)
          ? eliminationBackdrop
          : revealBackdrop
        : studioBackdrop
  const studioStyle = { '--pp-backdrop': `url("${backdrop}")` } as CSSProperties

  useLayoutEffect(() => {
    const previous = rosterPositionsRef.current
    const next = new Map<string, DOMRect>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const id of leaderboardIds) {
      const node = contestantNodesRef.current.get(id)
      if (!node) continue
      const rect = node.getBoundingClientRect()
      next.set(id, rect)
      const prior = previous.get(id)
      const deltaX = prior ? prior.left - rect.left : 0
      const deltaY = prior ? prior.top - rect.top : 0
      if (!reduceMotion && (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1)) {
        node.animate(
          [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 460, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' }
        )
      }
    }
    rosterPositionsRef.current = next
  }, [leaderboardOrderKey, leaderboardIds])

  if (!assetsReady) {
    return (
      <div className="pp-loading" role="status" aria-live="polite">
        <span className="pp-loading__spinner" aria-hidden="true" />
        <p>Setting the stage…</p>
      </div>
    )
  }

  return (
    <div className="pp-shell" data-phase={state.phase}>
      <div className="pp-studio" aria-hidden="true" style={studioStyle}>
        <span />
        <span />
        <span />
        <span />
      </div>
      <section className="pp-stage" aria-label="Percentage Panic studio">
        <header className="pp-header">
          <div>
            <p className="pp-overline">THE BIG EYE • {prizeType} COMPETITION</p>
            <h2>
              PERCENTAGE <em>PANIC</em>
            </h2>
          </div>
          <span className="pp-round">
            {state.phase === 'duel'
              ? 'ROUND 10 · FINAL'
              : state.phase === 'order'
                ? 'FINAL TWO'
                : state.phase === 'winner'
                  ? 'WINNER'
                  : `ROUND ${state.roundNumber}`}
          </span>
        </header>

        <div className="pp-roster" aria-label="Contestants">
          {leaderboardIds.map((id) => {
            const active = state.activeIds.includes(id)
            return (
              <div
                className={`pp-contestant ${active ? '' : 'pp-contestant--out'}`}
                key={id}
                ref={(node) => {
                  if (node) contestantNodesRef.current.set(id, node)
                  else contestantNodesRef.current.delete(id)
                }}
              >
                <span className="pp-avatar">
                  {isEmoji(players[id]?.avatar ?? '') ? (
                    players[id]?.avatar
                  ) : (
                    <ResolvedAvatarImage
                      id={id}
                      name={nameOf(id)}
                      avatar={players[id]?.avatar}
                      isUser={players[id]?.isHuman}
                      alt=""
                    />
                  )}
                </span>
                <span className="pp-contestant__name">{nameOf(id)}</span>
                {!players[id]?.isHuman && (
                  <small className="pp-contestant__style">
                    {percentagePanicPlayerStyle(sessionSeed, id)}
                  </small>
                )}
                <strong key={state.scores[id]}>{state.scores[id]}</strong>
              </div>
            )
          })}
        </div>

        <div className="pp-screen" key={`${state.phase}-${state.roundNumber}`}>
          <span className="pp-screen__badge">
            {state.phase === 'reveal'
              ? 'SURVEY SAYS'
              : state.phase === 'winner'
                ? 'CHAMPION REVEALED'
                : state.phase === 'order'
                  ? 'THE FINAL SHOWDOWN'
                  : 'PEOPLE ARE UNPREDICTABLE'}
          </span>
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
              <p className="pp-screen__super">
                {state.question.category} · {state.question.referenceYear} survey
              </p>
              <h3 className="pp-screen__question">{state.question.prompt}</h3>
              {state.phase === 'reveal' && (
                <>
                  <div className="pp-truth pp-answer-reveal">{state.question.answerPercent}%</div>
                  {pollDetail && (
                    <div className="pp-poll-detail" aria-label="Poll side quest">
                      <strong>
                        {pollDetail.samePoll ? 'SAME POLL, PLOT TWIST' : 'RELATED POLL'}
                      </strong>
                      <p>{pollDetail.text}</p>
                      <a href={pollDetail.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {pollDetail.sourceName} · {pollDetail.referenceYear} ↗
                      </a>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {state.phase !== 'winner' && state.phase !== 'order' && (
            <span className="pp-screen__source">
              {state.phase === 'reveal'
                ? `Source: ${state.question.sourceName} · ${state.question.referenceYear}`
                : 'LOCK YOUR ESTIMATE BEFORE THE CLOCK RUNS OUT'}
            </span>
          )}
        </div>

        {state.phase === 'question' && humanActive && (
          <div className="pp-console">
            <div className="pp-console__top">
              <span>YOUR ESTIMATE</span>
              <strong>{timeLeft}s</strong>
            </div>
            <output className="pp-value">{guess}%</output>
            <input
              aria-label="Choose a percentage from zero to one hundred"
              type="range"
              min="0"
              max="100"
              step="1"
              value={guess}
              onChange={(e) => changeGuess(Number(e.target.value))}
            />
            <div className="pp-range">
              <span>0%</span>
              <span>100%</span>
            </div>
            <div className="pp-picks">
              {QUICK_PICKS.map((value) => (
                <button type="button" key={value} onClick={() => changeGuess(value)}>
                  {value}%
                </button>
              ))}
            </div>
            {hintChoices ? (
              <div className="pp-hint-options" aria-label="Hint answers">
                <span>Hint used · −5 points · choose the correct percentage</span>
                {hintChoices.map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => {
                      changeGuess(value)
                      setHintChoices(null)
                    }}
                  >
                    {value}%
                  </button>
                ))}
                <button type="button" onClick={() => setHintChoices(null)}>
                  Close choices
                </button>
              </div>
            ) : hintsUsed < 3 ? (
              <button className="pp-hint" type="button" onClick={useHint}>
                USE HINT ({3 - hintsUsed} left · −5 points)
              </button>
            ) : (
              <span className="pp-hint">No hints remaining</span>
            )}
            <button className="pp-primary" type="button" onClick={lock}>
              LOCK GUESS
            </button>
          </div>
        )}

        {state.phase === 'question' && !humanActive && (
          <div className="pp-console pp-console--center">
            <p>The remaining contestants are locking their guesses…</p>
            <button type="button" onClick={() => setWatching(true)}>
              Fast-forward spectator mode
            </button>
          </div>
        )}

        {state.phase === 'reveal' && result && (
          <div className="pp-results">
            {state.humanId && worst.includes(state.humanId) && (
              <div className="pp-eliminated-callout">
                <span className="pp-eliminated-callout__avatar">
                  {isEmoji(players[state.humanId]?.avatar ?? '') ? (
                    players[state.humanId]?.avatar
                  ) : (
                    <ResolvedAvatarImage
                      id={state.humanId}
                      name={nameOf(state.humanId)}
                      avatar={players[state.humanId]?.avatar}
                      isUser={players[state.humanId]?.isHuman}
                      alt=""
                    />
                  )}
                </span>
                <strong>OUT OF THE FINAL TWO · {nameOf(state.humanId)}</strong>
                <span>Your cumulative score placed you outside the top two after round 9.</span>
              </div>
            )}
            {!state.finalists && (
              <p className="pp-alert">
                No eliminations this round. Everyone stays in until round 9.
              </p>
            )}
            <p className="pp-standings-callout" aria-live="polite">
              {biggestMover && biggestMover.places > 0
                ? `${nameOf(biggestMover.id)} climbs ${biggestMover.places} ${biggestMover.places === 1 ? 'place' : 'places'} on the leaderboard.`
                : state.roundNumber === 1
                  ? `${nameOf(leaderboardIds[0])} grabs the early lead.`
                  : `${nameOf(leaderboardIds[0])} holds the lead.`}
            </p>
            {roundSpotlights && (
              <div className="pp-spotlights" role="group" aria-label="Round highlights">
                <div className="pp-spotlight pp-spotlight--strongest">
                  <span>STRONGEST THIS ROUND</span>
                  <strong>
                    {roundSpotlights.strongest.map((a) => nameOf(a.playerId)).join(', ')}
                  </strong>
                  <small>
                    {roundSpotlights.strongest.length > 1
                      ? `Tied · ${roundSpotlights.strongest[0].error} points off`
                      : `${roundSpotlights.strongest[0].error} points off · guessed ${roundSpotlights.strongest[0].guess}%`}
                  </small>
                </div>
                <div className="pp-spotlight pp-spotlight--weakest">
                  <span>WEAKEST THIS ROUND</span>
                  <strong>
                    {roundSpotlights.weakest.map((a) => nameOf(a.playerId)).join(', ')}
                  </strong>
                  <small>
                    {roundSpotlights.weakest.length > 1
                      ? `Tied · ${roundSpotlights.weakest[0].error} points off`
                      : `${roundSpotlights.weakest[0].error} points off · guessed ${roundSpotlights.weakest[0].guess}%`}
                  </small>
                </div>
              </div>
            )}
            <details className="pp-records">
              <summary>
                FULL ROUND RECORDS <span>{roundRows.length} players</span>
              </summary>
              <div className="pp-records__body">
                <div className="pp-results__header">
                  <span>CONTESTANT</span>
                  <span>GUESS</span>
                  <span>ERROR</span>
                  <span>TOTAL</span>
                </div>
                {roundRows.map((a, index) => {
                  const isFinalist = state.finalists?.includes(a.playerId) ?? false
                  const isOut = worst.includes(a.playerId)
                  const places =
                    (previousRank.get(a.playerId) ?? 0) - (currentRank.get(a.playerId) ?? 0)
                  const movement =
                    state.roundNumber === 1
                      ? ''
                      : places > 0
                        ? `↑ ${places}`
                        : places < 0
                          ? `↓ ${Math.abs(places)}`
                          : '—'
                  return (
                    <div
                      className={`pp-results__row ${isOut ? 'pp-results__row--out' : ''} ${isFinalist ? 'pp-results__row--finalist' : ''}`}
                      key={a.playerId}
                      style={{ '--row-index': index } as CSSProperties}
                    >
                      <span className="pp-results__player">
                        <span className="pp-results__identity">
                          <span className="pp-results__rank">#{currentRank.get(a.playerId)}</span>{' '}
                          {nameOf(a.playerId)}
                          {isOut ? ' • OUT' : isFinalist ? ' • FINALIST' : ''}
                          {movement && (
                            <small
                              className={`pp-results__movement ${places > 0 ? 'pp-results__movement--up' : places < 0 ? 'pp-results__movement--down' : ''}`}
                            >
                              {movement}
                            </small>
                          )}
                        </span>
                        <small className="pp-results__reaction">
                          {percentagePanicGuessReaction(
                            sessionSeed,
                            a.playerId,
                            a.error,
                            state.roundNumber
                          )}
                        </small>
                      </span>
                      <span>{a.guess}%</span>
                      <span>−{a.error}</span>
                      <strong>{state.scores[a.playerId]}</strong>
                    </div>
                  )
                })}
              </div>
            </details>
            <a
              className="pp-source"
              href={state.question.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Check published source ↗
            </a>
            <button className="pp-primary" type="button" onClick={nextRound}>
              {state.winnerId
                ? 'REVEAL WINNER'
                : state.finalists
                  ? 'ENTER ROUND 10 FINAL'
                  : 'NEXT ROUND'}
            </button>
          </div>
        )}

        {state.phase === 'order' && state.finalists && (
          <div className="pp-console pp-console--center">
            <div className="pp-finalists">
              {state.finalists.map((id) => (
                <div key={id}>
                  <strong>{nameOf(id)}</strong>
                  <span>{state.scores[id]} pts</span>
                </div>
              ))}
            </div>
            {state.chooserId === state.humanId ? (
              <>
                <p>You earned the choice. Who takes the first guess?</p>
                <div className="pp-actions">
                  <button
                    className="pp-primary"
                    onClick={() => setState((s) => choosePercentageDuelOrder(s, state.humanId!))}
                  >
                    I GUESS FIRST
                  </button>
                  <button
                    className="pp-secondary"
                    onClick={() =>
                      setState((s) =>
                        choosePercentageDuelOrder(
                          s,
                          state.finalists!.find((id) => id !== state.humanId)!
                        )
                      )
                    }
                  >
                    I GUESS SECOND
                  </button>
                </div>
              </>
            ) : (
              <p>{nameOf(state.chooserId || '')} is choosing the order…</p>
            )}
          </div>
        )}

        {state.phase === 'duel' && (
          <div className="pp-console">
            <div className="pp-console__top">
              <span>{nameOf(state.duelTurnId || '')}'S TURN</span>
              <strong>
                {state.duelBounds[0]}–{state.duelBounds[1]}%
              </strong>
            </div>
            <div className="pp-history" aria-label="Final round guess history">
              {state.duelGuesses.map((g, i) => (
                <div key={i}>
                  <span>
                    {nameOf(g.playerId)}: {g.guess}%
                  </span>
                  <strong>
                    {g.feedback === 'higher'
                      ? 'HIGHER ↑'
                      : g.feedback === 'lower'
                        ? 'LOWER ↓'
                        : 'CORRECT!'}
                  </strong>
                </div>
              ))}
            </div>
            {pendingDuelGuess ? (
              <div className="pp-suspense" role="status" aria-live="assertive">
                <span className="pp-suspense__light" aria-hidden="true" />
                <strong>{nameOf(pendingDuelGuess.playerId)} HAS LOCKED IN</strong>
                <span>Higher… lower… or the exact number?</span>
              </div>
            ) : canDuel ? (
              <>
                <output className="pp-value">{safeGuess}%</output>
                <input
                  aria-label="Final duel percentage guess"
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  value={safeGuess}
                  onChange={(e) => changeGuess(Number(e.target.value))}
                />
                <div className="pp-range">
                  <span>{sliderMin}%</span>
                  <span>{sliderMax}%</span>
                </div>
                <div className="pp-picks">
                  {[sliderMin, Math.floor((sliderMin + sliderMax) / 2), sliderMax]
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .map((v) => (
                      <button key={v} type="button" onClick={() => changeGuess(v)}>
                        {v}%
                      </button>
                    ))}
                </div>
                <button className="pp-primary" type="button" onClick={() => duelAnswer(safeGuess)}>
                  SUBMIT GUESS
                </button>
              </>
            ) : (
              <p className="pp-wait">Waiting for the next guess…</p>
            )}
          </div>
        )}

        {state.phase === 'winner' && (
          <div className="pp-console pp-console--center">
            <p>
              Final answer: <strong>{state.question.answerPercent}%</strong>
            </p>
            <button className="pp-primary" type="button" onClick={finish}>
              CONTINUE
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
