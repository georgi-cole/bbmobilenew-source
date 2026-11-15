import { useSeasonAiCapability } from '../../ai/competition/SeasonAiContext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCompetitionResultCheckpoint } from '../../minigames/competitionResultContext'
import { seededPickN, mulberry32 } from '../../store/rng'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import { NUMBER_TRIVIA_QUESTIONS } from './numberTriviaData'
import {
  compareTriviaStandings,
  computeNumberTriviaRoundScore,
  createNumberTriviaAiRng,
  getNumberTriviaDuelLoserId,
  getNumberTriviaEliminationCount,
  getNumberTriviaFinalistIds,
  getTriviaHint,
  NUMBER_TRIVIA_DUEL_STARTING_LIVES,
  NUMBER_TRIVIA_MAX_ATTEMPTS,
  NUMBER_TRIVIA_READING_BUFFER_MS,
  NUMBER_TRIVIA_TOTAL_ROUNDS,
  simulateNumberTriviaAiPerformance,
  type TriviaRoundPerformance,
  type TriviaStanding,
} from './numberTriviaUtils'
import NumericKeypad from '../NumericKeypad/NumericKeypad'
import { resolveAvatar } from '../../utils/avatar'
import './NumberTrivia.css'
import { NumberTriviaResults, TriviaPortrait } from './NumberTriviaResults'

export interface ScoreboardState {
  phase: 'qualifier' | 'duel'
  roundNumber: number
  duelNumber?: number
  answer: number
  eliminatedIds: string[]
  lifeLostId?: string
  finalistIds: string[]
  lives: Record<string, number>
  standings: TriviaStanding[]
  final: boolean
}

interface ResolvedParticipant {
  id: string
  name: string
  isHuman: boolean
  precomputedScore: number
  avatar?: string
}

function buildFallbackParticipants(): ResolvedParticipant[] {
  return [
    { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
    { id: 'ai-1', name: 'Cipher', isHuman: false, precomputedScore: 52 },
    { id: 'ai-2', name: 'Nova', isHuman: false, precomputedScore: 64 },
    { id: 'ai-3', name: 'Atlas', isHuman: false, precomputedScore: 76 },
  ]
}

function makeInitialStandings(participants: ResolvedParticipant[]): TriviaStanding[] {
  return participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    isHuman: participant.isHuman,
    cumulativeScore: 0,
    lastRoundScore: 0,
    lastRoundAttempts: 0,
    lastRoundTimeMs: 0,
    lastRoundGuessed: false,
    eliminatedRound: null,
  }))
}

export default function NumberTrivia({
  onFinish,
  participantIds,
  participants,
  seed = 0,
}: GenericMinigameProps) {
  const aiCapability = useSeasonAiCapability()
  const resolvedParticipants = useMemo<ResolvedParticipant[]>(() => {
    if (participants && participants.length > 0) {
      return participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        isHuman: participant.isHuman,
        precomputedScore: participant.precomputedScore,
        avatar: resolveAvatar({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar ?? '',
          isUser: participant.isHuman,
        }),
      }))
    }
    if (participantIds && participantIds.length > 0) {
      return participantIds.map((id, index) => ({
        id,
        name: index === 0 ? 'You' : `Player ${index + 1}`,
        isHuman: index === 0,
        precomputedScore: 45 + index * 10,
      }))
    }
    return buildFallbackParticipants()
  }, [participantIds, participants])

  const chosenQuestions = useMemo(() => {
    const rng = mulberry32(seed >>> 0)
    // The first five picks remain the qualifier questions. The rest provide a
    // deterministic, non-repeating bank for a duel of any realistic length.
    return seededPickN(rng, NUMBER_TRIVIA_QUESTIONS, NUMBER_TRIVIA_QUESTIONS.length)
  }, [seed])

  const humanId = useMemo(
    () =>
      resolvedParticipants.find((participant) => participant.isHuman)?.id ??
      resolvedParticipants[0]?.id ??
      'human',
    [resolvedParticipants]
  )

  const [standings, setStandings] = useState<TriviaStanding[]>(() =>
    makeInitialStandings(resolvedParticipants)
  )
  const [roundIndex, setRoundIndex] = useState(0)
  const [phase, setPhase] = useState<'qualifier' | 'duel'>('qualifier')
  const [duelIndex, setDuelIndex] = useState(0)
  const [duelLives, setDuelLives] = useState<Record<string, number>>({})
  const [answerInput, setAnswerInput] = useState('')
  const [hint, setHint] = useState('Read the question — answering opens shortly')
  const [roundAttempts, setRoundAttempts] = useState(0)
  const [closestDistance, setClosestDistance] = useState<number | undefined>(undefined)
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null)
  const [inputError, setInputError] = useState<string | null>(null)
  const [readingSeconds, setReadingSeconds] = useState(
    Math.ceil(NUMBER_TRIVIA_READING_BUFFER_MS / 1000)
  )
  const [answeringOpen, setAnsweringOpen] = useState(false)
  const [showStandings, setShowStandings] = useState(false)
  const gameContentRef = useRef<HTMLElement>(null)
  const roundStartedAtRef = useRef(0)

  const currentRoundNumber = roundIndex + 1
  const scoreboardVisible = Boolean(scoreboard)
  const currentQuestion =
    phase === 'duel'
      ? chosenQuestions[NUMBER_TRIVIA_TOTAL_ROUNDS + duelIndex]
      : chosenQuestions[roundIndex]
  const activeStandings = useMemo(
    () =>
      standings.filter((entry) =>
        phase === 'duel'
          ? (duelLives[entry.participantId] ?? 0) > 0
          : entry.eliminatedRound === null
      ),
    [duelLives, phase, standings]
  )
  const humanStanding = standings.find((entry) => entry.participantId === humanId) ?? null
  const humanStillActive =
    phase === 'duel' ? (duelLives[humanId] ?? 0) > 0 : humanStanding?.eliminatedRound === null

  useCompetitionResultCheckpoint(
    scoreboard?.final && scoreboard.standings.length
      ? {
          rawValue:
            scoreboard.standings.find((entry) => entry.participantId === humanId)
              ?.cumulativeScore ?? scoreboard.standings[0].cumulativeScore,
          partial: false,
          completion: {
            authoritativeWinnerId: scoreboard.standings[0].participantId,
            authoritativeRankedIds: scoreboard.standings.map((entry) => entry.participantId),
            rawResults: Object.fromEntries(
              scoreboard.standings.map((entry) => [entry.participantId, entry.cumulativeScore])
            ),
          },
        }
      : null
  )

  useEffect(() => {
    if (scoreboard || !currentQuestion || !humanStillActive) {
      return undefined
    }

    const readingStartedAt = Date.now()
    const tick = window.setInterval(() => {
      const remainingMs = Math.max(
        0,
        NUMBER_TRIVIA_READING_BUFFER_MS - (Date.now() - readingStartedAt)
      )
      setReadingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)))
    }, 200)
    const open = window.setTimeout(() => {
      window.clearInterval(tick)
      roundStartedAtRef.current = Date.now()
      setReadingSeconds(0)
      setAnsweringOpen(true)
      setHint('Enter your answer below')
    }, NUMBER_TRIVIA_READING_BUFFER_MS)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(open)
    }
  }, [currentQuestion, humanStillActive, scoreboard])

  useEffect(() => {
    if (gameContentRef.current) gameContentRef.current.scrollTop = 0
  }, [scoreboardVisible, scoreboard?.roundNumber, scoreboard?.duelNumber, currentQuestion])

  const finishCompetition = useCallback(
    (finalStandings: TriviaStanding[]) => {
      if (!onFinish || finalStandings.length === 0) return
      const rawResults = Object.fromEntries(
        finalStandings.map((entry) => [entry.participantId, entry.cumulativeScore])
      )
      const winner = finalStandings[0]
      onFinish(rawResults[humanId] ?? winner.cumulativeScore, undefined, {
        authoritativeWinnerId: winner.participantId,
        authoritativeRankedIds: finalStandings.map((entry) => entry.participantId),
        rawValue: rawResults[humanId] ?? winner.cumulativeScore,
        rawResults,
      })
    },
    [humanId, onFinish]
  )

  const resolveRound = useCallback(
    (
      humanPerformance?: TriviaRoundPerformance,
      options?: {
        roundIndex?: number
        sourceStandings?: TriviaStanding[]
      }
    ) => {
      const effectiveRoundIndex = options?.roundIndex ?? roundIndex
      const effectiveRoundNumber = effectiveRoundIndex + 1
      const effectiveQuestion = chosenQuestions[effectiveRoundIndex]
      const sourceStandings = options?.sourceStandings ?? standings
      if (!effectiveQuestion) return null

      const activeIds = new Set(
        sourceStandings
          .filter((entry) => entry.eliminatedRound === null)
          .map((entry) => entry.participantId)
      )
      const performanceById = new Map<string, TriviaRoundPerformance>()

      sourceStandings.forEach((entry) => {
        if (!activeIds.has(entry.participantId)) return
        if (entry.participantId === humanId) {
          if (humanPerformance) performanceById.set(entry.participantId, humanPerformance)
          return
        }
        const participant = resolvedParticipants.find(
          (candidate) => candidate.id === entry.participantId
        )
        performanceById.set(
          entry.participantId,
          simulateNumberTriviaAiPerformance(
            {
              aiCapability,
              precomputedScore: participant?.precomputedScore ?? 50,
              roundNumber: effectiveRoundNumber,
              question: effectiveQuestion,
            },
            createNumberTriviaAiRng({
              seed,
              roundNumber: effectiveRoundNumber,
              participantId: entry.participantId,
            })
          )
        )
      })

      const updated = sourceStandings.map((entry) => {
        const performance = performanceById.get(entry.participantId)
        if (!performance) return entry
        const roundScore = computeNumberTriviaRoundScore(performance)
        return {
          ...entry,
          cumulativeScore: entry.cumulativeScore + roundScore,
          lastRoundScore: roundScore,
          lastRoundAttempts: performance.attempts,
          lastRoundTimeMs: performance.timeMs,
          lastRoundGuessed: performance.guessed,
        }
      })

      const rankedActive = updated
        .filter((entry) => entry.eliminatedRound === null)
        .sort(compareTriviaStandings)
      const isFinalQualifier = effectiveRoundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
      const finalistIds = isFinalQualifier ? getNumberTriviaFinalistIds(rankedActive) : []
      const eliminationCount = getNumberTriviaEliminationCount(
        effectiveRoundNumber,
        rankedActive.length
      )
      const eliminatedIds = isFinalQualifier
        ? rankedActive
            .filter((entry) => !finalistIds.includes(entry.participantId))
            .map((entry) => entry.participantId)
        : rankedActive
            .slice(Math.max(0, rankedActive.length - eliminationCount))
            .map((entry) => entry.participantId)

      const nextStandings = updated
        .map((entry) =>
          eliminatedIds.includes(entry.participantId) && entry.eliminatedRound === null
            ? { ...entry, eliminatedRound: effectiveRoundNumber }
            : entry
        )
        .sort(compareTriviaStandings)

      const remainingIds = nextStandings
        .filter((entry) => entry.eliminatedRound === null)
        .map((entry) => entry.participantId)
      const resolvedFinalistIds = isFinalQualifier ? finalistIds : remainingIds
      const lives = isFinalQualifier
        ? Object.fromEntries(
            resolvedFinalistIds.map((id) => [id, NUMBER_TRIVIA_DUEL_STARTING_LIVES])
          )
        : {}
      const final = isFinalQualifier && resolvedFinalistIds.length <= 1

      setStandings(nextStandings)
      setRoundIndex(effectiveRoundIndex)
      if (isFinalQualifier) setDuelLives(lives)
      const nextScoreboard: ScoreboardState = {
        phase: 'qualifier',
        roundNumber: effectiveRoundNumber,
        answer: effectiveQuestion.answer,
        eliminatedIds,
        finalistIds: resolvedFinalistIds,
        lives,
        standings: nextStandings,
        final,
      }
      setScoreboard(nextScoreboard)
      return nextScoreboard
    },
    [roundIndex, chosenQuestions, standings, humanId, resolvedParticipants, aiCapability, seed]
  )

  const resolveDuel = useCallback(
    (
      humanPerformance?: TriviaRoundPerformance,
      options?: {
        duelIndex?: number
        sourceStandings?: TriviaStanding[]
        sourceLives?: Record<string, number>
      }
    ) => {
      const effectiveDuelIndex = options?.duelIndex ?? duelIndex
      const duelNumber = effectiveDuelIndex + 1
      const effectiveQuestion = chosenQuestions[NUMBER_TRIVIA_TOTAL_ROUNDS + effectiveDuelIndex]
      const sourceStandings = options?.sourceStandings ?? standings
      const sourceLives = options?.sourceLives ?? duelLives
      if (!effectiveQuestion) return null

      const activeIds = sourceStandings
        .filter((entry) => (sourceLives[entry.participantId] ?? 0) > 0)
        .map((entry) => entry.participantId)
      if (activeIds.length <= 1) return null

      const performanceById = new Map<string, TriviaRoundPerformance>()
      activeIds.forEach((participantId) => {
        if (participantId === humanId) {
          if (humanPerformance) performanceById.set(participantId, humanPerformance)
          return
        }
        const participant = resolvedParticipants.find((candidate) => candidate.id === participantId)
        performanceById.set(
          participantId,
          simulateNumberTriviaAiPerformance(
            {
              aiCapability,
              precomputedScore: participant?.precomputedScore ?? 50,
              roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
              question: effectiveQuestion,
            },
            createNumberTriviaAiRng({
              seed,
              roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
              participantId,
            })
          )
        )
      })

      const duelEntries = activeIds.flatMap((participantId) => {
        const performance = performanceById.get(participantId)
        return performance ? [{ participantId, performance }] : []
      })
      const lifeLostId = getNumberTriviaDuelLoserId(
        duelEntries,
        createNumberTriviaAiRng({
          seed,
          roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
          participantId: 'duel-tiebreak',
        })
      )
      if (!lifeLostId) return null

      const nextLives = {
        ...sourceLives,
        [lifeLostId]: Math.max(
          0,
          (sourceLives[lifeLostId] ?? NUMBER_TRIVIA_DUEL_STARTING_LIVES) - 1
        ),
      }
      const eliminatedIds = nextLives[lifeLostId] === 0 ? [lifeLostId] : []
      const updated = sourceStandings.map((entry) => {
        const performance = performanceById.get(entry.participantId)
        const scored = performance
          ? {
              ...entry,
              cumulativeScore: entry.cumulativeScore + computeNumberTriviaRoundScore(performance),
              lastRoundScore: computeNumberTriviaRoundScore(performance),
              lastRoundAttempts: performance.attempts,
              lastRoundTimeMs: performance.timeMs,
              lastRoundGuessed: performance.guessed,
            }
          : entry
        return eliminatedIds.includes(entry.participantId)
          ? { ...scored, eliminatedRound: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber }
          : scored
      })
      const remainingIds = activeIds.filter((id) => (nextLives[id] ?? 0) > 0)
      const final = remainingIds.length <= 1
      const nextStandings = [...updated].sort((a, b) => {
        const livesDifference =
          (nextLives[b.participantId] ?? -1) - (nextLives[a.participantId] ?? -1)
        if (livesDifference !== 0) return livesDifference
        return compareTriviaStandings(a, b)
      })

      setStandings(nextStandings)
      setDuelLives(nextLives)
      setDuelIndex(effectiveDuelIndex)
      const nextScoreboard: ScoreboardState = {
        phase: 'duel',
        roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
        duelNumber,
        answer: effectiveQuestion.answer,
        eliminatedIds,
        lifeLostId,
        finalistIds: Object.keys(nextLives),
        lives: nextLives,
        standings: nextStandings,
        final,
      }
      setScoreboard(nextScoreboard)
      return nextScoreboard
    },
    [
      aiCapability,
      chosenQuestions,
      duelIndex,
      duelLives,
      humanId,
      resolvedParticipants,
      seed,
      standings,
    ]
  )

  const submitAnswer = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard || !answeringOpen) return
    const trimmedAnswerInput = answerInput.trim()
    const guess = Number(trimmedAnswerInput)
    if (trimmedAnswerInput === '' || !Number.isSafeInteger(guess)) {
      setInputError('Please enter a whole number.')
      return
    }

    setInputError(null)
    const nextAttempts = roundAttempts + 1
    const distance = Math.abs(guess - currentQuestion.answer)
    const bestDistance = Math.min(distance, closestDistance ?? Number.POSITIVE_INFINITY)
    setRoundAttempts(nextAttempts)
    setClosestDistance(bestDistance)

    if (guess === currentQuestion.answer) {
      setHint('Correct!')
      const performance = {
        guessed: true,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: 0,
      }
      if (phase === 'duel') resolveDuel(performance)
      else resolveRound(performance)
      return
    }

    if (nextAttempts >= NUMBER_TRIVIA_MAX_ATTEMPTS) {
      setHint(`Out of attempts — the answer was ${currentQuestion.answer}.`)
      const performance = {
        guessed: false,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: bestDistance,
      }
      if (phase === 'duel') resolveDuel(performance)
      else resolveRound(performance)
      return
    }

    setHint(getTriviaHint(guess, currentQuestion.answer))
    setAnswerInput('')
  }, [
    answerInput,
    answeringOpen,
    closestDistance,
    currentQuestion,
    humanStillActive,
    phase,
    resolveDuel,
    resolveRound,
    roundAttempts,
    scoreboard,
  ])

  const skipQuestion = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard || !answeringOpen) return
    const performance = {
      guessed: false,
      attempts: Math.max(1, roundAttempts),
      timeMs: Date.now() - roundStartedAtRef.current,
      closestDistance,
      skipped: true,
    }
    if (phase === 'duel') resolveDuel(performance)
    else resolveRound(performance)
  }, [
    answeringOpen,
    closestDistance,
    currentQuestion,
    humanStillActive,
    phase,
    resolveDuel,
    resolveRound,
    roundAttempts,
    scoreboard,
  ])

  const continueFromScoreboard = useCallback(() => {
    if (!scoreboard) return
    if (scoreboard.final) {
      finishCompetition(scoreboard.standings)
      return
    }
    setAnswerInput('')
    setShowStandings(false)
    setRoundAttempts(0)
    setClosestDistance(undefined)
    setInputError(null)
    setAnsweringOpen(false)
    setReadingSeconds(Math.ceil(NUMBER_TRIVIA_READING_BUFFER_MS / 1000))
    setHint('Read the question — answering opens shortly')

    if (scoreboard.phase === 'qualifier' && scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS) {
      setPhase('duel')
      setDuelIndex(0)
      setDuelLives(scoreboard.lives)
      if ((scoreboard.lives[humanId] ?? 0) > 0) {
        setScoreboard(null)
      } else {
        setHint('You have been eliminated. The finalists will finish the duel.')
        resolveDuel(undefined, {
          duelIndex: 0,
          sourceStandings: scoreboard.standings,
          sourceLives: scoreboard.lives,
        })
      }
      return
    }

    if (scoreboard.phase === 'duel') {
      const nextDuelIndex = scoreboard.duelNumber ?? 1
      setDuelIndex(nextDuelIndex)
      if ((scoreboard.lives[humanId] ?? 0) > 0) {
        setScoreboard(null)
      } else {
        setHint('You are out of lives. The remaining finalists continue.')
        resolveDuel(undefined, {
          duelIndex: nextDuelIndex,
          sourceStandings: scoreboard.standings,
          sourceLives: scoreboard.lives,
        })
      }
      return
    }

    const nextRoundIndex = roundIndex + 1
    const nextHumanStanding = standings.find((entry) => entry.participantId === humanId) ?? null
    if (nextHumanStanding?.eliminatedRound === null) {
      setRoundIndex(nextRoundIndex)
      setScoreboard(null)
    } else {
      setHint('You have been eliminated. The remaining players will finish the tournament.')
      resolveRound(undefined, {
        roundIndex: nextRoundIndex,
        sourceStandings: standings,
      })
    }
  }, [finishCompetition, humanId, resolveDuel, resolveRound, roundIndex, scoreboard, standings])

  const fastForwardToResults = useCallback(() => {
    if (!scoreboard) return
    setShowStandings(false)
    let simulatedStandings = scoreboard.standings
    let finalScoreboard = scoreboard
    if (scoreboard.phase === 'qualifier') {
      for (
        let nextRoundIndex = scoreboard.roundNumber;
        nextRoundIndex < NUMBER_TRIVIA_TOTAL_ROUNDS;
        nextRoundIndex += 1
      ) {
        const simulatedRound = resolveRound(undefined, {
          roundIndex: nextRoundIndex,
          sourceStandings: simulatedStandings,
        })
        if (!simulatedRound) break
        simulatedStandings = simulatedRound.standings
        finalScoreboard = simulatedRound
      }
    }

    let simulatedLives = finalScoreboard.lives
    let nextDuelIndex = finalScoreboard.phase === 'duel' ? (finalScoreboard.duelNumber ?? 1) : 0
    const duelSafetyLimit = Math.max(
      6,
      resolvedParticipants.length * NUMBER_TRIVIA_DUEL_STARTING_LIVES + 2
    )
    for (let step = 0; step < duelSafetyLimit && !finalScoreboard.final; step += 1) {
      const simulatedDuel = resolveDuel(undefined, {
        duelIndex: nextDuelIndex,
        sourceStandings: simulatedStandings,
        sourceLives: simulatedLives,
      })
      if (!simulatedDuel) break
      simulatedStandings = simulatedDuel.standings
      simulatedLives = simulatedDuel.lives
      finalScoreboard = simulatedDuel
      nextDuelIndex += 1
    }

    setStandings(finalScoreboard.standings)
    setDuelLives(finalScoreboard.lives)
    setPhase(finalScoreboard.phase)
    if (finalScoreboard.phase === 'duel') setDuelIndex((finalScoreboard.duelNumber ?? 1) - 1)
    else setRoundIndex(finalScoreboard.roundNumber - 1)
    setScoreboard(finalScoreboard)
  }, [resolveDuel, resolveRound, resolvedParticipants.length, scoreboard])

  const displayPhase = scoreboard?.phase ?? phase
  const currentStage = scoreboard?.final
    ? 'Champion crowned'
    : displayPhase === 'duel'
      ? `Three-life final · Duel ${duelIndex + 1}`
      : `Qualifier ${currentRoundNumber} / ${NUMBER_TRIVIA_TOTAL_ROUNDS}`
  const editAnswer = (key: string) => {
    if (!answeringOpen || scoreboard) return
    setInputError(null)
    setAnswerInput((value) =>
      key === 'delete' ? value.slice(0, -1) : key === 'clear' ? '' : (value + key).slice(0, 12)
    )
  }

  return (
    <div
      className={`number-trivia ${scoreboard ? 'number-trivia--scoreboard' : 'number-trivia--playing'}`}
      data-testid="number-trivia-root"
    >
      <div className="number-trivia__lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="number-trivia__floor" aria-hidden="true" />
      <div className="number-trivia__shell">
        <header className="number-trivia__header">
          <div>
            <p className="number-trivia__eyebrow">The Big Eye presents</p>
            <h2 className="number-trivia__title">
              NUMBER <span>TRIVIA</span>
            </h2>
          </div>
          <span className="number-trivia__on-air">
            <i /> ON AIR
          </span>
        </header>
        <section className="number-trivia__summary" aria-label="Tournament summary">
          <span className="number-trivia__stage-label">{currentStage}</span>
          <span>
            {activeStandings.length} {displayPhase === 'duel' ? 'finalists' : 'in play'}
          </span>
          <strong>
            {displayPhase === 'duel'
              ? `${duelLives[humanId] ?? 0} lives`
              : `${humanStanding?.cumulativeScore ?? 0} pts`}
          </strong>
        </section>
        <main className="number-trivia__content" ref={gameContentRef}>
          {!scoreboard && currentQuestion && (
            <section className="number-trivia__round" key={`${phase}-${currentQuestion.prompt}`}>
              <div
                className="number-trivia__contestants"
                aria-label={displayPhase === 'duel' ? 'Finalists' : 'Contestants still in play'}
              >
                {activeStandings.map((entry) => (
                  <div
                    key={entry.participantId}
                    className={`number-trivia__contestant ${entry.isHuman ? 'number-trivia__contestant--human' : ''}`}
                  >
                    <TriviaPortrait
                      name={entry.participantName}
                      avatar={
                        resolvedParticipants.find((p) => p.id === entry.participantId)?.avatar
                      }
                    />
                    <span>{entry.isHuman ? 'You' : entry.participantName}</span>
                    {displayPhase === 'duel' && (
                      <span
                        className="number-trivia__mini-lives"
                        aria-label={`${duelLives[entry.participantId]} lives`}
                      >
                        {'●'.repeat(duelLives[entry.participantId] ?? 0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="number-trivia__gameplay-card" aria-label="Gameplay panel">
                <div className="number-trivia__question-heading">
                  <p className="number-trivia__question-label">Question</p>
                  <span>
                    {displayPhase === 'duel' ? 'ONE LIFE ON THE LINE' : 'FIND THE EXACT NUMBER'}
                  </span>
                </div>
                <p className="number-trivia__question-text">{currentQuestion.prompt}</p>
                <div className="number-trivia__status" role="status" aria-live="polite">
                  {!answeringOpen ? (
                    <div className="number-trivia__reading-buffer" aria-label="Reading time">
                      <strong key={readingSeconds}>{readingSeconds}s</strong>
                      <span>
                        Read first<span>Everyone's clock is paused</span>
                      </span>
                    </div>
                  ) : (
                    <>
                      <strong className="number-trivia__hint" key={roundAttempts}>
                        {hint}
                      </strong>
                      <span>{NUMBER_TRIVIA_MAX_ATTEMPTS - roundAttempts} attempts left</span>
                    </>
                  )}
                </div>
                {humanStillActive && (
                  <div className="number-trivia__answer-console">
                    <label className="number-trivia__input-label" htmlFor="number-trivia-answer">
                      Your answer
                    </label>
                    <div className="number-trivia__answer-display">
                      <input
                        id="number-trivia-answer"
                        className="number-trivia__input"
                        type="text"
                        inputMode="none"
                        readOnly
                        autoComplete="off"
                        value={answerInput}
                        placeholder="—"
                        disabled={!answeringOpen}
                        aria-label="Answer input"
                        aria-describedby="number-trivia-input-help"
                        aria-invalid={Boolean(inputError)}
                        onKeyDown={(event) => {
                          if (/^[0-9]$/.test(event.key)) {
                            event.preventDefault()
                            editAnswer(event.key)
                          } else if (event.key === 'Backspace' || event.key === 'Delete') {
                            event.preventDefault()
                            editAnswer('delete')
                          } else if (event.key === 'Enter') {
                            event.preventDefault()
                            submitAnswer()
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            editAnswer('clear')
                          }
                        }}
                      />
                      <span className="number-trivia__display-mark" aria-hidden="true">
                        #
                      </span>
                    </div>
                    <p id="number-trivia-input-help" className="number-trivia__input-help">
                      Use the number pad below
                    </p>
                    <NumericKeypad
                      className="number-trivia__keypad"
                      onKey={editAnswer}
                      disabled={!answeringOpen}
                    />
                    <div className="number-trivia__controls">
                      <button
                        type="button"
                        className="number-trivia__button number-trivia__button--secondary"
                        onClick={skipQuestion}
                        disabled={!answeringOpen}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        className="number-trivia__button number-trivia__button--primary"
                        onClick={submitAnswer}
                        disabled={!answeringOpen || answerInput === ''}
                      >
                        Lock in answer <span aria-hidden="true">→</span>
                      </button>
                    </div>
                    {inputError && (
                      <p className="number-trivia__error" role="alert">
                        {inputError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
          {scoreboard && (
            <NumberTriviaResults
              key={`${scoreboard.phase}-${scoreboard.roundNumber}`}
              scoreboard={scoreboard}
              participants={resolvedParticipants}
              showStandings={showStandings}
              onToggleStandings={() => setShowStandings((value) => !value)}
            />
          )}
        </main>
        {scoreboard && (
          <footer className="number-trivia__footer" aria-label="Game actions">
            {!scoreboard.final && humanStanding?.eliminatedRound !== null ? (
              <div
                className="number-trivia__spectator-actions"
                role="group"
                aria-label="Eliminated player options"
              >
                <button
                  className="number-trivia__button number-trivia__button--secondary"
                  type="button"
                  onClick={continueFromScoreboard}
                >
                  Keep watching
                </button>
                <button
                  className="number-trivia__button number-trivia__button--primary"
                  type="button"
                  onClick={fastForwardToResults}
                >
                  Fast-forward to results
                </button>
              </div>
            ) : (
              <button
                className="number-trivia__button number-trivia__button--primary number-trivia__continue"
                type="button"
                onClick={continueFromScoreboard}
              >
                {scoreboard.phase === 'qualifier' &&
                scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS &&
                !scoreboard.final
                  ? 'Start three-life final'
                  : 'Continue'}{' '}
                <span aria-hidden="true">→</span>
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
