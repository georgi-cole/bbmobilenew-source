import { mulberry32 } from '../../store/rng'
import bank from '../../data/percentagePanicQuestions.json'

export interface PercentageQuestion {
  id: string
  prompt: string
  answerPercent: number
  scope: string
  regionOrCountry: string
  category: string
  referenceYear: number
  sourceName: string
  sourceUrl: string
  notes?: string
}

export interface PercentageAnswer {
  playerId: string
  guess: number
  responseMs: number
  error: number
  score: number
}

export interface PercentageRound {
  question: PercentageQuestion
  answers: PercentageAnswer[]
  eliminatedIds: string[]
  suddenDeath: boolean
}

export interface PercentageDuelGuess {
  playerId: string
  guess: number
  feedback: 'correct' | 'higher' | 'lower'
}

export interface PercentagePanicState {
  seed: number
  contestants: string[]
  activeIds: string[]
  eliminatedIds: string[]
  humanId: string | null
  scores: Record<string, number>
  responseTotals: Record<string, number>
  phase: 'question' | 'reveal' | 'order' | 'duel' | 'winner'
  roundNumber: number
  usedQuestionIds: string[]
  question: PercentageQuestion
  lastRound: PercentageRound | null
  finalists: [string, string] | null
  chooserId: string | null
  duelTurnId: string | null
  duelBounds: [number, number]
  duelGuesses: PercentageDuelGuess[]
  winnerId: string | null
}

export const PERCENTAGE_PANIC_QUESTIONS = bank as PercentageQuestion[]
const isValidPercent = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100

export function selectPercentageQuestion(seed: number, round: number, usedIds: string[]): PercentageQuestion {
  const available = PERCENTAGE_PANIC_QUESTIONS.filter((q) => !usedIds.includes(q.id))
  const pool = available.length ? available : PERCENTAGE_PANIC_QUESTIONS
  if (!pool.length) throw new Error('Percentage Panic has no verified questions')
  const rng = mulberry32((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0)
  return pool[Math.floor(rng() * pool.length)]
}

export function createPercentagePanic(
  participants: string[],
  humanId: string | null,
  seed: number
): PercentagePanicState {
  const contestants = [...new Set(participants.filter(Boolean))]
  if (contestants.length < 2) throw new Error('Percentage Panic requires at least two contestants')
  if (humanId && !contestants.includes(humanId)) throw new Error('Unknown human contestant')
  const question = selectPercentageQuestion(seed, 1, [])
  return {
    seed, contestants, activeIds: contestants, eliminatedIds: [], humanId,
    scores: Object.fromEntries(contestants.map((id) => [id, 0])),
    responseTotals: Object.fromEntries(contestants.map((id) => [id, 0])),
    phase: 'question', roundNumber: 1, usedQuestionIds: [question.id],
    question, lastRound: null, finalists: null, chooserId: null,
    duelTurnId: null, duelBounds: [0, 100], duelGuesses: [], winnerId: null,
  }
}

function stringSeed(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function simulatedPercentageGuess(
  state: PercentagePanicState,
  playerId: string
): { guess: number; responseMs: number } {
  // An AI estimate is intentionally noisy. The AI does not answer exactly by default.
  const rng = mulberry32((state.seed ^ stringSeed(playerId) ^ Math.imul(state.roundNumber, 97001)) >>> 0)
  const knowledge = rng()
  const spread = knowledge > 0.85 ? 4 : knowledge > 0.4 ? 16 : 30
  const error = Math.round((rng() + rng() + rng() - 1.5) * spread)
  return {
    guess: Math.max(0, Math.min(100, state.question.answerPercent + error)),
    responseMs: 1200 + Math.floor(rng() * 14500),
  }
}

export function resolvePercentageRound(
  state: PercentagePanicState,
  humanGuess?: number,
  humanResponseMs?: number
): PercentagePanicState {
  if (state.phase !== 'question') return state
  const answer = state.question.answerPercent
  const answers: PercentageAnswer[] = state.activeIds.map((id) => {
    const isHuman = id === state.humanId
    const simulated = simulatedPercentageGuess(state, id)
    const guess = isHuman ? humanGuess : simulated.guess
    const responseMs = isHuman ? humanResponseMs : simulated.responseMs
    if (guess == null || !isValidPercent(guess)) throw new Error('Invalid percentage guess')
    if (responseMs == null || !Number.isFinite(responseMs) || responseMs < 0) {
      throw new Error('Invalid response time')
    }
    const error = Math.abs(guess - answer)
    return { playerId: id, guess, responseMs: Math.floor(responseMs), error, score: -error }
  })
  const worstError = Math.max(...answers.map((a) => a.error))
  const last = answers.filter((a) => a.error === worstError)
  const slowestMs = Math.max(...last.map((a) => a.responseMs))
  const eliminatedIds = last.filter((a) => a.responseMs === slowestMs).map((a) => a.playerId)
  const scores = { ...state.scores }
  const responseTotals = { ...state.responseTotals }
  for (const a of answers) {
    scores[a.playerId] += a.score
    responseTotals[a.playerId] += a.responseMs
  }
  const survivors = state.activeIds.filter((id) => !eliminatedIds.includes(id))
  // If the entire field shares the worst error and timing, the same field
  // plays a fresh sudden-death question rather than awarding an arbitrary winner.
  const suddenDeath = survivors.length === 0
  const activeIds = suddenDeath ? [...state.activeIds] : survivors
  const finalPair = activeIds.length === 2 ? ([...activeIds] as [string, string]) : null
  const [first, second] = finalPair ?? []
  const chooserId = finalPair
    ? scores[first] > scores[second] ? first
      : scores[second] > scores[first] ? second
        : responseTotals[first] <= responseTotals[second] ? first : second
    : null
  return {
    ...state, scores, responseTotals, activeIds,
    eliminatedIds: [...state.eliminatedIds, ...(suddenDeath ? [] : eliminatedIds)],
    lastRound: { question: state.question, answers, eliminatedIds: suddenDeath ? [] : eliminatedIds, suddenDeath },
    finalists: finalPair, chooserId,
    winnerId: activeIds.length === 1 ? activeIds[0] : null,
    phase: 'reveal',
  }
}

export function advancePercentageRound(state: PercentagePanicState): PercentagePanicState {
  if (state.phase !== 'reveal') return state
  if (state.winnerId) return { ...state, phase: 'winner' }
  if (state.finalists) return { ...state, phase: 'order' }
  const nextRound = state.roundNumber + 1
  const question = selectPercentageQuestion(state.seed, nextRound, state.usedQuestionIds)
  return {
    ...state, phase: 'question', roundNumber: nextRound, question,
    usedQuestionIds: [...state.usedQuestionIds, question.id], lastRound: null,
  }
}

export function choosePercentageDuelOrder(
  state: PercentagePanicState,
  firstId: string
): PercentagePanicState {
  if (state.phase !== 'order' || !state.finalists || !state.finalists.includes(firstId)) return state
  const question = selectPercentageQuestion(state.seed, state.roundNumber + 1, state.usedQuestionIds)
  return {
    ...state, phase: 'duel', question,
    usedQuestionIds: [...state.usedQuestionIds, question.id],
    duelTurnId: firstId, duelBounds: [0, 100], duelGuesses: [],
  }
}

export function resolvePercentageDuelGuess(
  state: PercentagePanicState,
  playerId: string,
  guess: number
): PercentagePanicState {
  if (state.phase !== 'duel' || !state.finalists || playerId !== state.duelTurnId) return state
  const [low, high] = state.duelBounds
  if (!isValidPercent(guess) || guess < low || guess > high ||
      state.duelGuesses.some((g) => g.guess === guess)) return state
  const answer = state.question.answerPercent
  const feedback = guess === answer ? 'correct' : guess < answer ? 'higher' : 'lower'
  const duelGuesses: PercentageDuelGuess[] = [...state.duelGuesses, { playerId, guess, feedback }]
  if (feedback === 'correct') {
    return { ...state, duelGuesses, winnerId: playerId, phase: 'winner' }
  }
  const duelBounds: [number, number] = feedback === 'higher' ? [guess + 1, high] : [low, guess - 1]
  return {
    ...state, duelGuesses, duelBounds,
    duelTurnId: state.finalists.find((id) => id !== playerId) ?? null,
  }
}

export function pickAiDuelGuess(state: PercentagePanicState): number {
  const [low, high] = state.duelBounds
  // Midpoint strategy: finite, respects all higher/lower clues and can win without cheating.
  return Math.floor((low + high) / 2)
}

export function percentagePanicRankedIds(state: PercentagePanicState): string[] {
  const winner = state.winnerId ? [state.winnerId] : []
  const second = state.finalists?.filter((id) => id !== state.winnerId) ?? []
  return [...winner, ...second, ...[...state.eliminatedIds].reverse()].filter(
    (id, index, all) => all.indexOf(id) === index
  )
}
