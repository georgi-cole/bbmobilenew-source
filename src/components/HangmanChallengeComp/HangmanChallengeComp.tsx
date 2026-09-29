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
  normalizeGuess,
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
  | 'finalChoice'
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
  chooserId: string
  starterId: string | null
  turnId: string | null
  revealedPositions: number[]
  hintsUsed: number
  wrongGuesses: number
  attemptedWords: string[]
  eventLog: string[]
  emergency: boolean
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

  const [phase, setPhase] = useState<Phase>(eliminationPlan.length === 0 ? 'finalChoice' : 'playing')
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
  const finalRngCounter = useRef(0)

  const activePlayers = useMemo(() => players.filter((player) => player.active), [players])
  const human = useMemo(() => getHuman(players), [players])
  const humanState = players.find((player) => player.id === human.id) ?? human
  const currentWord = tournamentWords.qualifying[roundIndex] ?? tournamentWords.final
  const displayTokens = buildDisplayTokens(currentWord.text, revealedPositions)
  const revealRatio = computeRevealRatio(currentWord.text, revealedPositions)
  const remainingSeconds = Math.max(0, ROUND_TIME_LIMIT_SECONDS - elapsedSeconds)
  const hiddenVowels = getAvailableRevealPositions(currentWord.text, revealedPositions, 'vowel').length
  const hiddenConsonants = getAvailableRevealPositions(
    currentWord.text,
    revealedPositions,
    'consonant'
  ).length

  const buildInitialFinalState = useCallback(
    (sourcePlayers: PlayerState[]): FinalState => {
      const finalists = sourcePlayers.filter((player) => player.active).sort(winnerSort).slice(0, 2)
      const first = finalists[0] ?? sourcePlayers[0]
      const second = finalists[1] ?? sourcePlayers[1] ?? first
      return {
        finalists: [first.id, second.id],
        chooserId: first.id,
        starterId: null,
        turnId: null,
        revealedPositions: [],
        hintsUsed: 0,
        wrongGuesses: 0,
        attemptedWords: [],
        eventLog: [],
        emergency: false,
        winnerId: null,
      }
    },
    []
  )

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
    (sourcePlayers: PlayerState[], nextRoundIndex: number): { winnerId: string; players: PlayerState[] } => {
      let simPlayers = sourcePlayers.map((player) => ({ ...player }))
      for (let index = nextRoundIndex; index < eliminationPlan.length; index += 1) {
        const word = tournamentWords.qualifying[index]
        const live = simPlayers.filter((player) => player.active)
        const results = live.map((player) =>
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
        const eliminatedIds = new Set(ranked.slice(-eliminateCount).map((result) => result.participantId))
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

      const finalists = simPlayers.filter((player) => player.active).sort(winnerSort).slice(0, 2)
      const finalWord = tournamentWords.final
      const finalResults = finalists.map((player, index) =>
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
        return result ? { ...player, budget: result.budgetRemaining, cumulativeScore: result.cumulativeAfter } : player
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
        .map((player) =>
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
  }, [phase, resolveHumanRound])

  const spendForReveal = useCallback(
    (kind: RevealKind, isFinal = false) => {
      const word = isFinal ? tournamentWords.final : currentWord
      const positions = isFinal ? finalState.revealedPositions : revealedPositions
      const cost = getRevealCost(kind)
      const liveHuman = players.find((player) => player.id === human.id)
      if (!liveHuman || liveHuman.budget < cost) return

      finalRngCounter.current += 1
      const random = seededFraction(seed ^ hashString(word.text + '-' + kind + '-' + finalRngCounter.current))
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
    [currentWord, finalState.revealedPositions, human.id, players, revealedPositions, seed, tournamentWords.final]
  )

  const buyHint = useCallback(
    (isFinal = false) => {
      const used = isFinal ? finalState.hintsUsed : hintsUsed
      const cost = getHintCost(used)
      const liveHuman = players.find((player) => player.id === human.id)
      if (cost == null || !liveHuman || liveHuman.budget < cost) return

      setPlayers((previous) =>
        previous.map((player) =>
          player.id === human.id ? { ...player, budget: player.budget - cost } : player
        )
      )

      if (isFinal) {
        const other = finalState.finalists.find((id) => id !== human.id) ?? human.id
        setFinalState((previous) => ({
          ...previous,
          hintsUsed: previous.hintsUsed + 1,
          turnId: other,
          eventLog: [...previous.eventLog, 'You bought Hint ' + (previous.hintsUsed + 1) + '. Turn passed.'],
        }))
        setPanel(null)
      } else {
        setHintsUsed((previous) => Math.min(3, previous + 1))
      }
    },
    [finalState.finalists, finalState.hintsUsed, hintsUsed, human.id, players]
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
      setPhase('finalChoice')
      return
    }
    resetRoundState()
    setRoundIndex((previous) => previous + 1)
    setPhase('playing')
  }, [
    buildInitialFinalState,
    eliminationPlan.length,
    players,
    resetRoundState,
    roundIndex,
  ])

  const chooseFinalOrder = useCallback(
    (humanStarts: boolean) => {
      const finalists = finalState.finalists
      const other = finalists.find((id) => id !== human.id) ?? finalists[0]
      const starterId = humanStarts ? human.id : other
      setFinalState((previous) => ({
        ...previous,
        starterId,
        turnId: starterId,
        eventLog: [
          ...previous.eventLog,
          (humanStarts ? 'You chose to start.' : 'You chose to play second.'),
        ],
      }))
      setPhase('finalPlaying')
    },
    [finalState.finalists, human.id]
  )

  useEffect(() => {
    if (phase !== 'finalChoice') return
    const active = players.filter((player) => player.active).sort(winnerSort).slice(0, 2)
    if (active.length < 2) return
    const chooser = active[0]
    const other = active[1]
    setFinalState((previous) => ({
      ...previous,
      finalists: [chooser.id, other.id],
      chooserId: chooser.id,
    }))
    if (chooser.id !== human.id) {
      const aiStarts = chooser.budget >= other.budget
      const starterId = aiStarts ? chooser.id : other.id
      const timer = window.setTimeout(() => {
        setFinalState((previous) => ({
          ...previous,
          starterId,
          turnId: starterId,
          eventLog: [
            ...previous.eventLog,
            chooser.name + (aiStarts ? ' chose to start.' : ' chose to play second.'),
          ],
        }))
        setPhase('finalPlaying')
      }, 700)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [human.id, phase, players])

  const finalWord = tournamentWords.final
  const finalDisplayTokens = buildDisplayTokens(finalWord.text, finalState.revealedPositions)
  const finalRevealRatio = computeRevealRatio(finalWord.text, finalState.revealedPositions)
  const finalTurnPlayer = players.find((player) => player.id === finalState.turnId)
  const humanFinalTurn = phase === 'finalPlaying' && finalState.turnId === human.id

  const revealEmergencyTile = useCallback(
    (state: FinalState): FinalState => {
      if (!state.emergency) return state
      const hidden = normalizeGuess(finalWord.text)
        .split('')
        .map((char, index) => ({ char, index }))
        .filter(({ char, index }) => char !== ' ' && !state.revealedPositions.includes(index))
      if (hidden.length === 0) return state
      finalRngCounter.current += 1
      const pick = hidden[
        Math.floor(
          seededFraction(seed ^ 0x9183 ^ finalRngCounter.current) * hidden.length
        )
      ]
      return {
        ...state,
        revealedPositions: [...state.revealedPositions, pick.index].sort((a, b) => a - b),
        eventLog: [...state.eventLog, 'Emergency Verdict exposed one tile.'],
      }
    },
    [finalWord.text, seed]
  )

  const switchFinalTurn = useCallback(
    (state: FinalState): FinalState => {
      const next = state.finalists.find((id) => id !== state.turnId) ?? state.finalists[0]
      return revealEmergencyTile({ ...state, turnId: next })
    },
    [revealEmergencyTile]
  )

  const finishFinal = useCallback(
    (winnerId: string) => {
      setFinalState((previous) => ({ ...previous, winnerId }))
      setCompetitionWinnerId(winnerId)
      setPhase('finalResult')
    },
    []
  )

  const submitFinalGuess = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!humanFinalTurn) return
      const guess = normalizeGuess(guessInput)
      if (!guess || finalState.attemptedWords.includes(guess)) return
      setGuessInput('')
      setPanel(null)
      if (guess === normalizeGuess(finalWord.text)) {
        setFinalState((previous) => ({
          ...previous,
          revealedPositions: revealAllMatchingPositions(finalWord.text, previous.revealedPositions, guess),
          attemptedWords: [...previous.attemptedWords, guess],
          eventLog: [...previous.eventLog, 'You solved the final board.'],
        }))
        finishFinal(human.id)
        return
      }

      setFinalState((previous) => {
        const nextWrong = previous.wrongGuesses + 1
        const next = {
          ...previous,
          wrongGuesses: nextWrong,
          attemptedWords: [...previous.attemptedWords, guess],
          emergency: previous.emergency || nextWrong >= MAX_WRONG_GUESSES,
          eventLog: [
            ...previous.eventLog,
            nextWrong >= MAX_WRONG_GUESSES && !previous.emergency
              ? 'The window shattered. Emergency Verdict activated.'
              : 'Your full-word guess was wrong.',
          ],
        }
        return switchFinalTurn(next)
      })
    },
    [
      finalState.attemptedWords,
      finalWord.text,
      finishFinal,
      guessInput,
      human.id,
      humanFinalTurn,
      switchFinalTurn,
    ]
  )

  useEffect(() => {
    if (phase !== 'finalPlaying' || !finalTurnPlayer || finalTurnPlayer.isHuman) return undefined
    const timer = window.setTimeout(() => {
      setFinalState((previous) => {
        if (previous.turnId !== finalTurnPlayer.id || previous.winnerId) return previous
        const currentPlayer = players.find((player) => player.id === finalTurnPlayer.id)
        if (!currentPlayer) return previous
        const revealRatioNow = computeRevealRatio(finalWord.text, previous.revealedPositions)
        const skill = 0.45 + (hashString(finalTurnPlayer.id) % 40) / 100
        const confidence =
          revealRatioNow + previous.hintsUsed * 0.08 + skill * 0.24 + (previous.emergency ? 0.2 : 0)
        const random = seededFraction(
          seed ^ hashString(finalTurnPlayer.id + '-' + previous.revealedPositions.length + '-' + previous.wrongGuesses)
        )

        if (confidence >= 0.9 || currentPlayer.budget < VOWEL_COST || previous.emergency) {
          const correct = random < Math.min(0.96, 0.34 + confidence * 0.62)
          if (correct) {
            window.setTimeout(() => finishFinal(finalTurnPlayer.id), 0)
            return {
              ...previous,
              revealedPositions: revealAllMatchingPositions(
                finalWord.text,
                previous.revealedPositions,
                finalWord.text
              ),
              eventLog: [...previous.eventLog, finalTurnPlayer.name + ' solved the final board.'],
              winnerId: finalTurnPlayer.id,
            }
          }
          const nextWrong = previous.wrongGuesses + 1
          return switchFinalTurn({
            ...previous,
            wrongGuesses: nextWrong,
            emergency: previous.emergency || nextWrong >= MAX_WRONG_GUESSES,
            eventLog: [
              ...previous.eventLog,
              nextWrong >= MAX_WRONG_GUESSES && !previous.emergency
                ? finalTurnPlayer.name + ' broke the window. Emergency Verdict activated.'
                : finalTurnPlayer.name + ' guessed the word incorrectly.',
            ],
          })
        }

        const hintCost = getHintCost(previous.hintsUsed)
        if (
          hintCost != null &&
          currentPlayer.budget >= hintCost &&
          finalWord.difficulty >= 4 &&
          random < 0.18
        ) {
          setPlayers((all) =>
            all.map((player) =>
              player.id === currentPlayer.id
                ? { ...player, budget: player.budget - hintCost }
                : player
            )
          )
          return switchFinalTurn({
            ...previous,
            hintsUsed: previous.hintsUsed + 1,
            eventLog: [...previous.eventLog, finalTurnPlayer.name + ' bought a hint.'],
          })
        }

        const vowelOptions = getAvailableRevealPositions(finalWord.text, previous.revealedPositions, 'vowel')
        const consonantOptions = getAvailableRevealPositions(
          finalWord.text,
          previous.revealedPositions,
          'consonant'
        )
        let kind: RevealKind = random < 0.44 ? 'vowel' : 'consonant'
        if (
          (kind === 'vowel' && (vowelOptions.length === 0 || currentPlayer.budget < VOWEL_COST)) ||
          (kind === 'consonant' &&
            (consonantOptions.length === 0 || currentPlayer.budget < CONSONANT_COST))
        ) {
          kind = kind === 'vowel' ? 'consonant' : 'vowel'
        }
        const cost = getRevealCost(kind)
        const position = pickRevealPosition(
          finalWord.text,
          previous.revealedPositions,
          kind,
          seededFraction(seed ^ finalRngCounter.current++ ^ hashString(finalTurnPlayer.id))
        )
        if (position == null || currentPlayer.budget < cost) {
          return switchFinalTurn(previous)
        }
        setPlayers((all) =>
          all.map((player) =>
            player.id === currentPlayer.id ? { ...player, budget: player.budget - cost } : player
          )
        )
        return {
          ...previous,
          revealedPositions: [...previous.revealedPositions, position].sort((a, b) => a - b),
          eventLog: [...previous.eventLog, finalTurnPlayer.name + ' revealed a ' + kind + '.'],
        }
      })
    }, 720)
    return () => window.clearTimeout(timer)
  }, [
    finalTurnPlayer,
    finalWord,
    finishFinal,
    phase,
    players,
    seed,
    switchFinalTurn,
  ])

  const finalHuman = players.find((player) => player.id === human.id) ?? humanState
  const currentBudget = phase === 'finalPlaying' ? finalHuman.budget : humanState.budget
  const currentWrong = phase === 'finalPlaying' ? finalState.wrongGuesses : wrongGuesses
  const crackRatio = Math.min(1, currentWrong / MAX_WRONG_GUESSES)
  const activeWord = phase === 'finalPlaying' ? finalWord : currentWord
  const activeTokens = phase === 'finalPlaying' ? finalDisplayTokens : displayTokens
  const activeHintsUsed = phase === 'finalPlaying' ? finalState.hintsUsed : hintsUsed
  const activeHiddenVowels =
    phase === 'finalPlaying'
      ? getAvailableRevealPositions(finalWord.text, finalState.revealedPositions, 'vowel').length
      : hiddenVowels
  const activeHiddenConsonants =
    phase === 'finalPlaying'
      ? getAvailableRevealPositions(finalWord.text, finalState.revealedPositions, 'consonant').length
      : hiddenConsonants

  const finishToHost = useCallback(() => {
    if (!onFinish || !competitionWinnerId) return
    const rawResults = Object.fromEntries(players.map((player) => [player.id, player.cumulativeScore]))
    onFinish(rawResults[human.id] ?? 0, undefined, {
      authoritativeWinnerId: competitionWinnerId,
      rawValue: rawResults[human.id] ?? 0,
      rawResults,
    })
  }, [competitionWinnerId, human.id, onFinish, players])

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
  const canAct = !isFinal || humanFinalTurn

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
          <span>
            <small>WINDOW</small>
            <b>{currentWrong}/{MAX_WRONG_GUESSES}</b>
          </span>
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
            (currentWrong >= MAX_WRONG_GUESSES ? ' is-shattered' : '') +
            (finalState.emergency && isFinal ? ' is-emergency' : '')
          }
        >
          <div className="verdict-v2__window-image" aria-hidden="true" />
          <div className="verdict-v2__cracks" aria-hidden="true" />
          <div className="verdict-v2__board-copy">
            <div className="verdict-v2__round-meta">
              <span>{activeWord.category}</span>
              <span>
                {isFinal
                  ? finalState.emergency
                    ? 'EMERGENCY VERDICT'
                    : finalTurnPlayer?.name + '\'s turn'
                  : activePlayers.length + ' remain · ' + (eliminationPlan[roundIndex] ?? 0) + ' out'}
              </span>
            </div>
            {renderWord(activeTokens)}
            <div className="verdict-v2__attempt-dots" aria-label="Window integrity">
              {Array.from({ length: MAX_WRONG_GUESSES }, (_, index) => (
                <i key={index} className={index < currentWrong ? 'is-broken' : ''} />
              ))}
            </div>
          </div>
        </div>

        <div className="verdict-v2__microbar">
          <button type="button" onClick={() => setPanel('history')}>
            History
            <b>{isFinal ? finalState.eventLog.length : attemptedWords.length}</b>
          </button>
          <button type="button" onClick={() => setPanel('hint')}>
            Hints
            <b>{activeHintsUsed}/3</b>
          </button>
          <button type="button" onClick={() => setPanel('rules')}>
            Rules
          </button>
        </div>
      </main>

      <footer className="verdict-v2__actions">
        <button type="button" disabled={!canAct} onClick={() => setPanel('reveal')}>
          <span>REVEAL</span>
          <small>4–6 ◉</small>
        </button>
        <button
          type="button"
          disabled={!canAct || activeHintsUsed >= 3}
          onClick={() => setPanel('hint')}
        >
          <span>HINT</span>
          <small>{activeHintsUsed < 3 ? String(HINT_COSTS[activeHintsUsed]) + ' ◉' : 'USED'}</small>
        </button>
        <button type="button" className="is-primary" disabled={!canAct} onClick={() => setPanel('guess')}>
          <span>GUESS WORD</span>
          <small>{MAX_WRONG_GUESSES - currentWrong} chances</small>
        </button>
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
                disabled={
                  activeHiddenConsonants === 0 || currentBudget < CONSONANT_COST || !canAct
                }
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
                  <div
                    key={hint}
                    className={'verdict-v2__hint' + (purchased ? ' is-open' : '')}
                  >
                    <div>
                      <b>HINT {index + 1}</b>
                      <span>{HINT_COSTS[index]} ◉</span>
                    </div>
                    <p>{purchased ? hint : next ? 'Ready to reveal.' : 'Unlock the previous hint first.'}</p>
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
          <form className="verdict-v2__sheet verdict-v2__guess-sheet" onSubmit={isFinal ? submitFinalGuess : submitRoundGuess}>
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
              A wrong full-word guess cracks the window. Duplicate guesses are blocked.
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
              <li>You begin with {STARTING_BUDGET} Eyeoleans and keep your wallet between rounds.</li>
              <li>Reveal one vowel position for {VOWEL_COST} or one consonant position for {CONSONANT_COST}.</li>
              <li>Hints cost {HINT_COSTS.join(' / ')} Eyeoleans and become progressively clearer.</li>
              <li>The 10th wrong full-word guess shatters the window: 0 round points and {FAILURE_PENALTY} cumulative points.</li>
              <li>Successful survivors receive +{SURVIVAL_BONUS} Eyeoleans, capped at {BUDGET_CAP}.</li>
              <li>In the final two, the higher cumulative scorer chooses first or second. Correct reveals keep the turn; a hint or wrong word passes it.</li>
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
              <span><b>Wallet</b><em>+{roundResolution.breakdown.budgetScore}</em></span>
              {roundResolution.breakdown.bonuses.map((bonus) => (
                <span key={bonus.label}><b>{bonus.label}</b><em>+{bonus.value}</em></span>
              ))}
              {roundResolution.breakdown.pressurePenalty !== 0 && (
                <span><b>Pressure</b><em>{roundResolution.breakdown.pressurePenalty}</em></span>
              )}
              {!roundResolution.humanResult.solved && (
                <span className="is-danger"><b>Failure penalty</b><em>{FAILURE_PENALTY}</em></span>
              )}
            </div>
            <p>
              {roundResolution.humanResult.solved
                ? '+' + SURVIVAL_BONUS + ' Eyeoleans if you survive the cut.'
                : 'Wallet retained. No survival refill.'}
            </p>
            <button type="button" onClick={proceedFromRoundResult}>Continue to scoreboard</button>
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
                  <em>◉ {entry.budgetRemaining}</em>
                </div>
              ))}
            </div>
            <button type="button" onClick={proceedFromScoreboard}>Continue</button>
          </div>
        </div>
      )}

      {phase === 'finalChoice' && finalState.chooserId === human.id && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Choose final order">
          <div className="verdict-v2__result-card">
            <p className="verdict-v2__eyebrow">Final advantage</p>
            <h2>You choose the order</h2>
            <p>
              Your cumulative score is higher. The final uses one shared board and both finalists
              keep their remaining Eyeoleans.
            </p>
            <div className="verdict-v2__choice-grid">
              <button type="button" onClick={() => chooseFinalOrder(true)}>
                START FIRST
                <small>Take the first action and keep control after successful reveals.</small>
              </button>
              <button type="button" onClick={() => chooseFinalOrder(false)}>
                PLAY SECOND
                <small>Let your opponent spend first and inherit any shared information.</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'finalChoice' && finalState.chooserId !== human.id && (
        <div className="verdict-v2__overlay" role="status" aria-label="Opponent choosing final order">
          <div className="verdict-v2__result-card">
            <p className="verdict-v2__eyebrow">Final advantage</p>
            <h2>Opponent is choosing</h2>
            <p>The higher cumulative scorer decides who acts first.</p>
          </div>
        </div>
      )}

      {phase === 'finalResult' && competitionWinnerId && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Final results">
          <div className="verdict-v2__result-card is-final">
            <p className="verdict-v2__eyebrow">Final verdict</p>
            <h2>{players.find((player) => player.id === competitionWinnerId)?.name ?? 'Winner'}</h2>
            <p>solved the decisive board and wins Verdict Board.</p>
            <button type="button" onClick={finishToHost}>Finish competition</button>
          </div>
        </div>
      )}

      {phase === 'eliminated' && competitionWinnerId && (
        <div className="verdict-v2__overlay" role="dialog" aria-label="Eliminated from Verdict Board">
          <div className="verdict-v2__result-card">
            <p className="verdict-v2__eyebrow">Eliminated</p>
            <h2>Your verdict is final.</h2>
            <p>
              The remaining tournament was resolved under the same wallet and scoring rules.
              {players.find((player) => player.id === competitionWinnerId)?.name ?? 'A contestant'} won.
            </p>
            <button type="button" onClick={finishToHost}>Continue</button>
          </div>
        </div>
      )}
    </section>
  )
}
