import { mulberry32 } from '../../../store/rng'
import type { CompetitionSkillProfile } from '../../../ai/competition/types'

export type QuickTapVipMode = 'race' | 'seasons'
export type TapSeason = 'spring' | 'summer' | 'autumn' | 'winter'
export const QUICK_TAP_VIP_ROUNDS = 3
export const QUICK_TAP_VIP_ROUND_MS = 25_000
export const QUICK_TAP_SEASONS_ROUND_MS = 28_000
export const QUICK_TAP_VIP_DURATION_MS = 75_000
export const QUICK_TAP_VIP_BREAK_MS = 4_000
export const QUICK_TAP_VIP_OFFER_WINDOW_MS = 3_000
export const QUICK_TAP_SEASON_MS = 7_000
export const VIP_SEASONS: Record<
  TapSeason,
  { label: string; glyph: string; value: number; color: string }
> = {
  spring: { label: 'Spring', glyph: '✿', value: 1.25, color: '#dbb6d5' },
  summer: { label: 'Summer', glyph: '☀', value: 0.5, color: '#ffbd75' },
  autumn: { label: 'Autumn', glyph: '❧', value: 1, color: '#df9d62' },
  winter: { label: 'Winter', glyph: '❄', value: -1, color: '#a4dcf2' },
}
const SEASON_KEYS = Object.keys(VIP_SEASONS) as TapSeason[]
export const quickTapVipRoundMs = (mode: QuickTapVipMode) =>
  mode === 'seasons' ? QUICK_TAP_SEASONS_ROUND_MS : QUICK_TAP_VIP_ROUND_MS
export const quickTapVipDurationMs = (mode: QuickTapVipMode) =>
  quickTapVipRoundMs(mode) * QUICK_TAP_VIP_ROUNDS

/** Active race time excludes the shared intermissions. */
export function getQuickTapVipClock(wallMs: number, mode: QuickTapVipMode) {
  const roundMs = quickTapVipRoundMs(mode),
    cycleMs = roundMs + QUICK_TAP_VIP_BREAK_MS
  const round = Math.min(2, Math.floor(Math.max(0, wallMs) / cycleMs))
  const within = Math.max(0, wallMs) - round * cycleMs
  const intermission = round < 2 && within >= roundMs
  return {
    round,
    elapsedMs: Math.min(quickTapVipDurationMs(mode), round * roundMs + Math.min(roundMs, within)),
    roundLeftMs: Math.max(0, roundMs - within),
    breakLeftMs: intermission ? Math.max(0, cycleMs - within) : 0,
    intermission,
    finished: round === 2 && within >= roundMs,
  }
}
function hashIdentity(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}
export function buildQuickTapVipSeasons(seed: number): TapSeason[] {
  const rng = mulberry32((seed ^ 0x52ea50a5) >>> 0),
    result: TapSeason[] = []
  for (let phase = 0; phase < 12; phase++) {
    const choices = SEASON_KEYS.filter((season) => season !== result[phase - 1])
    result.push(choices[Math.floor(rng() * choices.length)])
  }
  return result
}
export interface QuickTapVipOffer {
  index: number
  round: number
  opensAtMs: number
  closesAtMs: number
}
/** Availability only: hidden contents never enter the UI or the AI's grab decision. */
export function createQuickTapVipOffers(
  _seed: number,
  mode: QuickTapVipMode = 'race'
): QuickTapVipOffer[] {
  const roundMs = quickTapVipRoundMs(mode)
  const times = mode === 'seasons' ? [1_500, 8_500, 15_500, 22_500] : [5_000, 12_000, 19_000]
  return Array.from({ length: 3 }, (_, round) =>
    times.map((at, i) => ({
      index: round * times.length + i,
      round,
      opensAtMs: round * roundMs + at,
      closesAtMs: round * roundMs + Math.min(roundMs, at + 3_000),
    }))
  ).flat()
}
export type QuickTapVipBoosterId =
  | 'cache'
  | 'surge'
  | 'echo'
  | 'tempo'
  | 'drain'
  | 'heavy'
  | 'backfire'
  | 'shade'
  | 'heatwave'
  | 'harvest'
  | 'rot'
  | 'bloom'
  | 'wilt'
  | 'snowgift'
  | 'stillness'
  | 'frostbite'
  | 'blizzard'
export interface QuickTapVipBooster {
  id: QuickTapVipBoosterId
  name: string
  short: string
  glyph: string
  good: boolean
  durationMs?: number
  multiplier?: number
  tapValue?: number
  points?: number
  tapBonus?: number
}
export const QUICK_TAP_VIP_BOOSTERS: readonly QuickTapVipBooster[] = [
  { id: 'cache', name: 'Gold rush', short: '+16', glyph: '✦', good: true, points: 16 },
  {
    id: 'surge',
    name: 'Surge',
    short: '×2 · 3s',
    glyph: 'ϟ',
    good: true,
    multiplier: 2,
    durationMs: 3_000,
  },
  {
    id: 'echo',
    name: 'Echo',
    short: '×1.5 · 4s',
    glyph: '◈',
    good: true,
    multiplier: 1.5,
    durationMs: 4_000,
  },
  { id: 'tempo', name: 'Power taps', short: '+1 · 8 taps', glyph: '✧', good: true, tapBonus: 1 },
  { id: 'drain', name: 'Drain', short: '−12', glyph: '−', good: false, points: -12 },
  {
    id: 'heavy',
    name: 'Heavy hand',
    short: '½ · 3s',
    glyph: '↓',
    good: false,
    multiplier: 0.5,
    durationMs: 3_000,
  },
  {
    id: 'backfire',
    name: 'Backfire',
    short: 'STOP · 2s',
    glyph: '!',
    good: false,
    tapValue: -1,
    durationMs: 2_000,
  },
  {
    id: 'shade',
    name: 'Shade',
    short: '1 pt · 4s',
    glyph: '◒',
    good: true,
    tapValue: 1,
    durationMs: 4_000,
  },
  {
    id: 'heatwave',
    name: 'Heatwave',
    short: '0 pts · 2s',
    glyph: '≋',
    good: false,
    tapValue: 0,
    durationMs: 2_000,
  },
  { id: 'harvest', name: 'Harvest', short: '+18', glyph: '❧', good: true, points: 18 },
  { id: 'rot', name: 'Rot', short: '−12', glyph: '−', good: false, points: -12 },
  {
    id: 'bloom',
    name: 'Bloom',
    short: '×2 · 3s',
    glyph: '✿',
    good: true,
    multiplier: 2,
    durationMs: 3_000,
  },
  {
    id: 'wilt',
    name: 'Wilt',
    short: '½ · 3s',
    glyph: '↓',
    good: false,
    multiplier: 0.5,
    durationMs: 3_000,
  },
  { id: 'snowgift', name: 'Snowgift', short: '+14', glyph: '❄', good: true, points: 14 },
  {
    id: 'stillness',
    name: 'Stillness',
    short: 'STOP 2s · +14',
    glyph: '◌',
    good: true,
    durationMs: 2_000,
    points: 14,
  },
  { id: 'frostbite', name: 'Frostbite', short: '−12', glyph: '❄', good: false, points: -12 },
  { id: 'blizzard', name: 'Blizzard', short: '−20', glyph: '✕', good: false, points: -20 },
]
const BOOSTER_BY_ID = new Map(QUICK_TAP_VIP_BOOSTERS.map((booster) => [booster.id, booster]))
type WeightedPool = Array<readonly [QuickTapVipBoosterId, number]>
const POOLS: Record<TapSeason | 'race', WeightedPool> = {
  race: [
    ['cache', 22],
    ['surge', 22],
    ['echo', 12],
    ['tempo', 8],
    ['drain', 14],
    ['heavy', 14],
    ['backfire', 8],
  ],
  spring: [
    ['bloom', 26],
    ['echo', 16],
    ['cache', 22],
    ['wilt', 20],
    ['drain', 10],
    ['backfire', 6],
  ],
  summer: [
    ['shade', 30],
    ['tempo', 16],
    ['cache', 18],
    ['heatwave', 18],
    ['drain', 12],
    ['backfire', 6],
  ],
  autumn: [
    ['harvest', 30],
    ['tempo', 18],
    ['echo', 16],
    ['rot', 18],
    ['heavy', 12],
    ['backfire', 6],
  ],
  winter: [
    ['snowgift', 34],
    ['stillness', 30],
    ['frostbite', 26],
    ['blizzard', 10],
  ],
}
export function resolveQuickTapVipBox(
  seed: number,
  offerIndex: number,
  season: TapSeason | null
): QuickTapVipBooster {
  const pool = POOLS[season ?? 'race']
  const rng = mulberry32(
    (seed ^ Math.imul(offerIndex + 1, 0x9e3779b9) ^ hashIdentity(season ?? 'race')) >>> 0
  )
  let ticket = rng() * 100
  for (const [id, weight] of pool) {
    ticket -= weight
    if (ticket < 0) return BOOSTER_BY_ID.get(id)!
  }
  return BOOSTER_BY_ID.get(pool[pool.length - 1][0])!
}
export interface QuickTapVipEffect {
  booster: QuickTapVipBooster
  startsAtMs: number
  endsAtMs: number
  remainingTaps?: number
}
export interface QuickTapVipScoreState {
  seed: number
  mode: QuickTapVipMode
  schedule: TapSeason[]
  score: number
  rawTaps: number
  roundScores: number[]
  roundTaps: number[]
  round: number
  lastAtMs: number
  activeEffect: QuickTapVipEffect | null
  usedOfferIndexes: number[]
  usedRerollRounds: number[]
  seasonOverride: { phase: number; season: TapSeason } | null
  modifiers: string[]
}
export function createQuickTapVipScoreState(
  seed = 0,
  mode: QuickTapVipMode = 'race'
): QuickTapVipScoreState {
  return {
    seed,
    mode,
    schedule: buildQuickTapVipSeasons(seed),
    score: 0,
    rawTaps: 0,
    roundScores: [0, 0, 0],
    roundTaps: [0, 0, 0],
    round: 0,
    lastAtMs: 0,
    activeEffect: null,
    usedOfferIndexes: [],
    usedRerollRounds: [],
    seasonOverride: null,
    modifiers: [],
  }
}
function addPoints(
  state: QuickTapVipScoreState,
  points: number,
  round = state.round
): QuickTapVipScoreState {
  const roundScores = state.roundScores.slice()
  roundScores[round] += points
  return { ...state, score: state.score + points, roundScores }
}
/** Settle timed awards even when a player correctly stops tapping. */
export function advanceQuickTapVipState(
  state: QuickTapVipScoreState,
  atMs: number
): QuickTapVipScoreState {
  if (atMs < state.lastAtMs) return state
  const round = Math.min(2, Math.floor(atMs / quickTapVipRoundMs(state.mode)))
  let next = state
  if (state.activeEffect && atMs >= state.activeEffect.endsAtMs) {
    if (
      state.activeEffect.booster.id === 'stillness' &&
      state.activeEffect.endsAtMs - state.activeEffect.startsAtMs >= 2_000
    )
      next = addPoints(next, state.activeEffect.booster.points ?? 0)
    next = { ...next, activeEffect: null }
  }
  return {
    ...next,
    round,
    lastAtMs: atMs,
    ...(round !== state.round ? { activeEffect: null, seasonOverride: null } : {}),
  }
}
export function quickTapVipSeasonAt(state: QuickTapVipScoreState, atMs: number): TapSeason | null {
  if (state.mode !== 'seasons') return null
  const phase = Math.min(11, Math.floor(atMs / QUICK_TAP_SEASON_MS))
  return state.seasonOverride?.phase === phase ? state.seasonOverride.season : state.schedule[phase]
}
export function quickTapVipTapValueAt(state: QuickTapVipScoreState, atMs: number): number {
  const season = quickTapVipSeasonAt(state, atMs),
    base = season ? VIP_SEASONS[season].value : 1
  const effect = state.activeEffect
  if (!effect || atMs >= effect.endsAtMs) return base
  if (effect.booster.tapValue !== undefined) return effect.booster.tapValue
  return (
    base * (effect.booster.multiplier ?? 1) +
    (effect.remainingTaps ? (effect.booster.tapBonus ?? 0) : 0)
  )
}
export function applyQuickTapVipTap(
  state: QuickTapVipScoreState,
  atMs: number
): QuickTapVipScoreState {
  if (atMs < state.lastAtMs || atMs < 0 || atMs >= quickTapVipDurationMs(state.mode)) return state
  let next = advanceQuickTapVipState(state, atMs)
  const points = quickTapVipTapValueAt(next, atMs)
  let activeEffect = next.activeEffect
  if (activeEffect?.booster.id === 'stillness') activeEffect = null
  if (activeEffect?.remainingTaps)
    activeEffect =
      activeEffect.remainingTaps > 1
        ? { ...activeEffect, remainingTaps: activeEffect.remainingTaps - 1 }
        : null
  const roundTaps = next.roundTaps.slice()
  roundTaps[next.round]++
  next = addPoints(next, points)
  return { ...next, rawTaps: next.rawTaps + 1, roundTaps, activeEffect }
}
export function claimQuickTapVipBox(
  state: QuickTapVipScoreState,
  offer: QuickTapVipOffer,
  atMs: number
): QuickTapVipScoreState {
  if (
    atMs < state.lastAtMs ||
    atMs < offer.opensAtMs ||
    atMs >= offer.closesAtMs ||
    state.usedOfferIndexes.includes(offer.index)
  )
    return state
  const canonical = createQuickTapVipOffers(state.seed, state.mode).find(
    (item) => item.index === offer.index
  )
  if (
    !canonical ||
    canonical.opensAtMs !== offer.opensAtMs ||
    canonical.closesAtMs !== offer.closesAtMs
  )
    return state
  let next = advanceQuickTapVipState(state, atMs)
  const booster = resolveQuickTapVipBox(state.seed, offer.index, quickTapVipSeasonAt(next, atMs))
  const endsAtMs = Math.min(
    (next.round + 1) * quickTapVipRoundMs(state.mode),
    state.mode === 'seasons'
      ? (Math.floor(atMs / QUICK_TAP_SEASON_MS) + 1) * QUICK_TAP_SEASON_MS
      : Infinity,
    atMs + (booster.durationMs ?? quickTapVipRoundMs(state.mode))
  )
  if (
    booster.id === 'stillness' ||
    booster.multiplier !== undefined ||
    booster.tapValue !== undefined ||
    booster.tapBonus !== undefined
  ) {
    next = {
      ...next,
      activeEffect: {
        booster,
        startsAtMs: atMs,
        endsAtMs,
        ...(booster.tapBonus ? { remainingTaps: 8 } : {}),
      },
    }
  } else next = addPoints(next, booster.points ?? 0)
  return {
    ...next,
    usedOfferIndexes: [...next.usedOfferIndexes, offer.index],
    modifiers: [...next.modifiers, booster.name],
  }
}
/** One reroll per round; the automatic seven-second changes stay fixed. */
export function rerollQuickTapVipSeason(
  state: QuickTapVipScoreState,
  atMs: number
): QuickTapVipScoreState {
  if (
    state.mode !== 'seasons' ||
    atMs < state.lastAtMs ||
    atMs >= quickTapVipDurationMs(state.mode)
  )
    return state
  const next = advanceQuickTapVipState(state, atMs)
  if (next.usedRerollRounds.includes(next.round)) return state
  const current = quickTapVipSeasonAt(next, atMs),
    choices = SEASON_KEYS.filter((season) => season !== current)
  const phase = Math.floor(atMs / QUICK_TAP_SEASON_MS)
  const rng = mulberry32(
    (state.seed ^ Math.imul(phase + 1, 0xb07b07) ^ hashIdentity(current ?? 'winter')) >>> 0
  )
  return {
    ...next,
    activeEffect: null,
    seasonOverride: { phase, season: choices[Math.floor(rng() * choices.length)] },
    usedRerollRounds: [...next.usedRerollRounds, next.round],
  }
}
export interface QuickTapVipProgressPoint {
  atMs: number
  score: number
  rawTaps: number
}
export interface QuickTapVipAiRace {
  id: string
  score: number
  rawTaps: number
  roundScores: number[]
  selectedBoosters: string[]
  claimedOfferIndexes: number[]
  rerollTimes: number[]
  progress: QuickTapVipProgressPoint[]
}
/** Public conditions only. The policy cannot inspect the mystery result. */
export function shouldQuickTapVipAiGrab(args: {
  roll: number
  nerve: number
  mental: number
  season: TapSeason | null
  timeLeftMs: number
  score: number
  expectedScore: number
}): boolean {
  const urgency = args.score < args.expectedScore * 0.8 ? 0.1 : -0.04
  const chance =
    0.43 +
    args.nerve * 0.28 +
    args.mental * 0.08 +
    urgency +
    (args.season === 'winter' ? 0.1 : 0) -
    (args.timeLeftMs < 2_000 ? 0.22 : 0)
  return args.roll < chance
}
export function simulateQuickTapVipAiRace(args: {
  seed: number
  playerId: string
  profile?: Partial<CompetitionSkillProfile>
  offers?: QuickTapVipOffer[]
  durationMs?: number
  mode?: QuickTapVipMode
}): QuickTapVipAiRace {
  const { seed, playerId, profile = {}, mode = 'race' } = args
  const durationMs = Math.min(
    args.durationMs ?? quickTapVipDurationMs(mode),
    quickTapVipDurationMs(mode)
  )
  const offers = args.offers ?? createQuickTapVipOffers(seed, mode)
  const rng = mulberry32((seed ^ hashIdentity(playerId) ^ 0x71c3a55) >>> 0)
  const trait = (key: keyof CompetitionSkillProfile) =>
    Math.min(1, Math.max(0, (profile[key] ?? 42 + (hashIdentity(`${playerId}:${key}`) % 34)) / 100))
  const physical = trait('physical'),
    mental = trait('mental'),
    nerve = trait('nerve'),
    consistency = trait('consistency')
  const style = hashIdentity(playerId) % 4
  const form = 0.82 + rng() * 0.36
  const baseRate = (3.7 + physical * 2 + (style === 1 ? 0.35 : style === 2 ? -0.25 : 0)) * form
  const roundMs = quickTapVipRoundMs(mode)
  let state = createQuickTapVipScoreState(seed, mode)
  let observedSeason: TapSeason | null = quickTapVipSeasonAt(state, 0),
    observedStop = observedSeason === 'winter'
  let lastPhase = -1,
    observeAt = 0,
    pauseUntil = 0,
    nextOffer = 0,
    pendingReroll: number | null = null,
    rerollConsideredPhase = -1
  let pendingBox: { offer: QuickTapVipOffer; atMs: number } | null = null
  let lastEffectId: QuickTapVipBoosterId | null = null
  let nextTap = 140 + rng() * 220
  const progress: QuickTapVipProgressPoint[] = [{ atMs: 0, score: 0, rawTaps: 0 }]
  const selectedBoosters: string[] = [],
    claimedOfferIndexes: number[] = [],
    rerollTimes: number[] = []
  const record = (atMs: number) =>
    progress.push({ atMs, score: state.score, rawTaps: state.rawTaps })
  for (let atMs = 0; atMs < durationMs; atMs += 25) {
    const phase = mode === 'seasons' ? Math.floor(atMs / 7_000) : Math.floor(atMs / roundMs)
    const before = state.score,
      oldRound = state.round
    state = advanceQuickTapVipState(state, atMs)
    const effectId = state.activeEffect?.booster.id ?? null
    if (effectId !== lastEffectId) {
      lastEffectId = effectId
      observeAt = atMs + 200 + (1 - mental) * 180 + rng() * 180
    }
    if (state.score !== before) record(atMs)
    if (state.round !== oldRound) {
      pauseUntil = atMs + 180 + rng() * 220
      pendingReroll = null
    }
    if (phase !== lastPhase) {
      lastPhase = phase
      observeAt = atMs + 200 + (1 - mental) * 220 + rng() * 180
    }
    if (atMs >= observeAt) {
      observedSeason = quickTapVipSeasonAt(state, atMs)
      observedStop =
        observedSeason === 'winter' ||
        quickTapVipTapValueAt(state, atMs) < 0 ||
        state.activeEffect?.booster.id === 'stillness'
    }
    if (nextOffer < offers.length && atMs >= offers[nextOffer].opensAtMs) {
      const offer = offers[nextOffer++]
      const grab = shouldQuickTapVipAiGrab({
        roll: rng(),
        nerve,
        mental,
        season: observedSeason,
        timeLeftMs: (state.round + 1) * roundMs - atMs,
        score: state.score,
        expectedScore: (atMs / 1000) * baseRate * (mode === 'seasons' ? 0.65 : 1),
      })
      if (grab) {
        const decision = 360 + (1 - mental) * 250 + rng() * 300
        pendingBox = { offer, atMs: atMs + decision }
        pauseUntil = atMs + decision + 100 + rng() * 150
      }
    }
    if (pendingBox && atMs >= pendingBox.atMs) {
      const next = claimQuickTapVipBox(state, pendingBox.offer, atMs)
      if (next !== state) {
        state = next
        claimedOfferIndexes.push(pendingBox.offer.index)
        selectedBoosters.push(state.modifiers[state.modifiers.length - 1])
        lastEffectId = state.activeEffect?.booster.id ?? null
        observeAt = atMs + 220 + rng() * 350
        record(atMs)
      }
      pendingBox = null
    }
    if (
      mode === 'seasons' &&
      phase !== rerollConsideredPhase &&
      atMs >= observeAt &&
      !state.usedRerollRounds.includes(state.round)
    ) {
      rerollConsideredPhase = phase
      const wantsChange =
        observedSeason === 'winter' ||
        (observedSeason === 'summer' && rng() < 0.3 + nerve * 0.25) ||
        (observedSeason === 'autumn' && rng() < nerve * 0.09)
      if (wantsChange && atMs % 7_000 < 5_500 && rng() < 0.65 + mental * 0.3) {
        pendingReroll = atMs + 320 + rng() * 380
        pauseUntil = Math.max(pauseUntil, pendingReroll + 140)
      }
    }
    if (pendingReroll !== null && atMs >= pendingReroll) {
      state = rerollQuickTapVipSeason(state, atMs)
      rerollTimes.push(atMs)
      lastEffectId = null
      observeAt = atMs + 180 + rng() * 220
      pendingReroll = null
      record(atMs)
    }
    if (atMs >= nextTap) {
      const mistake = observedStop && rng() < (1 - consistency) * 0.035
      if (atMs >= pauseUntil && (!observedStop || mistake)) {
        state = applyQuickTapVipTap(state, atMs)
        record(atMs)
      }
      const fatigue = 1 + ((atMs % roundMs) / roundMs) * (style === 1 ? 0.18 : 0.07)
      const jitter = 0.82 + rng() * 0.36 + (1 - consistency) * (rng() - 0.5) * 0.28
      nextTap = atMs + Math.max(95, (1000 / baseRate) * fatigue * jitter)
    }
  }
  state = advanceQuickTapVipState(state, durationMs)
  record(durationMs)
  return {
    id: playerId,
    score: state.score,
    rawTaps: state.rawTaps,
    roundScores: state.roundScores,
    selectedBoosters,
    claimedOfferIndexes,
    rerollTimes,
    progress,
  }
}
export function scoreQuickTapVipAiOnly(args: {
  seed: number
  participantIds: string[]
  profiles?: Record<string, Partial<CompetitionSkillProfile> | undefined>
  durationMs?: number
  mode?: QuickTapVipMode
}): Record<string, number> {
  return Object.fromEntries(
    args.participantIds.map((id) => [
      id,
      simulateQuickTapVipAiRace({
        seed: args.seed,
        playerId: id,
        profile: args.profiles?.[id],
        durationMs: args.durationMs,
        mode: args.mode,
      }).score,
    ])
  )
}
export function getQuickTapVipProgressAt(
  progress: QuickTapVipProgressPoint[],
  atMs: number
): QuickTapVipProgressPoint {
  let low = 0,
    high = progress.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (progress[middle].atMs <= atMs) low = middle
    else high = middle - 1
  }
  return progress[low] ?? { atMs: 0, score: 0, rawTaps: 0 }
}
