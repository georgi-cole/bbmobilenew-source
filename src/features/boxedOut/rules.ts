/** Authoritative, deterministic rules for BOXED OUT. No UI or timers in this module. */
export type BoxId = 0 | 1 | 2
export type BoxedOutPhase = 'select' | 'reveal' | 'tiebreak' | 'finished'

export interface BoxedOutPlayer {
  id: string
  name: string
  isHuman: boolean
}

export interface BoxedOutReveal {
  round: number
  participants: string[]
  picks: Record<string, BoxId>
  occupancy: [number, number, number]
  exploded: BoxId | null
  rewards: [number, number, number]
  eliminated: string[]
}

export interface BoxedOutState {
  seed: number
  round: number
  phase: BoxedOutPhase
  players: BoxedOutPlayer[]
  lives: Record<string, number>
  scores: Record<string, number>
  eliminatedAt: Record<string, number>
  rewards: [number, number, number]
  lockedAiPicks: Record<string, BoxId>
  reveals: BoxedOutReveal[]
  winnerId: string | null
  finalists: string[]
  questionIndex: number
}

export const BOXED_OUT_LIVES = 3
export const BOXED_OUT_ROUNDS = 10
export const BOXED_OUT_MIN_PLAYERS = 4
export const BOXED_OUT_MAX_PLAYERS = 12

export const TIEBREAK_QUESTIONS = [
  { prompt: 'How many minutes are there in exactly seven days?', answer: 10080 },
  { prompt: 'How many degrees are there in four full circles?', answer: 1440 },
  { prompt: 'How many seconds are there in exactly two hours?', answer: 7200 },
  { prompt: 'How many squares are on a standard chessboard?', answer: 64 },
  { prompt: 'How many centimeters are there in 15 meters?', answer: 1500 },
  { prompt: 'How many minutes are there in a 24-hour day?', answer: 1440 },
  { prompt: 'How many sides do 12 separate hexagons have in total?', answer: 72 },
  { prompt: 'How many hours are there in exactly three weeks?', answer: 504 },
] as const

/** Hashing a seed and labels gives reproducible, independently locked random decisions. */
export function random01(seed: number, label: string): number {
  let h = (seed | 0) ^ 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function prizesForRound(seed: number, round: number): [number, number, number] {
  const tier = round <= 3 ? [100, 180, 300] : round <= 6 ? [140, 250, 420] : round <= 9 ? [180, 320, 540] : [240, 420, 700]
  const rewards = [...tier]
  // Fisher-Yates; box positions change without changing the round's advertised values.
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(random01(seed, 'prize:' + round + ':' + i) * (i + 1))
    ;[rewards[i], rewards[j]] = [rewards[j], rewards[i]]
  }
  return rewards as [number, number, number]
}

export function activePlayerIds(state: BoxedOutState): string[] {
  return state.players.filter((player) => state.lives[player.id] > 0).map((player) => player.id)
}

export function chooseAiBox(state: BoxedOutState, id: string): BoxId {
  // The model sees public history, rewards and its own status, never other current picks.
  const seed = state.seed
  const previous = state.reveals[state.reveals.length - 1]
  const active = activePlayerIds(state)
  const maxScore = Math.max(1, ...active.map((p) => state.scores[p]))
  const behind = maxScore - state.scores[id]
  const urgency = behind > 500 && state.round >= 6 ? 0.2 : 0
  const caution = state.lives[id] === 1 ? 0.28 : 0
  const personality = random01(seed, 'identity:' + id)
  const noise = random01(seed, 'variation:' + id + ':' + state.round)

  const weights = state.rewards.map((reward, box) => {
    const value = reward / Math.max(...state.rewards)
    const recentCrowd = previous ? previous.occupancy[box] / Math.max(1, previous.participants.length) : 1 / 3
    const expectedCrowd = 0.65 * value + 0.35 * recentCrowd
    const appetite = personality < 0.25 ? 0.4 : personality < 0.55 ? 0.85 : personality < 0.8 ? 0.65 : 1.15
    const score = value * (appetite + urgency) - expectedCrowd * (0.5 + caution)
    return Math.exp((score + (noise - 0.5) * 0.25) * 3)
  })
  const sum = weights.reduce((a, b) => a + b, 0)
  let draw = random01(seed, 'choice:' + id + ':' + state.round) * sum
  for (let box = 0; box < 3; box++) {
    draw -= weights[box]
    if (draw < 0) return box as BoxId
  }
  return 2
}

function lockAiPicks(state: BoxedOutState): Record<string, BoxId> {
  return Object.fromEntries(
    activePlayerIds(state)
      .filter((id) => !state.players.some((player) => player.id === id && player.isHuman))
      .map((id) => [id, chooseAiBox(state, id)])
  )
}

export function createBoxedOutState(players: BoxedOutPlayer[], seed: number): BoxedOutState {
  const unique = new Set(players.map((player) => player.id))
  if (players.length < 2 || players.length > BOXED_OUT_MAX_PLAYERS || unique.size !== players.length || players.some((player) => !player.id)) {
    throw new Error('BOXED OUT requires unique participant IDs and 2–12 valid players.')
  }
  if (players.filter((player) => player.isHuman).length > 1) {
    throw new Error('BOXED OUT accepts at most one human participant.')
  }
  const state: BoxedOutState = {
    seed: Number.isFinite(seed) ? seed : 0,
    round: 1,
    phase: 'select',
    players,
    lives: Object.fromEntries(players.map((player) => [player.id, BOXED_OUT_LIVES])),
    scores: Object.fromEntries(players.map((player) => [player.id, 0])),
    eliminatedAt: {},
    rewards: prizesForRound(seed, 1),
    lockedAiPicks: {},
    reveals: [],
    winnerId: null,
    finalists: [],
    questionIndex: 0,
  }
  return { ...state, lockedAiPicks: lockAiPicks(state) }
}

/** Resolve one simultaneous round. Only active participants contribute to occupancy. */
export function resolveBoxedOutRound(state: BoxedOutState, humanPick?: BoxId): BoxedOutState {
  if (state.phase !== 'select') return state
  const active = activePlayerIds(state)
  if (active.length <= 1) return state
  const human = state.players.find((player) => player.isHuman && active.includes(player.id))
  if (human && humanPick !== 0 && humanPick !== 1 && humanPick !== 2) return state
  const picks: Record<string, BoxId> = { ...state.lockedAiPicks }
  if (human) picks[human.id] = humanPick as BoxId
  if (active.some((id) => picks[id] === undefined)) return state
  const occupancy: [number, number, number] = [0, 0, 0]
  active.forEach((id) => { occupancy[picks[id]] += 1 })
  const highest = Math.max(...occupancy)
  const exploded = occupancy.filter((count) => count === highest).length === 1
    ? (occupancy.indexOf(highest) as BoxId)
    : null
  const scores = { ...state.scores }
  const lives = { ...state.lives }
  const eliminatedAt = { ...state.eliminatedAt }
  const eliminated: string[] = []
  for (const id of active) {
    if (exploded !== null && picks[id] === exploded) {
      lives[id] -= 1
      if (lives[id] === 0) {
        eliminated.push(id)
        eliminatedAt[id] = state.round
      }
    } else {
      scores[id] += state.rewards[picks[id]]
    }
  }
  const reveal: BoxedOutReveal = {
    round: state.round,
    participants: active,
    picks,
    occupancy,
    exploded,
    rewards: state.rewards,
    eliminated,
  }
  return { ...state, scores, lives, eliminatedAt, reveals: [...state.reveals, reveal], phase: 'reveal' }
}

export function standings(state: BoxedOutState): string[] {
  const lastRound = state.reveals[state.reveals.length - 1]
  return [...state.players]
    .sort((a, b) => {
      const aActive = state.lives[a.id] > 0
      const bActive = state.lives[b.id] > 0
      if (aActive !== bActive) return aActive ? -1 : 1
      const survivalA = state.eliminatedAt[a.id] ?? lastRound?.round ?? 0
      const survivalB = state.eliminatedAt[b.id] ?? lastRound?.round ?? 0
      if (survivalA !== survivalB) return survivalB - survivalA
      if (state.scores[a.id] !== state.scores[b.id]) return state.scores[b.id] - state.scores[a.id]
      return state.players.indexOf(a) - state.players.indexOf(b)
    })
    .map((p) => p.id)
}

function finalCandidates(state: BoxedOutState): string[] {
  const alive = activePlayerIds(state)
  // If the final box eliminates everybody, only players active at that round's START compete.
  return alive.length ? alive : (state.reveals[state.reveals.length - 1]?.participants ?? [])
}

export function advanceBoxedOut(state: BoxedOutState): BoxedOutState {
  if (state.phase !== 'reveal') return state
  const remaining = activePlayerIds(state)
  if (remaining.length <= 1 || state.round >= BOXED_OUT_ROUNDS) {
    const finalists = finalCandidates(state)
    const best = Math.max(...finalists.map((id) => state.scores[id]))
    const leaders = finalists.filter((id) => state.scores[id] === best)
    return {
      ...state,
      finalists: leaders,
      winnerId: leaders.length === 1 ? leaders[0] : null,
      phase: leaders.length === 1 ? 'finished' : 'tiebreak',
    }
  }
  const next: BoxedOutState = {
    ...state,
    round: state.round + 1,
    rewards: prizesForRound(state.seed, state.round + 1),
    phase: 'select',
    lockedAiPicks: {},
  }
  return { ...next, lockedAiPicks: lockAiPicks(next) }
}

export function tiebreakQuestion(state: BoxedOutState) {
  return TIEBREAK_QUESTIONS[Math.floor(random01(state.seed, 'question:' + state.questionIndex) * TIEBREAK_QUESTIONS.length)]
}

function aiTiebreakAnswer(state: BoxedOutState, id: string, correct: number): number {
  const guess = 0.84 + random01(state.seed, 'tb:guess:' + id + ':' + state.questionIndex) * 0.24
  return Math.max(0, Math.round(correct * guess))
}

export function resolveBoxedOutTiebreak(
  state: BoxedOutState,
  humanAnswer?: number,
  responseMs?: number
): BoxedOutState {
  if (state.phase !== 'tiebreak') return state
  const { answer: correct } = tiebreakQuestion(state)
  const candidates = state.finalists.map((id) => {
    const human = state.players.some((player) => player.id === id && player.isHuman)
    const answer = human ? humanAnswer : aiTiebreakAnswer(state, id, correct)
    const ms = human ? responseMs : 2500 + Math.floor(random01(state.seed, 'tb:time:' + id + ':' + state.questionIndex) * 7000)
    return { id, answer, ms }
  })
  const valid = candidates.filter(
    (entry) => entry.answer !== undefined &&
      Number.isSafeInteger(entry.answer) && entry.answer >= 0 &&
      entry.answer <= correct && Number.isFinite(entry.ms) && (entry.ms as number) >= 0
  )
  if (valid.length === 0) return { ...state, questionIndex: state.questionIndex + 1 }
  const bestAnswer = Math.max(...valid.map((entry) => entry.answer as number))
  const closest = valid.filter((entry) => entry.answer === bestAnswer)
  const minMs = Math.min(...closest.map((entry) => entry.ms as number))
  const fastest = closest.filter((entry) => entry.ms === minMs)
  if (fastest.length !== 1) return { ...state, finalists: fastest.map((entry) => entry.id), questionIndex: state.questionIndex + 1 }
  return { ...state, winnerId: fastest[0].id, finalists: [fastest[0].id], phase: 'finished' }
}

/** Run an AI-only continuation for a spectator, with bounded sudden-death questions. */
export function autoFinishBoxedOut(state: BoxedOutState): BoxedOutState {
  let next = state
  for (let turn = 0; turn < 50 && next.phase !== 'finished'; turn++) {
    if (next.phase === 'select') next = resolveBoxedOutRound(next)
    else if (next.phase === 'reveal') next = advanceBoxedOut(next)
    else next = resolveBoxedOutTiebreak(next)
  }
  return next
}
