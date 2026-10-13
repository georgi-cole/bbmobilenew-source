import { mulberry32 } from '../../store/rng'
import type { CompetitionSkillProfile } from '../../ai/competition/types'

export const SEASONS_DURATION = 40
export const SEASON_LENGTH = 8
export const SEASON_BOX_TIMES = [6, 18, 30] as const
export type TapSeason = 'winter' | 'summer' | 'autumn' | 'spring'

export const SEASONS: Record<
  TapSeason,
  { label: string; emoji: string; multiplier: number; effect: string }
> = {
  winter: { label: 'Winter', emoji: '❄️', multiplier: -1, effect: 'Slippery · −1×' },
  summer: { label: 'Summer', emoji: '☀️', multiplier: 0.5, effect: 'Too hot · ½×' },
  autumn: { label: 'Autumn', emoji: '🍂', multiplier: 1, effect: 'Leafy · 1×' },
  spring: { label: 'Spring', emoji: '🐦', multiplier: 1.25, effect: 'Chirpy · 1¼×' },
}
const SEASON_KEYS = Object.keys(SEASONS) as TapSeason[]

function pickOther(rng: () => number, current?: TapSeason): TapSeason {
  const choices = current ? SEASON_KEYS.filter((season) => season !== current) : SEASON_KEYS
  return choices[Math.floor(rng() * choices.length)]
}

export function buildSeasonSchedule(seed: number) {
  const rng = mulberry32((seed ^ 0x52ea50a5) >>> 0)
  const result: Array<{ at: number; season: TapSeason }> = []
  let current: TapSeason | undefined
  for (let at = 0; at < SEASONS_DURATION; at += SEASON_LENGTH) {
    current = pickOther(rng, current)
    result.push({ at, season: current })
  }
  return result
}

export function rerollSeason(seed: number, boxIndex: number, current: TapSeason): TapSeason {
  const rng = mulberry32((seed ^ Math.imul(boxIndex + 1, 0x9e3779b9) ^ 0xb07b07) >>> 0)
  return pickOther(rng, current)
}

function hash(value: string): number {
  let result = 0x811c9dc5 >>> 0
  for (const character of value) {
    result ^= character.charCodeAt(0)
    result = Math.imul(result, 0x01000193) >>> 0
  }
  return result
}

export type SeasonsAiResult = {
  id: string
  name: string
  score: number
  rawTaps: number
  manualSeasonChanges: number
  accidentalTaps: number
}

type SeasonsOpponentModel = {
  id: string
  name: string
  tapsPerSecond: number
  fatigueLoss: number
  pauseRatePerSecond: number
  minPauseSeconds: number
  maxPauseSeconds: number
  winterMistakeRate: number
  boxUseChance: number
  boxDecisionSkill: number
  boxWasteChance: number
  boxThinkMinSeconds: number
  boxThinkMaxSeconds: number
}

const DEFAULT_PROFILE: CompetitionSkillProfile = {
  overall: 50,
  physical: 50,
  mental: 50,
  precision: 50,
  nerve: 50,
  consistency: 50,
  clutch: 50,
  chokeRisk: 50,
  luck: 50,
}

export const SEASONS_STANDALONE_AI_FIELD: ReadonlyArray<{
  id: string
  name: string
  profile: CompetitionSkillProfile
}> = [
  { id: 'nova', name: 'Nova', profile: { ...DEFAULT_PROFILE, physical: 43, consistency: 44 } },
  { id: 'milo', name: 'Milo', profile: { ...DEFAULT_PROFILE, physical: 50, consistency: 54 } },
  { id: 'zara', name: 'Zara', profile: { ...DEFAULT_PROFILE, physical: 57, consistency: 64 } },
]

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function scoreWithSeasonsModel(seed: number, opponent: SeasonsOpponentModel): SeasonsAiResult {
  const schedule = buildSeasonSchedule(seed)
  const rng = mulberry32((seed ^ hash(opponent.id) ^ 0xa15ea50a) >>> 0)
  let season = schedule[0].season
  let seasonIndex = 1
  let nextSeasonAt = SEASON_LENGTH
  let boxIndex = 0
  let rawTaps = 0
  let score = 0
  let manualSeasonChanges = 0
  let accidentalTaps = 0
  let nextTap = 0.14 + rng() * 0.18
  let nextPauseAt = 1 / opponent.pauseRatePerSecond + rng() * 2

  while (nextTap < SEASONS_DURATION) {
    while (seasonIndex < schedule.length && nextSeasonAt <= nextTap) {
      season = schedule[seasonIndex++].season
      nextSeasonAt += SEASON_LENGTH
    }

    while (boxIndex < SEASON_BOX_TIMES.length && SEASON_BOX_TIMES[boxIndex] <= nextTap) {
      const boxAt = SEASON_BOX_TIMES[boxIndex]
      // The mystery box is only clickable for the same four-second window as
      // the playable screen, and its outcome uses the shared game seed/index.
      if (nextTap < boxAt + 4) {
        const boxSeason = rerollSeason(seed, boxIndex, season)
        const timeToScheduledChange = Math.max(0, nextSeasonAt - nextTap)
        const nextScheduledSeason = schedule[seasonIndex]?.season
        const fallbackSeason = nextScheduledSeason ?? season
        const noBoxAverage =
          (SEASONS[season].multiplier * timeToScheduledChange +
            SEASONS[fallbackSeason].multiplier * (SEASON_LENGTH - timeToScheduledChange)) /
          SEASON_LENGTH
        const improvesWindow = SEASONS[boxSeason].multiplier > noBoxAverage
        const decisive = rng() < opponent.boxDecisionSkill
        const deliberateChange =
          rng() < opponent.boxUseChance &&
          ((improvesWindow && decisive) || (!improvesWindow && rng() < opponent.boxWasteChance))
        const accidentalBoxTap = !deliberateChange && rng() < 0.012

        if (deliberateChange || accidentalBoxTap) {
          season = boxSeason
          nextSeasonAt = Math.min(SEASONS_DURATION, nextTap + SEASON_LENGTH)
          nextTap +=
            opponent.boxThinkMinSeconds +
            rng() * (opponent.boxThinkMaxSeconds - opponent.boxThinkMinSeconds)
          manualSeasonChanges += 1
        }
      }
      boxIndex += 1
    }

    while (seasonIndex < schedule.length && nextSeasonAt <= nextTap) {
      season = schedule[seasonIndex++].season
      nextSeasonAt += SEASON_LENGTH
    }

    const accidentalWinterTap = season === 'winter' && rng() < opponent.winterMistakeRate
    if (season !== 'winter' || accidentalWinterTap) {
      rawTaps += 1
      score += SEASONS[season].multiplier
      if (accidentalWinterTap) accidentalTaps += 1
    }

    // Fatigue trims the nominal pace gradually instead of leaving AI tap rates
    // effectively constant for the full race.
    const elapsedRatio = nextTap / SEASONS_DURATION
    const fatigueMultiplier = 1 - elapsedRatio * opponent.fatigueLoss
    const paceJitter = 0.94 + rng() * 0.12
    nextTap += 1 / Math.max(4, opponent.tapsPerSecond * fatigueMultiplier * paceJitter)

    // Pauses are timed in seconds, so they affect all tap rates consistently.
    if (nextTap >= nextPauseAt) {
      nextTap +=
        opponent.minPauseSeconds + rng() * (opponent.maxPauseSeconds - opponent.minPauseSeconds)
      nextPauseAt = nextTap + (0.5 + rng()) / opponent.pauseRatePerSecond
    }
  }

  return {
    id: opponent.id,
    name: opponent.name,
    score: Number(score.toFixed(2)),
    rawTaps,
    manualSeasonChanges,
    accidentalTaps,
  }
}

function createSeasonsAiOpponent(
  seed: number,
  id: string,
  profile: CompetitionSkillProfile,
  name = id
): SeasonsOpponentModel {
  const rng = mulberry32((seed ^ hash(id) ^ 0x5ea50a1) >>> 0)
  const physical = clamp01(profile.physical / 100)
  const consistency = clamp01(profile.consistency / 100)

  return {
    id,
    name,
    // Stronger contestants can briefly exceed ten taps per second, while
    // fatigue, short pauses, and imperfect box reads keep average AI in range.
    tapsPerSecond: 8.9 + physical * 1.6 + consistency * 0.55 + rng() * 0.35,
    fatigueLoss: 0.2 - consistency * 0.04 + rng() * 0.02,
    pauseRatePerSecond: 0.095 - consistency * 0.015,
    minPauseSeconds: 0.18,
    maxPauseSeconds: 0.46,
    winterMistakeRate: 0.025 + (1 - consistency) * 0.045,
    boxUseChance: 0.67 + consistency * 0.2,
    boxDecisionSkill: 0.55 + consistency * 0.35,
    boxWasteChance: 0.18 + (1 - consistency) * 0.14,
    boxThinkMinSeconds: 0.18,
    boxThinkMaxSeconds: 0.5,
  }
}

/**
 * Simulate the same score returned to hosted competitions, with diagnostics for
 * the standalone Seasons practice screen and balance benchmarks.
 */
export function simulateSeasonsAiResult({
  seed,
  playerId,
  name,
  participantIndex = 0,
  profile = DEFAULT_PROFILE,
}: {
  seed: number
  playerId?: string
  name?: string
  participantIndex?: number
  profile?: CompetitionSkillProfile
}): SeasonsAiResult {
  const id = playerId ?? `seasons-ai-${participantIndex}`
  return scoreWithSeasonsModel(seed, createSeasonsAiOpponent(seed, id, profile, name ?? id))
}

export function simulateSeasonsAiScore(args: {
  seed: number
  playerId?: string
  participantIndex?: number
  profile?: CompetitionSkillProfile
}): number {
  return simulateSeasonsAiResult(args).score
}

/** Modelled 10-taps/second strategic player used for synthetic balance checks. */
export function simulateSeasonsStrategicPlayer(seed: number): SeasonsAiResult {
  return scoreWithSeasonsModel(seed, {
    id: 'benchmark-strategic-player',
    name: 'Strategic player (synthetic)',
    tapsPerSecond: 10,
    fatigueLoss: 0.16,
    pauseRatePerSecond: 0.12,
    minPauseSeconds: 0.18,
    maxPauseSeconds: 0.48,
    winterMistakeRate: 0.012,
    boxUseChance: 0.98,
    boxDecisionSkill: 0.99,
    boxWasteChance: 0.01,
    boxThinkMinSeconds: 0.16,
    boxThinkMaxSeconds: 0.38,
  })
}

/** The practice roster uses the exact profile-driven simulator used by hosted AI. */
export function simulateSeasonsAiField(seed: number): SeasonsAiResult[] {
  return SEASONS_STANDALONE_AI_FIELD.map(({ id, name, profile }) =>
    simulateSeasonsAiResult({
      seed,
      playerId: id,
      name,
      profile,
    })
  )
}
