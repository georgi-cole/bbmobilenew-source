import {
  aiShouldSpinAgain,
  assignAiPersonality,
  MAX_SPINS_PER_TURN,
  pickSectorIndex,
  resolve666Effect,
  WHEEL_SECTORS,
} from '../../../features/riskWheel/riskWheelSlice'
import { challengeRng, pickWeighted } from '../shared'

type Preference = (actor: string, target: string) => number
type Phase = 'spin' | 'handoff' | 'verdict' | 'playoff' | 'results'
type Scores = Record<string, number>

export type Abyss = {
  phase: Phase
  seed: number
  human?: string
  active: string[]
  eliminated: string[]
  round: number
  roundScores: Scores
  finalScores: Scores
  spins: number
  calls: number
  playoff: string[]
  playoffScores: Scores
  transfers: { from: string; to: string; amount: number }[]
  out?: string
  landed?: { player: string; sector: number; score: number }
}

export const zeroScores = (ids: readonly string[]): Scores =>
  Object.fromEntries(ids.map((id) => [id, 0]))

export function startAbyss(ids: string[], seed: number, human?: string): Abyss {
  return {
    phase: ids.length <= 1 ? 'results' : 'spin',
    seed,
    human,
    active: ids,
    eliminated: [],
    round: 1,
    roundScores: zeroScores(ids),
    finalScores: zeroScores(ids),
    spins: 0,
    calls: 0,
    playoff: [],
    playoffScores: {},
    transfers: [],
  }
}

export function abyssSpin(state: Abyss, player: string, balance: number) {
  const sector = pickSectorIndex(state.seed, state.calls++)
  const outcome = WHEEL_SECTORS[sector]
  const score =
    outcome.type === 'bankrupt'
      ? 0
      : outcome.type === 'devil'
        ? balance + (resolve666Effect(state.seed, state.calls++) === 'add' ? 666 : -666)
        : balance + (outcome.value ?? 0)
  state.landed = { player, sector, score }
  return { score, stop: outcome.type === 'bankrupt' || outcome.type === 'skip' }
}

function spinForAi(state: Abyss, id: string) {
  for (let spin = 0; spin < MAX_SPINS_PER_TURN; spin += 1) {
    const { score, stop } = abyssSpin(state, id, state.roundScores[id])
    state.roundScores[id] = score
    if (
      stop ||
      !aiShouldSpinAgain({
        seed: state.seed,
        round: state.round,
        playerId: id,
        personality: assignAiPersonality(state.seed, id),
        currentScore: score,
        activePlayerIds: state.active,
        roundScores: state.roundScores,
        spinsRemaining: MAX_SPINS_PER_TURN - spin - 1,
        initialPlayerCount: state.active.length + state.eliminated.length,
        decisionIndex: spin,
      })
    )
      return
  }
}

export function finishSpins(state: Abyss): Abyss {
  const next = { ...state, roundScores: { ...state.roundScores } }
  for (const id of next.active) {
    if (id !== next.human) spinForAi(next, id)
  }
  return { ...next, phase: 'handoff', landed: state.landed }
}

export function spinAbyss(state: Abyss): Abyss {
  if (state.phase !== 'spin') return state
  const id = state.human
  if (!id || !state.active.includes(id)) return finishSpins(state)
  const next = { ...state, spins: state.spins + 1, roundScores: { ...state.roundScores } }
  const { score, stop } = abyssSpin(next, id, next.roundScores[id])
  next.roundScores[id] = score
  return stop || next.spins >= MAX_SPINS_PER_TURN ? finishSpins(next) : next
}

export function settleHandoffs(state: Abyss, preference: Preference, target?: string): Abyss {
  if (state.phase !== 'handoff') return state
  const scores = zeroScores(state.active)
  const transfers = state.active.map((actor) => {
    const recipients = state.active.filter((id) => id !== actor).sort()
    const balance = state.roundScores[actor]
    const influence = Math.sign(balance) * Math.min(1, Math.abs(balance) / 240)
    const recipient =
      actor === state.human && target && recipients.includes(target)
        ? target
        : pickWeighted(
            recipients,
            (id) => 1 + influence * Math.max(-0.8, Math.min(0.8, preference(actor, id))),
            challengeRng(state.seed, 'abyss-handoff', state.round, actor)
          )!
    const cents = Math.round(balance * 100)
    scores[recipient] += cents
    return { from: actor, to: recipient, amount: cents / 100 }
  })
  for (const id of state.active) scores[id] /= 100
  const lowest = Math.min(...Object.values(scores))
  const tied = state.active.filter((id) => scores[id] === lowest)
  return {
    ...state,
    phase: 'verdict',
    roundScores: scores,
    finalScores: { ...state.finalScores, ...scores },
    transfers,
    landed: undefined,
    playoff: tied.length > 1 ? tied : [],
    out: tied.length === 1 ? tied[0] : undefined,
  }
}

export function spinPlayoff(state: Abyss): Abyss {
  if (state.phase !== 'playoff') return state
  const next = { ...state, playoffScores: zeroScores(state.playoff) }
  for (const id of next.playoff) next.playoffScores[id] = abyssSpin(next, id, 0).score
  const lowest = Math.min(...Object.values(next.playoffScores))
  const tied = next.playoff.filter((id) => next.playoffScores[id] === lowest)
  return {
    ...next,
    phase: 'verdict',
    playoff: tied.length > 1 ? tied : [],
    out: tied.length === 1 ? tied[0] : undefined,
  }
}

export function advanceVerdict(state: Abyss): Abyss {
  if (state.phase !== 'verdict') return state
  if (!state.out) return { ...state, phase: 'playoff' }
  const active = state.active.filter((id) => id !== state.out)
  return {
    ...state,
    active,
    eliminated: [...state.eliminated, state.out],
    phase: active.length === 1 ? 'results' : 'spin',
    round: state.round + Number(active.length > 1),
    roundScores: active.length > 1 ? zeroScores(active) : state.roundScores,
    spins: 0,
    playoffScores: {},
    transfers: [],
    out: undefined,
    landed: undefined,
  }
}

export function simulateAbyss(initial: Abyss, preference: Preference): Abyss {
  let state = initial
  while (state.phase !== 'results') {
    if (state.phase === 'spin') state = finishSpins(state)
    else if (state.phase === 'handoff') state = settleHandoffs(state, preference)
    else if (state.phase === 'playoff') state = spinPlayoff(state)
    else state = advanceVerdict(state)
  }
  return state
}

export const abyssStandings = (state: Abyss) => [
  ...state.active,
  ...[...state.eliminated].reverse(),
]
