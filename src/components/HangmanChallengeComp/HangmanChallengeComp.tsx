import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import type { MinigameParticipant, ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import {
  BUDGET_CAP,
  CONSONANT_COST,
  FAILURE_PENALTY,
  HINT_COSTS,
  MAX_WRONG_GUESSES,
  ROUND_TIME_LIMIT_SECONDS,
  STARTING_BUDGET,
  SURVIVAL_BONUS,
  VOWEL_COST,
  applySurvivalBonus,
  buildDisplayTokens,
  buildEliminationPlan,
  calculateRoundScore,
  computeRevealRatio,
  getAvailableRevealPositions,
  getHintCost,
  getRevealCost,
  isLetter,
  normalizeGuess,
  normalizeWord,
  pickRevealPosition,
  pickTournamentWords,
  rankRoundResults,
  revealAllMatchingPositions,
  simulateAiRound,
  type RevealKind,
  type RoundResult,
  type RoundScoreBreakdown,
} from './hangmanChallengeEngine'
import './HangmanChallengeComp.css'
import pressureBackdropAsset from '../../assets/verdict-board-backdrop.png'
import pressureWindowAsset from '../../assets/verdict-board-window.png'
import pressureCrackAsset from '../../assets/verdict-board-cracks.png'

type Phase =
  | 'playing'
  | 'roundResult'
  | 'scoreboard'
  | 'finalPlaying'
  | 'finalResult'
  | 'eliminated'

type Panel = 'reveal' | 'hint' | 'guess' | 'history' | 'rules' | null

interface PlayerState {
  id: string
  name: string
  isHuman: boolean
  budget: number
  cumulativeScore: number
  active: boolean
}

interface RoundResolution {
  breakdown: RoundScoreBreakdown
  ranked: RoundResult[]
  eliminatedIds: string[]
  humanResult: RoundResult
}

interface FinalState {
  finalists: [string, string]
  revealedPositions: number[]
  attemptedWords: string[]
  revealCycle: number
  lockedPlayerId: string | null
  lockMode: 'reveal' | 'timed' | null
  lockedUntilMs: number | null
  forceRevealCooldownUntilMs: Record<string, number>
  usedPowers: Record<string, { forceReveal: boolean; lockOpponent: boolean }>
  eventLog: string[]
  winnerId: string | null
}

interface Props {
  onFinish?: (value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => void
  seed?: number
  participantIds?: string[]
  participants?: MinigameParticipant[]
  autoStart?: boolean
}

const FALLBACK_PARTICIPANTS: MinigameParticipant[] = [
  { id: 'you', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'warden', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'specter', name: 'Specter', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'oracle', name: 'Oracle', isHuman: false, precomputedScore: 0, previousPR: null },
]

const FINAL_REVEAL_INTERVAL_SECONDS = 5
const FINAL_FORCE_REVEAL_COST = 10
const FINAL_FORCE_REVEAL_COOLDOWN_MS = 3000
const FINAL_LOCK_COST = 15
const FINAL_LOCK_DURATION_MS = 5000
const FINAL_AI_MIN_BUZZ_DELAY_MS = 2400
const FINAL_AI_MAX_BUZZ_DELAY_MS = 4200

function initialAvatar(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return String(Math.floor(safe / 60)) + ':' + String(safe % 60).padStart(2, '0')
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededFraction(seed: number): number {
  let state = seed >>> 0
  state = Math.imul(state + 0x6d2b79f5, 1) >>> 0
  state ^= state >>> 15
  state = Math.imul(state | 1, state ^ (state >>> 7)) >>> 0
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296
}

function finalAiBuzzDelayMs(seed: number, playerId: string, revealCycle: number, skill: number): number {
  const jitter = seededFraction(seed ^ hashString('final-ai-delay-' + playerId + '-' + revealCycle))
  const skillAdjustment = Math.round((1 - skill) * 700)
  return Math.min(
    FINAL_AI_MAX_BUZZ_DELAY_MS,
    FINAL_AI_MIN_BUZZ_DELAY_MS + skillAdjustment + Math.floor(jitter * 900)
  )
}

function isFinalLockActive(state: FinalState, playerId: string): boolean {
  if (state.lockedPlayerId !== playerId) return false
  if (state.lockMode === 'timed' && state.lockedUntilMs !== null) {
    return state.lockedUntilMs > Date.now()
  }
  return true
}

function getHuman(players: PlayerState[]): PlayerState {
  return players.find((player) => player.isHuman) ?? players[0]
}

function winnerSort(a: PlayerState, b: PlayerState): number {
  if (a.cumulativeScore !== b.cumulativeScore) return b.cumulativeScore - a.cumulativeScore
  if (a.budget !== b.budget) return b.budget - a.budget
  return a.id.localeCompare(b.id)
}

export default function HangmanChallengeComp({
  onFinish,
  seed = 0,
  participantIds = [],
  participants = [],
}: Props) {
  const resolvedParticipants = useMemo<MinigameParticipant[]>(() => {
    if (participants.length > 0) return participants
    if (participantIds.length > 0) {
      return participantIds.map((id, index) => ({
        id,
        name: index === 0 ? 'You' : 'Contestant ' + (index + 1),
        isHuman: index === 0,
        precomputedScore: 0,
        previousPR: null,
      }))
    }
    return FALLBACK_PARTICIPANTS
  }, [participantIds, participants])

  const eliminationPlan = useMemo(
    () => buildEliminationPlan(resolvedParticipants.length),
    [resolvedParticipants.length]
  )
  const tournamentWords = useMemo(
    () => pickTournamentWords(seed >>> 0, eliminationPlan.length),
    [eliminationPlan.length, seed]
  )
  const [players, setPlayers] = useState<PlayerState[]>(() =>
    resolvedParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      budget: STARTING_BUDGET,
      cumulativeScore: 0,
      active: true,
    }))
  )

  const [phase, setPhase] = useState<Phase>(
    eliminationPlan.length === 0 ? 'finalPlaying' : 'playing'
  )
  const [panel, setPanel] = useState<Panel>(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [revealedPositions, setRevealedPositions] = useState<number[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [attemptedWords, setAttemptedWords] = useState<string[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [guessInput, setGuessInput] = useState('')
  const [roundResolution, setRoundResolution] = useState<RoundResolution | null>(null)
  const [lastEliminatedIds, setLastEliminatedIds] = useState<string[]>([])
  const [competitionWinnerId, setCompetitionWinnerId] = useState<string | null>(null)
  const [competitionLastPlaceId, setCompetitionLastPlaceId] = useState<string | null>(null)
  const finalRngCounter = useRef(0)

  const activePlayers = useMemo(() => players.filter((player) => player.active), [players])
  const postRoundBudgets = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.budget])),
    [players]
  )
  const human = useMemo(() => getHuman(players), [players])
  const humanState = players.find((player) => player.id === human.id) ?? human
  const currentWord = tournamentWords.qualifying[roundIndex] ?? tournamentWords.final
  const displayTokens = buildDisplayTokens(currentWord.text, revealedPositions)
  const remainingSeconds = Math.max(0, ROUND_TIME_LIMIT_SECONDS - elapsedSeconds)
  const hiddenVowels = getAvailableRevealPositions(
    currentWord.text,
    revealedPositions,
    'vowel'
  ).length
  const hiddenConsonants = getAvailableRevealPositions(
    currentWord.text,
    revealedPositions,
    'consonant'
  ).length

  const buildInitialFinalState = useCallback((sourcePlayers: PlayerState[]): FinalState => {
    const finalists = sourcePlayers
      .filter((player) => player.active)
      .sort(winnerSort)
      .slice(0, 2)
    const first = finalists[0] ?? sourcePlayers[0]
    const second = finalists[1] ?? sourcePlayers[1] ?? first
    return {
      finalists: [first.id, second.id],
      revealedPositions: [],
      attemptedWords: [],
      revealCycle: 0,
      lockedPlayerId: null,
      lockMode: null,
      lockedUntilMs: null,
      forceRevealCooldownUntilMs: {},
      usedPowers: {
        [first.id]: { forceReveal: false, lockOpponent: false },
        [second.id]: { forceReveal: false, lockOpponent: false },
      },
      eventLog: [],
      winnerId: null,
    }
  }, [])

  const [finalState, setFinalState] = useState<FinalState>(() => buildInitialFinalState(players))

  const resetRoundState = useCallback(() => {
    setPanel(null)
    setRevealedPositions([])
    setWrongGuesses(0)
    setHintsUsed(0)
    setAttemptedWords([])
    setElapsedSeconds(0)
    setGuessInput('')
    setRoundResolution(null)
  }, [])

  const simulateAiOnlyFinish = useCallback(
    (
      sourcePlayers: PlayerState[],
      nextRoundIndex: number
    ): { winnerId: string; players: PlayerState[] } => {
      let simPlayers = sourcePlayers.map((player) => ({ ...player }))
      for (let index = nextRoundIndex; index < eliminationPlan.length; index += 1) {
        const word = tournamentWords.qualifying[index]
        const live = simPlayers.filter((player) => player.active)
        const results = live.map(
          (player) =>
            simulateAiRound({
              participantId: player.id,
              participantName: player.name,
              word,
              budget: player.budget,
              cumulativeScore: player.cumulativeScore,
              seed,
              roundIndex: index,
            }).result
        )
        const ranked = rankRoundResults(results)
        const eliminateCount = eliminationPlan[index] ?? 0
        const eliminatedIds = new Set(
          ranked.slice(-eliminateCount).map((result) => result.participantId)
        )
        simPlayers = simPlayers.map((player) => {
          const result = results.find((entry) => entry.participantId === player.id)
          if (!result) return player
          const survives = !eliminatedIds.has(player.id)
          return {
            ...player,
            active: survives,
            budget: survives
              ? applySurvivalBonus(result.budgetRemaining, result.solved)
              : result.budgetRemaining,
            cumulativeScore: result.cumulativeAfter,
          }
        })
      }

      const finalists = simPlayers
        .filter((player) => player.active)
        .sort(winnerSort)
        .slice(0, 2)
      const finalWord = tournamentWords.final
      const finalResults = finalists.map(
        (player, index) =>
          simulateAiRound({
            participantId: player.id,
            participantName: player.name,
            word: finalWord,
            budget: player.budget,
            cumulativeScore: player.cumulativeScore,
            seed: seed ^ 0x73e41 ^ index,
            roundIndex: eliminationPlan.length + 1,
          }).result
      )
      const rankedFinal = rankRoundResults(finalResults)
      const winnerId = rankedFinal[0]?.participantId ?? finalists[0]?.id ?? human.id
      simPlayers = simPlayers.map((player) => {
        const result = finalResults.find((entry) => entry.participantId === player.id)
        return result
          ? { ...player, budget: result.budgetRemaining, cumulativeScore: result.cumulativeAfter }
          : player
      })
      return { winnerId, players: simPlayers }
    },
    [eliminationPlan, human.id, seed, tournamentWords]
  )

  const resolveHumanRound = useCallback(
    (solved: boolean, overrides?: { wrong?: number; elapsed?: number; revealed?: number[] }) => {
      if (phase !== 'playing') return
      const actualWrong = overrides?.wrong ?? wrongGuesses
      const actualElapsed = overrides?.elapsed ?? elapsedSeconds
      const actualRevealed = overrides?.revealed ?? revealedPositions
      const active = players.filter((player) => player.active)
      const currentHuman = active.find((player) => player.id === human.id)
      if (!currentHuman) return

      const breakdown = calculateRoundScore({
        solved,
        budgetRemaining: currentHuman.budget,
        wrongGuesses: actualWrong,
        elapsedSeconds: actualElapsed,
        parSeconds: currentWord.parSeconds,
        hintsUsed,
      })
      const humanResult: RoundResult = {
        participantId: currentHuman.id,
        participantName: currentHuman.name,
        solved,
        budgetRemaining: currentHuman.budget,
        wrongGuesses: actualWrong,
        elapsedSeconds: actualElapsed,
        hintsUsed,
        revealedRatio: computeRevealRatio(currentWord.text, actualRevealed),
        roundScore: breakdown.roundScore,
        cumulativeBefore: currentHuman.cumulativeScore,
        cumulativeAfter: currentHuman.cumulativeScore + breakdown.cumulativeDelta,
      }

      const aiResults = active
        .filter((player) => player.id !== human.id)
        .map(
          (player) =>
            simulateAiRound({
              participantId: player.id,
              participantName: player.name,
              word: currentWord,
              budget: player.budget,
              cumulativeScore: player.cumulativeScore,
              seed,
              roundIndex,
            }).result
        )
      const results = [humanResult, ...aiResults]
      const ranked = rankRoundResults(results)
      const eliminateCount = eliminationPlan[roundIndex] ?? 0
      const eliminatedIds = ranked.slice(-eliminateCount).map((result) => result.participantId)
      const eliminatedSet = new Set(eliminatedIds)
      setCompetitionLastPlaceId(
        (previous) => previous ?? ranked[ranked.length - 1]?.participantId ?? null
      )

      const nextPlayers = players.map((player) => {
        const result = results.find((entry) => entry.participantId === player.id)
        if (!result) return player
        const survives = !eliminatedSet.has(player.id)
        return {
          ...player,
          active: survives,
          budget: survives
            ? applySurvivalBonus(result.budgetRemaining, result.solved)
            : result.budgetRemaining,
          cumulativeScore: result.cumulativeAfter,
        }
      })

      setPlayers(nextPlayers)
      setRoundResolution({ breakdown, ranked, eliminatedIds, humanResult })
      setLastEliminatedIds(eliminatedIds)
      setPanel(null)

      if (eliminatedSet.has(human.id)) {
        const simulated = simulateAiOnlyFinish(nextPlayers, roundIndex + 1)
        setPlayers(simulated.players)
        setCompetitionWinnerId(simulated.winnerId)
        setPhase('eliminated')
        return
      }

      setPhase('roundResult')
    },
    [
      currentWord,
      elapsedSeconds,
      eliminationPlan,
      hintsUsed,
      human.id,
      phase,
      players,
      revealedPositions,
      roundIndex,
      seed,
      simulateAiOnlyFinish,
      wrongGuesses,
    ]
  )

  useEffect(() => {
    if (phase !== 'playing') return undefined
    const timer = window.setInterval(() => {
      setElapsedSeconds((previous) => {
        const next = previous + 1
        if (next >= ROUND_TIME_LIMIT_SECONDS) {
          window.clearInterval(timer)
          window.setTimeout(() => {
            resolveHumanRound(false, { elapsed: ROUND_TIME_LIMIT_SECONDS })
          }, 0)
        }
        return Math.min(next, ROUND_TIME_LIMIT_SECONDS)
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [panel, phase, resolveHumanRound])

  const spendForReveal = useCallback(
    (kind: RevealKind, isFinal = false) => {
      const word = isFinal ? tournamentWords.final : currentWord
      const positions = isFinal ? finalState.revealedPositions : revealedPositions
      const cost = getRevealCost(kind)
      const liveHuman = players.find((player) => player.id === human.id)
      if (!liveHuman || liveHuman.budget < cost) return

      finalRngCounter.current += 1
      const random = seededFraction(
        seed ^ hashString(word.text + '-' + kind + '-' + finalRngCounter.current)
      )
      const position = pickRevealPosition(word.text, positions, kind, random)
      if (position == null) return

      setPlayers((previous) =>
        previous.map((player) =>
          player.id === human.id ? { ...player, budget: player.budget - cost } : player
        )
      )

      if (isFinal) {
        setFinalState((previous) => ({
          ...previous,
          revealedPositions: [...previous.revealedPositions, position].sort((a, b) => a - b),
          eventLog: [...previous.eventLog, 'You revealed a ' + kind + '.'],
        }))
      } else {
        setRevealedPositions((previous) => [...previous, position].sort((a, b) => a - b))
      }
    },
    [
      currentWord,
      finalState.revealedPositions,
      human.id,
      players,
      revealedPositions,
      seed,
      tournamentWords.final,
    ]
  )

  const buyHint = useCallback(
    (isFinal = false) => {
      if (isFinal) return
      const used = hintsUsed
      const cost = getHintCost(used)
      const liveHuman = players.find((player) => player.id === human.id)
      if (cost == null || !liveHuman || liveHuman.budget < cost) return

      setPlayers((previous) =>
        previous.map((player) =>
          player.id === human.id ? { ...player, budget: player.budget - cost } : player
        )
      )

      setHintsUsed((previous) => Math.min(3, previous + 1))
    },
    [hintsUsed, human.id, players]
  )

  const submitRoundGuess = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const guess = normalizeGuess(guessInput)
      if (!guess || attemptedWords.includes(guess)) return
      setAttemptedWords((previous) => [...previous, guess])
      setGuessInput('')

      if (guess === normalizeGuess(currentWord.text)) {
        const allRevealed = revealAllMatchingPositions(currentWord.text, revealedPositions, guess)
        setRevealedPositions(allRevealed)
        resolveHumanRound(true, { revealed: allRevealed })
        return
      }

      const nextWrong = wrongGuesses + 1
      setWrongGuesses(nextWrong)
      setPanel(null)
      if (nextWrong >= MAX_WRONG_GUESSES) {
        window.setTimeout(() => resolveHumanRound(false, { wrong: nextWrong }), 520)
      }
    },
    [
      attemptedWords,
      currentWord.text,
      guessInput,
      resolveHumanRound,
      revealedPositions,
      wrongGuesses,
    ]
  )

  const proceedFromRoundResult = useCallback(() => {
    if (!roundResolution) return
    setPhase('scoreboard')
  }, [roundResolution])

  const proceedFromScoreboard = useCallback(() => {
    const surviving = players.filter((player) => player.active)
    if (surviving.length <= 2 || roundIndex >= eliminationPlan.length - 1) {
      const nextFinal = buildInitialFinalState(players)
      setFinalState(nextFinal)
      resetRoundState()
      setPhase('finalPlaying')
      return
    }
    resetRoundState()
    setRoundIndex((previous) => previous + 1)
    setPhase('playing')
  }, [buildInitialFinalState, eliminationPlan.length, players, resetRoundState, roundIndex])

  const finalWord = tournamentWords.final
  const finalDisplayTokens = buildDisplayTokens(finalWord.text, finalState.revealedPositions)
  const humanCanBuzz = phase === 'finalPlaying' && !isFinalLockActive(finalState, human.id)

  const revealNextFinalLetter = useCallback(
    (state: FinalState): FinalState => {
      const normalizedWord = normalizeGuess(finalWord.text)
      const hiddenLetters = [...new Set(normalizedWord.split('').filter((char) => /^[A-Z]$/.test(char)))]
        .filter((letter) =>
          normalizedWord
            .split('')
            .some((char, index) => char === letter && !state.revealedPositions.includes(index))
        )

      if (hiddenLetters.length === 0) {
        const keepTimedLock =
          state.lockMode === 'timed' &&
          state.lockedPlayerId !== null &&
          isFinalLockActive(state, state.lockedPlayerId)
        return {
          ...state,
          revealCycle: state.revealCycle + 1,
          lockedPlayerId: keepTimedLock ? state.lockedPlayerId : null,
          lockMode: keepTimedLock ? state.lockMode : null,
          lockedUntilMs: keepTimedLock ? state.lockedUntilMs : null,
        }
      }

      const pickIndex = Math.floor(
        seededFraction(seed ^ hashString('final-reveal-' + state.revealCycle)) * hiddenLetters.length
      )
      const letter = hiddenLetters[pickIndex]
      const matchingPositions = normalizedWord
        .split('')
        .flatMap((char, index) => (char === letter ? [index] : []))

      const keepTimedLock =
        state.lockMode === 'timed' &&
        state.lockedPlayerId !== null &&
        isFinalLockActive(state, state.lockedPlayerId)

      return {
        ...state,
        revealCycle: state.revealCycle + 1,
        revealedPositions: [...new Set([...state.revealedPositions, ...matchingPositions])].sort(
          (a, b) => a - b
        ),
        lockedPlayerId: keepTimedLock ? state.lockedPlayerId : null,
        lockMode: keepTimedLock ? state.lockMode : null,
        lockedUntilMs: keepTimedLock ? state.lockedUntilMs : null,
        eventLog: [...state.eventLog, 'The board revealed the letter ' + letter + '.'],
      }
    },
    [finalWord.text, seed]
  )

  const finishFinal = useCallback((winnerId: string) => {
    setFinalState((previous) => ({ ...previous, winnerId }))
    setCompetitionWinnerId(winnerId)
    setPhase('finalResult')
  }, [])

  const submitFinalGuess = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!humanCanBuzz) return
      const guess = normalizeGuess(guessInput)
      if (!guess || finalState.attemptedWords.includes(guess)) return
      setGuessInput('')
      setPanel(null)
      if (guess === normalizeGuess(finalWord.text)) {
        setFinalState((previous) => ({
          ...previous,
          revealedPositions: revealAllMatchingPositions(finalWord.text, previous.revealedPositions, guess),
          attemptedWords: [...previous.attemptedWords, guess],
          eventLog: [...previous.eventLog, 'You buzzed and solved the final board.'],
        }))
        finishFinal(human.id)
        return
      }

      setFinalState((previous) => ({
        ...previous,
        attemptedWords: [...previous.attemptedWords, guess],
        lockedPlayerId: human.id,
        lockMode: 'reveal',
        lockedUntilMs: null,
        eventLog: [...previous.eventLog, 'You buzzed incorrectly and are locked until the next reveal.'],
      }))
    },
    [finalState.attemptedWords, finalWord.text, finishFinal, guessInput, human.id, humanCanBuzz]
  )

  const [finalCountdown, setFinalCountdown] = useState(FINAL_REVEAL_INTERVAL_SECONDS)

  const resolveFinalTiebreaker = useCallback(() => {
    const finalists = players.filter((player) => finalState.finalists.includes(player.id))
    const winner =
      [...finalists].sort(
        (a, b) => b.budget - a.budget || b.cumulativeScore - a.cumulativeScore
      )[0] ?? players[0]
    if (!winner) return
    setFinalState((previous) => ({
      ...previous,
      winnerId: winner.id,
      eventLog: [...previous.eventLog, winner.name + ' won the wallet tiebreaker.'],
    }))
    setCompetitionWinnerId(winner.id)
    setPhase('finalResult')
  }, [finalState.finalists, players])

  const useFinalPower = useCallback(
    (power: 'forceReveal' | 'lockOpponent') => {
      if (phase !== 'finalPlaying' || !humanCanBuzz) return
      const humanPlayer = players.find((player) => player.id === human.id)
      const opponentId = finalState.finalists.find((id) => id !== human.id)
      const opponent = players.find((player) => player.id === opponentId)
      const cost = power === 'forceReveal' ? FINAL_FORCE_REVEAL_COST : FINAL_LOCK_COST
      const used = finalState.usedPowers[human.id]?.[power]
      const cooldownUntil = finalState.forceRevealCooldownUntilMs[human.id] ?? 0
      if (!humanPlayer || !opponent || (power === 'lockOpponent' && used) || humanPlayer.budget < cost) return
      if (power === 'forceReveal' && computeRevealRatio(finalWord.text, finalState.revealedPositions) >= 1) return
      if (power === 'forceReveal' && cooldownUntil > Date.now()) return

      const lockExpiresAt = Date.now() + FINAL_LOCK_DURATION_MS
      const nextForceRevealCooldown = Date.now() + FINAL_FORCE_REVEAL_COOLDOWN_MS
      setPlayers((all) =>
        all.map((player) =>
          player.id === human.id ? { ...player, budget: player.budget - cost } : player
        )
      )
      setFinalState((previous) => {
        const next = {
          ...previous,
          usedPowers: {
            ...previous.usedPowers,
            [human.id]: { ...previous.usedPowers[human.id], [power]: true },
          },
          forceRevealCooldownUntilMs:
            power === 'forceReveal'
              ? { ...previous.forceRevealCooldownUntilMs, [human.id]: nextForceRevealCooldown }
              : previous.forceRevealCooldownUntilMs,
          eventLog: [
            ...previous.eventLog,
            power === 'forceReveal'
              ? 'You forced the next letter reveal.'
              : 'You locked ' + opponent.name + ' for 5 seconds.',
          ],
        }
        return power === 'forceReveal'
          ? revealNextFinalLetter(next)
          : {
              ...next,
              lockedPlayerId: opponent.id,
              lockMode: 'timed',
              lockedUntilMs: lockExpiresAt,
            }
      })
      if (power === 'forceReveal') setFinalCountdown(FINAL_REVEAL_INTERVAL_SECONDS)
    },
    [
      finalState.finalists,
      finalState.revealedPositions,
      finalState.usedPowers,
      finalWord.text,
      human.id,
      humanCanBuzz,
      phase,
      players,
      revealNextFinalLetter,
    ]
  )

  useEffect(() => {
    if (
      phase !== 'finalPlaying' ||
      finalState.lockMode !== 'timed' ||
      finalState.lockedPlayerId === null ||
      finalState.lockedUntilMs === null
    ) {
      return undefined
    }

    const lockedPlayerId = finalState.lockedPlayerId
    const lockedUntilMs = finalState.lockedUntilMs
    const timer = window.setTimeout(() => {
      setFinalState((previous) => {
        if (
          previous.lockMode !== 'timed' ||
          previous.lockedPlayerId !== lockedPlayerId ||
          previous.lockedUntilMs !== lockedUntilMs
        ) {
          return previous
        }
        return {
          ...previous,
          lockedPlayerId: null,
          lockMode: null,
          lockedUntilMs: null,
          eventLog: [...previous.eventLog, 'The 5-second opponent lock expired.'],
        }
      })
    }, Math.max(0, lockedUntilMs - Date.now()))

    return () => window.clearTimeout(timer)
  }, [finalState.lockMode, finalState.lockedPlayerId, finalState.lockedUntilMs, phase])

  useEffect(() => {
    if (phase !== 'finalPlaying' || panel !== null) return undefined
    const timer = window.setTimeout(() => {
      if (finalCountdown <= 1) {
        if (computeRevealRatio(finalWord.text, finalState.revealedPositions) >= 1) {
          resolveFinalTiebreaker()
        } else {
          setFinalState((state) => revealNextFinalLetter(state))
        }
        setFinalCountdown(FINAL_REVEAL_INTERVAL_SECONDS)
      } else {
        setFinalCountdown((previous) => previous - 1)
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [finalCountdown, finalState.revealedPositions, finalWord.text, panel, phase, resolveFinalTiebreaker, revealNextFinalLetter])

  useEffect(() => {
    if (phase !== 'finalPlaying' || panel !== null || finalState.winnerId) return undefined
    if (finalState.revealCycle < 1) return undefined
    const ai = players.find(
      (player) => player.id !== human.id && finalState.finalists.includes(player.id)
    )
    if (!ai || isFinalLockActive(finalState, ai.id)) return undefined

    const skill = 0.45 + (hashString(ai.id) % 40) / 100
    const buzzDelay = finalAiBuzzDelayMs(seed, ai.id, finalState.revealCycle, skill)

    const timer = window.setTimeout(() => {
      const previous = finalState
      if (previous.winnerId || isFinalLockActive(previous, ai.id)) return
      const humanIsLocked = isFinalLockActive(previous, human.id)
      const aiPowerState = previous.usedPowers[ai.id] ?? { forceReveal: false, lockOpponent: false }
      const aiCanLock =
        previous.revealCycle >= 2 &&
        !humanIsLocked &&
        !aiPowerState.lockOpponent &&
        ai.budget >= FINAL_LOCK_COST
      const lockRoll = seededFraction(
        seed ^ hashString(ai.id + '-lock-' + previous.revealCycle)
      )
      if (aiCanLock && lockRoll < 0.28) {
        const lockExpiresAt = Date.now() + FINAL_LOCK_DURATION_MS
        setPlayers((all) =>
          all.map((player) =>
            player.id === ai.id
              ? { ...player, budget: player.budget - FINAL_LOCK_COST }
              : player
          )
        )
        setFinalState({
          ...previous,
          lockedPlayerId: human.id,
          lockMode: 'timed',
          lockedUntilMs: lockExpiresAt,
          usedPowers: {
            ...previous.usedPowers,
            [ai.id]: { ...aiPowerState, lockOpponent: true },
          },
          eventLog: [...previous.eventLog, ai.name + ' locked you for 5 seconds.'],
        })
        return
      }
      const revealRatioNow = computeRevealRatio(finalWord.text, previous.revealedPositions)
      const normalizedFinalWord = normalizeWord(finalWord.text)
      const revealed = new Set(previous.revealedPositions)
      const letterPositions = normalizedFinalWord
        .split('')
        .flatMap((character, index) => (isLetter(character) ? [index] : []))
      const revealedLetterCount = letterPositions.filter((index) => revealed.has(index)).length
      const minimumVisibleLetters = Math.min(
        letterPositions.length,
        Math.max(3, Math.ceil(letterPositions.length * 0.4))
      )
      if (revealedLetterCount < minimumVisibleLetters) return

      const confidence = revealRatioNow + skill * 0.24
      const buzzChance = Math.min(0.7, 0.15 + Math.max(0, confidence - 0.35) * 0.55)
      const buzzRoll = seededFraction(
        seed ^ hashString(ai.id + '-buzz-' + previous.revealCycle + '-' + previous.attemptedWords.length)
      )
      if (buzzRoll >= buzzChance) return

      const solveRoll = seededFraction(
        seed ^ hashString(ai.id + '-solve-' + previous.revealCycle + '-' + previous.attemptedWords.length)
      )
      const correct = solveRoll < Math.min(0.86, 0.28 + confidence * 0.58)
      if (correct) {
        setFinalState({
          ...previous,
          revealedPositions: revealAllMatchingPositions(finalWord.text, previous.revealedPositions, finalWord.text),
          eventLog: [...previous.eventLog, ai.name + ' buzzed and solved the final board.'],
          winnerId: ai.id,
        })
        setCompetitionWinnerId(ai.id)
        setPhase('finalResult')
        return
      }

      setFinalState({
        ...previous,
        lockedPlayerId: ai.id,
        lockMode: 'reveal',
        lockedUntilMs: null,
        attemptedWords: [...previous.attemptedWords, '[AI wrong buzz]'],
        eventLog: [...previous.eventLog, ai.name + ' buzzed incorrectly and is locked until the next reveal.'],
      })
    }, buzzDelay)

    return () => window.clearTimeout(timer)
  }, [finalState, finalWord, human.id, panel, phase, players, seed])

  const finalHuman = players.find((player) => player.id === human.id) ?? humanState
  const finalOpponent = players.find((player) =>
    finalState.finalists.includes(player.id) && player.id !== human.id
  )
  const currentBudget = phase === 'finalPlaying' ? finalHuman.budget : humanState.budget
  const currentWrong = wrongGuesses
  const crackRatio = Math.min(1, currentWrong / MAX_WRONG_GUESSES)
  const activeWord = phase === 'finalPlaying' ? finalWord : currentWord
  const activeTokens = phase === 'finalPlaying' ? finalDisplayTokens : displayTokens
  const activeHintsUsed = hintsUsed
  const activeHiddenVowels = hiddenVowels
  const activeHiddenConsonants = hiddenConsonants

  const finishToHost = useCallback(() => {
    if (!onFinish || !competitionWinnerId) return
    const rawResults = Object.fromEntries(
      players.map((player) => [player.id, player.cumulativeScore])
    )
    const authoritativeLastPlaceId =
      competitionLastPlaceId ??
      finalState.finalists.find((id) => id !== competitionWinnerId) ??
      [...players].sort(winnerSort).at(-1)?.id ??
      null
    onFinish(rawResults[human.id] ?? 0, undefined, {
      authoritativeWinnerId: competitionWinnerId,
      authoritativeLastPlaceId,
      rawValue: rawResults[human.id] ?? 0,
      rawResults,
    })
  }, [
    competitionLastPlaceId,
    competitionWinnerId,
    finalState.finalists,
    human.id,
    onFinish,
    players,
  ])

  const boardStyle = {
    '--pressure-backdrop-image': 'url(' + pressureBackdropAsset + ')',
    '--pressure-window-image': 'url(' + pressureWindowAsset + ')',
    '--pressure-crack-image': 'url(' + pressureCrackAsset + ')',
    '--crack-opacity': String(Math.max(0, crackRatio * 0.95)),
  } as CSSProperties

  const renderWord = (tokens: string[]) => (
    <div className="verdict-v2__word" aria-label="Solution board">
      {tokens.map((token, index) =>
        token === ' ' ? (
          <span key={'space-' + index} className="verdict-v2__space" aria-hidden="true" />
        ) : (
          <span
            key={index}
            className={'verdict-v2__tile' + (token === '•' ? ' is-hidden' : ' is-revealed')}
          >
            {token}
          </span>
        )
      )}
    </div>
  )

  const isFinal = phase === 'finalPlaying'
  const canAct = !isFinal || humanCanBuzz
  const humanIsFinalLocked = isFinal && isFinalLockActive(finalState, human.id)
  const forceRevealCooldownUntil = finalState.forceRevealCooldownUntilMs[human.id] ?? 0
  const forceRevealOnCooldown = forceRevealCooldownUntil > Date.now()
  const forceRevealCooldownSeconds = forceRevealOnCooldown
    ? Math.ceil((forceRevealCooldownUntil - Date.now()) / 1000)
    : 0

  return (
    <section className="verdict-v2" style={boardStyle}>
      <div className="verdict-v2__ambient" aria-hidden="true" />

      <header className="verdict-v2__hud">
        <div>
          <p className="verdict-v2__eyebrow">Verdict Board</p>
          <strong>
            {isFinal ? 'FINAL DUEL' : 'ROUND ' + (roundIndex + 1) + ' / ' + eliminationPlan.length}
          </strong>
        </div>
        <div className="verdict-v2__hud-stats">
          <span>
            <small>◉</small>
            <b>{currentBudget}</b>
          </span>
          {isFinal ? (
            <>
              <span>
                <small>OPPONENT</small>
                <b>{finalOpponent?.budget ?? 0}</b>
              </span>
              <span>
                <small>REVEAL IN</small>
                <b>{finalCountdown}s</b>
              </span>
            </>
          ) : (
            <span>
              <small>WINDOW</small>
              <b>{currentWrong + '/' + MAX_WRONG_GUESSES}</b>
            </span>
          )}
          {!isFinal && (
            <span>
              <small>TIME</small>
              <b>{formatTime(remainingSeconds)}</b>
            </span>
          )}
        </div>
      </header>

      <main className="verdict-v2__stage">
        <div
          className={
            'verdict-v2__window' +
            (!isFinal && currentWrong >= MAX_WRONG_GUESSES ? ' is-shattered' : '')
          }
        >
          <div className="verdict-v2__window-image" aria-hidden="true" />
          <div className="verdict-v2__cracks" aria-hidden="true" />
          <div className="verdict-v2__board-copy">
            <div className="verdict-v2__round-meta">
              <span>{activeWord.category}</span>
              <span>
                {isFinal
                  ? isFinalLockActive(finalState, human.id)
                    ? finalState.lockMode === 'timed'
                      ? 'You are locked for 5 seconds'
                      : 'You are locked until the next reveal'
                    : finalOpponent && isFinalLockActive(finalState, finalOpponent.id)
                      ? finalState.lockMode === 'timed'
                        ? finalOpponent.name + ' is locked for 5 seconds · race is live'
                        : finalOpponent.name + ' is locked until the next reveal · race is live'
                      : 'Race is live · first correct buzz wins'
                  : activePlayers.length +
                    ' remain · ' +
                    (eliminationPlan[roundIndex] ?? 0) +
                    ' out'}
              </span>
            </div>
            {renderWord(activeTokens)}
            {!isFinal && (
              <div className="verdict-v2__attempt-dots" aria-label="Window integrity">
                {Array.from({ length: MAX_WRONG_GUESSES }, (_, index) => (
                  <i key={index} className={index < currentWrong ? 'is-broken' : ''} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="verdict-v2__microbar">
          <button type="button" onClick={() => setPanel('history')}>
            History
            <b>{isFinal ? finalState.eventLog.length : attemptedWords.length}</b>
          </button>
          {!isFinal && (
            <button
              type="button"
              aria-label="View hints and hint costs"
              onClick={() => setPanel('hint')}
            >
              Hints
              <b>{activeHintsUsed}/3</b>
            </button>
          )}
          <button type="button" onClick={() => setPanel('rules')}>
            Rules
          </button>
        </div>
      </main>

      <footer className="verdict-v2__actions">
        {!isFinal ? (
          <>
            <button type="button" disabled={!canAct} onClick={() => setPanel('reveal')}>
              <span>REVEAL</span>
              <small>4–6 ◉</small>
            </button>
            <button type="button" disabled={!canAct} onClick={() => setPanel('hint')}>
              <span>HINT</span>
              <small>{activeHintsUsed < 3 ? String(HINT_COSTS[activeHintsUsed]) + ' ◉' : 'VIEW'}</small>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="is-primary"
              disabled={!canAct}
              onClick={() => setPanel('guess')}
            >
              <span>{humanIsFinalLocked ? '🔒 BUZZ' : 'BUZZ'}</span>
              <small>
                {humanCanBuzz
                  ? 'BUZZ IS LIVE'
                  : finalState.lockMode === 'timed'
                    ? 'LOCKED FOR 5s'
                    : 'LOCKED UNTIL REVEAL'}
              </small>
            </button>
            <button
              type="button"
              disabled={!canAct || forceRevealOnCooldown || currentBudget < FINAL_FORCE_REVEAL_COST || computeRevealRatio(finalWord.text, finalState.revealedPositions) >= 1}
              onClick={() => useFinalPower('forceReveal')}
            >
              <span>REVEAL NOW</span>
              <small>{forceRevealOnCooldown ? forceRevealCooldownSeconds + 's cooldown' : FINAL_FORCE_REVEAL_COST + ' ◉'}</small>
            </button>
            <button
              type="button"
              disabled={!canAct || finalState.usedPowers[human.id]?.lockOpponent || currentBudget < FINAL_LOCK_COST}
              onClick={() => useFinalPower('lockOpponent')}
            >
              <span>LOCK OPP</span>
              <small>{FINAL_LOCK_COST} ◉</small>
            </button>
          </>
        )}
        {!isFinal && <button
          type="button"
          className="is-primary"
          disabled={!canAct}
          onClick={() => setPanel('guess')}
        >
          <span>GUESS WORD</span>
          <small>{MAX_WRONG_GUESSES - currentWrong + ' chances'}</small>
        </button>
        }
      </footer>

      {panel === 'reveal' && (
        <div className="verdict-v2__modal" role="dialog" aria-label="Reveal a letter">
          <div className="verdict-v2__sheet">
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Buy information</p>
                <h3>Reveal one hidden tile</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close reveal menu">
                ×
              </button>
            </div>
            <p className="verdict-v2__sheet-copy">
              One purchase reveals one random hidden position of that type. Your ten full-word
              attempts are not affected.
            </p>
            <div className="verdict-v2__purchase-grid">
              <button
                type="button"
                disabled={activeHiddenVowels === 0 || currentBudget < VOWEL_COST || !canAct}
                onClick={() => {
                  spendForReveal('vowel', isFinal)
                  setPanel(null)
                }}
              >
                <strong>VOWEL</strong>
                <span>{VOWEL_COST} ◉</span>
                <small>{activeHiddenVowels} hidden</small>
              </button>
              <button
                type="button"
                disabled={activeHiddenConsonants === 0 || currentBudget < CONSONANT_COST || !canAct}
                onClick={() => {
                  spendForReveal('consonant', isFinal)
                  setPanel(null)
                }}
              >
                <strong>CONSONANT</strong>
                <span>{CONSONANT_COST} ◉</span>
                <small>{activeHiddenConsonants} hidden</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'hint' && (
        <div className="verdict-v2__modal" role="dialog" aria-label="Hints">
          <div className="verdict-v2__sheet">
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Progressive intel</p>
                <h3>Hints</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close hints">
                ×
              </button>
            </div>
            <div className="verdict-v2__hint-list">
              {activeWord.hints.map((hint, index) => {
                const purchased = index < activeHintsUsed
                const next = index === activeHintsUsed
                return (
                  <div key={hint} className={'verdict-v2__hint' + (purchased ? ' is-open' : '')}>
                    <div>
                      <b>HINT {index + 1}</b>
                      <span>{HINT_COSTS[index]} ◉</span>
                    </div>
                    <p>
                      {purchased
                        ? hint
                        : next
                          ? 'Ready to reveal.'
                          : 'Unlock the previous hint first.'}
                    </p>
                    {next && activeHintsUsed < 3 && (
                      <button
                        type="button"
                        disabled={currentBudget < HINT_COSTS[index] || !canAct}
                        onClick={() => buyHint(isFinal)}
                      >
                        Reveal hint
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {panel === 'guess' && (
        <div className="verdict-v2__modal" role="dialog" aria-label="Guess the word">
          <form
            className="verdict-v2__sheet verdict-v2__guess-sheet"
            onSubmit={isFinal ? submitFinalGuess : submitRoundGuess}
          >
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Commit your read</p>
                <h3>Guess the full word or phrase</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close word guess">
                ×
              </button>
            </div>
            <input
              autoFocus
              value={guessInput}
              onChange={(event) => setGuessInput(event.target.value)}
              placeholder="Type your answer"
              aria-label="Full word guess"
            />
            <p className="verdict-v2__sheet-copy">
              {isFinal
                ? 'Both finalists can buzz as the shared board reveals. A correct guess wins; a wrong buzz locks that player until the next reveal.'
                : 'A wrong full-word guess passes the turn. Duplicate guesses are blocked.'}
            </p>
            <button
              type="submit"
              className="verdict-v2__submit"
              disabled={
                !normalizeGuess(guessInput) ||
                (isFinal ? finalState.attemptedWords : attemptedWords).includes(
                  normalizeGuess(guessInput)
                )
              }
            >
              LOCK VERDICT
            </button>
          </form>
        </div>
      )}

      {panel === 'history' && (
        <div className="verdict-v2__modal" role="dialog" aria-label="Attempt history">
          <div className="verdict-v2__sheet">
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Session log</p>
                <h3>History</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close history">
                ×
              </button>
            </div>
            <div className="verdict-v2__history">
              {(isFinal ? finalState.eventLog : attemptedWords).length === 0 ? (
                <p>No attempts yet.</p>
              ) : isFinal ? (
                [...finalState.eventLog].reverse().map((entry, index) => <p key={index}>{entry}</p>)
              ) : (
                [...attemptedWords].reverse().map((entry) => <p key={entry}>{entry}</p>)
              )}
            </div>
          </div>
        </div>
      )}

      {panel === 'rules' && (
        <div className="verdict-v2__modal" role="dialog" aria-label="Verdict Board rules">
          <div className="verdict-v2__sheet">
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Verdict Board V2</p>
                <h3>Rules</h3>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close rules">
                ×
              </button>
            </div>
            <ul className="verdict-v2__rules">
              {isFinal ? (
                <>
                  <li>A new letter reveals every {FINAL_REVEAL_INTERVAL_SECONDS} seconds.</li>
                  <li>Both finalists can buzz; the first correct guess wins the shared board.</li>
                  <li>A wrong buzz locks that player until the next reveal.</li>
                  <li>Spend {FINAL_FORCE_REVEAL_COST} Eyeoleans to force a reveal every 3 seconds, or {FINAL_LOCK_COST} to lock your opponent for 5 seconds.</li>
                  <li>Remaining Eyeoleans decide the tiebreaker if nobody solves the board.</li>
                </>
              ) : (
                <>
                  <li>You begin with {STARTING_BUDGET} Eyeoleans and keep your wallet between rounds.</li>
                  <li>Reveal one vowel position for {VOWEL_COST} or one consonant position for {CONSONANT_COST}.</li>
                  <li>Hints cost {HINT_COSTS.join(' / ')} Eyeoleans and remain re-accessible.</li>
                  <li>You have {MAX_WRONG_GUESSES} wrong full-word attempts before the window shatters.</li>
                  <li>Successful survivors receive +{SURVIVAL_BONUS} Eyeoleans, capped at {BUDGET_CAP}.</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      {phase === 'roundResult' && roundResolution && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Round breakdown">
          <div className="verdict-v2__result-card">
            <p className="verdict-v2__eyebrow">
              {roundResolution.humanResult.solved ? 'BOARD CLEARED' : 'WINDOW BREACHED'}
            </p>
            <h2>{roundResolution.breakdown.roundScore} points</h2>
            <div className="verdict-v2__breakdown">
              <span>
                <b>Wallet</b>
                <em>+{roundResolution.breakdown.budgetScore}</em>
              </span>
              {roundResolution.breakdown.bonuses.map((bonus) => (
                <span key={bonus.label}>
                  <b>{bonus.label}</b>
                  <em>+{bonus.value}</em>
                </span>
              ))}
              {roundResolution.breakdown.pressurePenalty !== 0 && (
                <span>
                  <b>Pressure</b>
                  <em>{roundResolution.breakdown.pressurePenalty}</em>
                </span>
              )}
              {!roundResolution.humanResult.solved && (
                <span className="is-danger">
                  <b>Failure penalty</b>
                  <em>{FAILURE_PENALTY}</em>
                </span>
              )}
            </div>
            <p>
              {roundResolution.humanResult.solved
                ? '+' + SURVIVAL_BONUS + ' Eyeoleans if you survive the cut.'
                : 'Wallet retained. No survival refill.'}
            </p>
            <button type="button" onClick={proceedFromRoundResult}>
              Continue to scoreboard
            </button>
          </div>
        </div>
      )}

      {phase === 'scoreboard' && roundResolution && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Round scoreboard">
          <div className="verdict-v2__score-card">
            <div className="verdict-v2__sheet-head">
              <div>
                <p className="verdict-v2__eyebrow">Round {roundIndex + 1}</p>
                <h3>{lastEliminatedIds.length} eliminated</h3>
              </div>
            </div>
            <div className="verdict-v2__score-list">
              {roundResolution.ranked.map((entry, index) => (
                <div
                  key={entry.participantId}
                  className={
                    'verdict-v2__score-row' +
                    (lastEliminatedIds.includes(entry.participantId) ? ' is-out' : '')
                  }
                >
                  <span>{index + 1}</span>
                  <i>{initialAvatar(entry.participantName)}</i>
                  <b>{entry.participantName}</b>
                  <small>{entry.solved ? entry.roundScore + ' pts' : 'FAILED'}</small>
                  <em>◉ {postRoundBudgets[entry.participantId] ?? entry.budgetRemaining}</em>
                </div>
              ))}
            </div>
            <button type="button" onClick={proceedFromScoreboard}>
              Continue
            </button>
          </div>
        </div>
      )}

      {phase === 'finalResult' && competitionWinnerId && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Final results">
          <div className="verdict-v2__result-card is-final">
            <p className="verdict-v2__eyebrow">Final verdict</p>
            <h2>{players.find((player) => player.id === competitionWinnerId)?.name ?? 'Winner'}</h2>
            <p>solved the decisive board and wins Verdict Board.</p>
            <button type="button" onClick={finishToHost}>
              Finish competition
            </button>
          </div>
        </div>
      )}

      {phase === 'eliminated' && competitionWinnerId && (
        <div
          className="verdict-v2__overlay"
          role="dialog"
          aria-label="Eliminated from Verdict Board"
        >
          <div className="verdict-v2__result-card">
            <p className="verdict-v2__eyebrow">Eliminated</p>
            <h2>Your verdict is final.</h2>
            <p>
              The remaining tournament was resolved under the same wallet and scoring rules.
              {players.find((player) => player.id === competitionWinnerId)?.name ??
                'A contestant'}{' '}
              won.
            </p>
            <button type="button" onClick={finishToHost}>
              Continue
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
