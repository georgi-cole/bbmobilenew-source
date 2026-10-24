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
  eliminationGroups: string[][]
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

export function selectPercentageQuestion(
  seed: number,
  round: number,
  usedIds: string[]
): PercentageQuestion {
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
  const initialFinalists =
    contestants.length === 2 ? ([contestants[0], contestants[1]] as [string, string]) : null
  const initialChooser = initialFinalists
    ? initialFinalists[Math.floor(mulberry32((seed ^ 0x51f15e) >>> 0)() * 2)]
    : null
  return {
    seed,
    contestants,
    activeIds: contestants,
    eliminatedIds: [],
    eliminationGroups: [],
    humanId,
    scores: Object.fromEntries(contestants.map((id) => [id, 0])),
    responseTotals: Object.fromEntries(contestants.map((id) => [id, 0])),
    phase: initialFinalists ? 'order' : 'question',
    roundNumber: 1,
    usedQuestionIds: [question.id],
    question,
    lastRound: null,
    finalists: initialFinalists,
    chooserId: initialChooser,
    duelTurnId: null,
    duelBounds: [0, 100],
    duelGuesses: [],
    winnerId: null,
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
  const rng = mulberry32(
    (state.seed ^ stringSeed(playerId) ^ Math.imul(state.roundNumber, 97001)) >>> 0
  )
  // Each contestant has a distinct seeded style: knowledgeable, cautious,
  // midpoint-anchored, or impulsive. Noise, occasional wild misses, and
  // different rounding/speed habits keep opponents from acting like clones.
  const profile = mulberry32((state.seed ^ stringSeed(playerId) ^ 0x6d2b79f5) >>> 0)()
  const style = mulberry32((state.seed ^ stringSeed(playerId) ^ 0x27d4eb2d) >>> 0)()
  const spread = profile > 0.82 ? 14 : profile > 0.55 ? 29 : profile > 0.25 ? 48 : 68
  const noise = (rng() + rng() + rng() - 1.5) * spread
  const answer = state.question.answerPercent
  const midpointPull = style > 0.72 ? (50 - answer) * 0.42 : 0
  const playerBias = style < 0.24 ? 12 : style < 0.48 ? -9 : 0
  const wildMiss = rng() < 0.12 ? (rng() < 0.5 ? -1 : 1) * (18 + rng() * 35) : 0
  const rawGuess = Math.max(0, Math.min(100, answer + noise + midpointPull + playerBias + wildMiss))
  const rounding = style < 0.35 ? 10 : style < 0.7 ? 5 : 1
  return {
    guess: Math.max(0, Math.min(100, Math.round(rawGuess / rounding) * rounding)),
    responseMs: 1800 + Math.floor(style * 9000 + rng() * 6500),
  }
}

/** The slowest of the equally inaccurate contestants leaves; exact-ms ties all leave. */
export function percentageEliminations(answers: PercentageAnswer[]): string[] {
  if (!answers.length) return []
  const worstError = Math.max(...answers.map((a) => a.error))
  const last = answers.filter((a) => a.error === worstError)
  const slowestMs = Math.max(...last.map((a) => a.responseMs))
  return last.filter((a) => a.responseMs === slowestMs).map((a) => a.playerId)
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
  const eliminatedIds = percentageEliminations(answers)
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
  const chooserId = finalPair
    ? (() => {
        const [first, second] = finalPair
        if (scores[first] > scores[second]) return first
        if (scores[second] > scores[first]) return second
        if (responseTotals[first] < responseTotals[second]) return first
        if (responseTotals[second] < responseTotals[first]) return second
        const tieIndex = Math.floor(
          mulberry32((state.seed ^ Math.imul(state.roundNumber, 0x45d9f3b)) >>> 0)() * 2
        )
        return finalPair[tieIndex]
      })()
    : null
  return {
    ...state,
    scores,
    responseTotals,
    activeIds,
    eliminatedIds: [...state.eliminatedIds, ...(suddenDeath ? [] : eliminatedIds)],
    eliminationGroups: suddenDeath
      ? state.eliminationGroups
      : [...state.eliminationGroups, eliminatedIds],
    lastRound: {
      question: state.question,
      answers,
      eliminatedIds: suddenDeath ? [] : eliminatedIds,
      suddenDeath,
    },
    finalists: finalPair,
    chooserId,
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
    ...state,
    phase: 'question',
    roundNumber: nextRound,
    question,
    usedQuestionIds: [...state.usedQuestionIds, question.id],
    lastRound: null,
  }
}

export function choosePercentageDuelOrder(
  state: PercentagePanicState,
  firstId: string
): PercentagePanicState {
  if (state.phase !== 'order' || !state.finalists || !state.finalists.includes(firstId))
    return state
  const question = selectPercentageQuestion(
    state.seed,
    state.roundNumber + 1,
    state.usedQuestionIds
  )
  return {
    ...state,
    phase: 'duel',
    question,
    usedQuestionIds: [...state.usedQuestionIds, question.id],
    duelTurnId: firstId,
    duelBounds: [0, 100],
    duelGuesses: [],
  }
}

export function resolvePercentageDuelGuess(
  state: PercentagePanicState,
  playerId: string,
  guess: number
): PercentagePanicState {
  if (state.phase !== 'duel' || !state.finalists || playerId !== state.duelTurnId) return state
  const [low, high] = state.duelBounds
  if (
    !isValidPercent(guess) ||
    guess < low ||
    guess > high ||
    state.duelGuesses.some((g) => g.guess === guess)
  )
    return state
  const answer = state.question.answerPercent
  const feedback = guess === answer ? 'correct' : guess < answer ? 'higher' : 'lower'
  const duelGuesses: PercentageDuelGuess[] = [...state.duelGuesses, { playerId, guess, feedback }]
  if (feedback === 'correct') {
    return { ...state, duelGuesses, winnerId: playerId, phase: 'winner' }
  }
  const duelBounds: [number, number] = feedback === 'higher' ? [guess + 1, high] : [low, guess - 1]
  return {
    ...state,
    duelGuesses,
    duelBounds,
    duelTurnId: state.finalists.find((id) => id !== playerId) ?? null,
  }
}

export function pickAiDuelGuess(state: PercentagePanicState): number {
  const [low, high] = state.duelBounds
  // Midpoint strategy: finite, respects all higher/lower clues and can win without cheating.
  return Math.floor((low + high) / 2)
}

export function chooseAiPercentageDuelFirst(state: PercentagePanicState): string | null {
  if (!state.finalists || !state.chooserId) return null
  const other = state.finalists.find((id) => id !== state.chooserId)
  if (!other) return null
  const chooserHash = stringSeed(state.chooserId)
  const chooserWantsFirst =
    (state.seed ^ chooserHash ^ Math.imul(state.roundNumber, 0x27d4eb2d)) & 1
  return chooserWantsFirst === 0 ? state.chooserId : other
}

/** Ordered placement groups, with contestants eliminated together sharing one rank. */
export function percentagePanicRankedGroups(state: PercentagePanicState): string[][] {
  const groups: string[][] = []
  const ranked = new Set<string>()
  const addGroup = (ids: string[]) => {
    const unranked = ids.filter((id) => !ranked.has(id))
    if (unranked.length) {
      groups.push(unranked)
      unranked.forEach((id) => ranked.add(id))
    }
  }
  if (state.winnerId) addGroup([state.winnerId])
  const runnersUp = state.finalists?.filter((id) => id !== state.winnerId) ?? []
  if (runnersUp.length) addGroup(runnersUp)
  const contestantOrder = new Map(state.contestants.map((id, index) => [id, index]))
  for (const group of [...state.eliminationGroups].reverse()) {
    addGroup(
      [...group].sort((a, b) => (contestantOrder.get(a) ?? 0) - (contestantOrder.get(b) ?? 0))
    )
  }
  return groups
}

export function percentagePanicRankedIds(state: PercentagePanicState): string[] {
  return percentagePanicRankedGroups(state).flat()
}

export function percentagePanicLastPlaceIds(state: PercentagePanicState): string[] {
  if (state.eliminationGroups[0]) return [...state.eliminationGroups[0]]
  return state.finalists?.filter((id) => id !== state.winnerId) ?? []
}
