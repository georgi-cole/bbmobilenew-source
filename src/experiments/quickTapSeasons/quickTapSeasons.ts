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

type SeasonsAiOpponent = {
  id: string
  name: string
  rate: number
  boxChance: number
}

function simulateSeasonsAiOpponent(seed: number, opponent: SeasonsAiOpponent): SeasonsAiResult {
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
  let winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
  let nextTap = 0.18 + rng() * 0.28

  while (nextTap < SEASONS_DURATION) {
    while (seasonIndex < schedule.length && nextSeasonAt <= nextTap) {
      season = schedule[seasonIndex++].season
      nextSeasonAt += SEASON_LENGTH
      winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
    }
    while (boxIndex < SEASON_BOX_TIMES.length && SEASON_BOX_TIMES[boxIndex] <= nextTap) {
      const wantsBetterSeason = SEASONS[season].multiplier <= 0.5
      const deliberateChange = rng() < opponent.boxChance && (wantsBetterSeason || rng() < 0.38)
      const accidentalBoxTap = !deliberateChange && rng() < 0.035
      if (deliberateChange || accidentalBoxTap) {
        season = rerollSeason(seed ^ hash(opponent.id), boxIndex, season)
        nextSeasonAt = Math.min(SEASONS_DURATION, nextTap + SEASON_LENGTH)
        manualSeasonChanges += 1
        winterInertia = season === 'winter' ? 1 + Math.floor(rng() * 3) : 0
      }
      boxIndex += 1
    }

    // A player can lose their rhythm in winter and make a stray negative tap.
    const accidentalWinterTap = season === 'winter' && winterInertia === 0 && rng() < 0.085
    if (season !== 'winter' || winterInertia > 0 || accidentalWinterTap) {
      rawTaps += 1
      score += SEASONS[season].multiplier
      if (season === 'winter' && winterInertia > 0) winterInertia -= 1
      if (accidentalWinterTap) accidentalTaps += 1
    }
    const fatigue = 1 - (nextTap / SEASONS_DURATION) * (opponent.id === 'nova' ? 0.14 : 0.07)
    nextTap += 1 / Math.max(3, opponent.rate * fatigue * (0.92 + rng() * 0.16))
    if (rng() > 0.965) nextTap += 0.12 + rng() * 0.22
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

export function simulateSeasonsAiScore({
  seed,
  playerId,
  participantIndex = 0,
  profile,
}: {
  seed: number
  playerId?: string
  participantIndex?: number
  profile?: CompetitionSkillProfile
}): number {
  const id = playerId ?? `seasons-ai-${participantIndex}`
  const rng = mulberry32((seed ^ hash(id) ^ 0x5ea50a1) >>> 0)
  const physical = Math.min(1, Math.max(0, (profile?.physical ?? 50) / 100))
  const consistency = Math.min(1, Math.max(0, (profile?.consistency ?? 50) / 100))
  const rate = 5.6 + physical * 2.5 + consistency * 0.8 + rng() * 0.45
  const boxChance = 0.45 + consistency * 0.32 + rng() * 0.12
  return simulateSeasonsAiOpponent(seed, { id, name: id, rate, boxChance }).score
}

export function simulateSeasonsAiField(seed: number): SeasonsAiResult[] {
  return [
    { id: 'nova', name: 'Nova', rate: 7.25, boxChance: 0.55 },
    { id: 'milo', name: 'Milo', rate: 7.65, boxChance: 0.72 },
    { id: 'zara', name: 'Zara', rate: 8.15, boxChance: 0.88 },
  ].map((opponent) => simulateSeasonsAiOpponent(seed, opponent))
}
