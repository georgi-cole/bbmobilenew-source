import { describe, expect, it } from 'vitest'
import {
  QUICK_TAP_VIP_DURATION_MS,
  VIP_SEASONS,
  advanceQuickTapVipState,
  applyQuickTapVipTap,
  buildQuickTapVipSeasons,
  claimQuickTapVipBox,
  createQuickTapVipOffers,
  createQuickTapVipScoreState,
  getQuickTapVipClock,
  getQuickTapVipProgressAt,
  quickTapVipDurationMs,
  quickTapVipSeasonAt,
  quickTapVipTapValueAt,
  rerollQuickTapVipSeason,
  resolveQuickTapVipBox,
  scoreQuickTapVipAiOnly,
  simulateQuickTapVipAiRace,
  type QuickTapVipBoosterId,
  type QuickTapVipMode,
  type TapSeason,
} from '../quickTapVipLogic'

function findSeed(id: QuickTapVipBoosterId, season: TapSeason | null = null, offerIndex = 0) {
  for (let seed = 0; seed < 10_000; seed++)
    if (resolveQuickTapVipBox(seed, offerIndex, season).id === id) return seed
  throw new Error(`No seeded ${id} outcome`)
}
function boxState(id: QuickTapVipBoosterId, season: TapSeason | null = null) {
  const seed = findSeed(id, season),
    mode: QuickTapVipMode = season ? 'seasons' : 'race'
  const state = createQuickTapVipScoreState(seed, mode)
  if (season) state.schedule[0] = season
  const offer = createQuickTapVipOffers(seed, mode)[0]
  return { state, offer, at: offer.opensAtMs }
}

describe('VIP three-round clocks and shared scoring', () => {
  it('gives Race 3 × 25 and Seasons 3 × 28 seconds, excluding breaks', () => {
    expect(QUICK_TAP_VIP_DURATION_MS).toBe(75_000)
    expect(quickTapVipDurationMs('seasons')).toBe(84_000)
    expect(getQuickTapVipClock(25_000, 'race')).toMatchObject({
      round: 0,
      elapsedMs: 25_000,
      intermission: true,
      breakLeftMs: 4_000,
    })
    expect(getQuickTapVipClock(28_999, 'race').elapsedMs).toBe(25_000)
    expect(getQuickTapVipClock(29_000, 'race')).toMatchObject({
      round: 1,
      elapsedMs: 25_000,
      roundLeftMs: 25_000,
      intermission: false,
    })
    expect(getQuickTapVipClock(83_000, 'race').finished).toBe(true)
    expect(getQuickTapVipClock(28_000, 'seasons').intermission).toBe(true)
    expect(getQuickTapVipClock(92_000, 'seasons').finished).toBe(true)
  })
  it('generates hidden shared availability windows in every round', () => {
    for (const mode of ['race', 'seasons'] as const) {
      const first = createQuickTapVipOffers(1, mode)
      expect(first).toEqual(createQuickTapVipOffers(2, mode))
      expect(first).toHaveLength(mode === 'race' ? 9 : 12)
      expect(first.every((offer) => offer.closesAtMs - offer.opensAtMs === 3_000)).toBe(true)
      expect(Object.keys(first[0]).sort()).toEqual(['closesAtMs', 'index', 'opensAtMs', 'round'])
      expect(new Set(first.map((offer) => offer.round))).toEqual(new Set([0, 1, 2]))
    }
  })
  it('uses the same seeded hidden content for equivalent claims, once per window', () => {
    const { state, offer, at } = boxState('cache')
    expect(claimQuickTapVipBox(state, offer, at - 1)).toBe(state)
    expect(claimQuickTapVipBox(state, offer, offer.closesAtMs)).toBe(state)
    const a = claimQuickTapVipBox(state, offer, at),
      b = claimQuickTapVipBox(state, offer, at)
    expect(a).toEqual(b)
    expect(a.score).toBe(16)
    expect(claimQuickTapVipBox(a, offer, at + 100)).toBe(a)
    expect(claimQuickTapVipBox(state, { ...offer, opensAtMs: at - 50 }, at)).toBe(state)
  })
  it('counts input timestamps and rejects late or out-of-order taps', () => {
    let state = createQuickTapVipScoreState()
    state = applyQuickTapVipTap(state, 20)
    for (let i = 1; i <= 100; i++) state = applyQuickTapVipTap(state, 20 + i * 5)
    expect(state.rawTaps).toBe(101)
    expect(state.score).toBe(101)
    expect(applyQuickTapVipTap(state, 0)).toBe(state)
    expect(applyQuickTapVipTap(state, 75_000)).toBe(state)
  })
  it('applies a real handicap and returns to normal scoring at its exact expiry', () => {
    const { state, offer, at } = boxState('backfire')
    let next = claimQuickTapVipBox(state, offer, at)
    next = applyQuickTapVipTap(next, at + 100)
    expect(next.score).toBe(-1)
    expect(quickTapVipTapValueAt(next, at + 1_999)).toBe(-1)
    next = applyQuickTapVipTap(next, at + 2_000)
    expect(next.score).toBe(0)
  })
  it('expires tap effects between rounds while banking the actual per-round totals', () => {
    const seed = findSeed('echo', null, 2)
    const offer = createQuickTapVipOffers(seed)[2]
    let state = claimQuickTapVipBox(createQuickTapVipScoreState(seed), offer, 21_999)
    state = applyQuickTapVipTap(state, 24_999)
    expect(state.score).toBe(1.5)
    state = applyQuickTapVipTap(state, 25_000)
    expect(state.score).toBe(2.5)
    expect(state.roundScores).toEqual([1.5, 1, 0])
    expect(state.activeEffect).toBeNull()
  })
  it('instant points cannot erase an existing handicap', () => {
    const { state, offer, at } = boxState('cache')
    const next = claimQuickTapVipBox(
      {
        ...state,
        activeEffect: {
          booster: resolveQuickTapVipBox(findSeed('backfire'), 0, null),
          startsAtMs: at - 100,
          endsAtMs: at + 1000,
        },
      },
      offer,
      at
    )
    expect(next.score).toBe(16)
    expect(quickTapVipTapValueAt(next, at + 50)).toBe(-1)
  })
})

describe('VIP seasonal rules and mystery pools', () => {
  it('keeps future seasons seeded and hidden, changing at exact seven-second boundaries', () => {
    const state = createQuickTapVipScoreState(424242, 'seasons')
    const schedule = buildQuickTapVipSeasons(424242)
    expect(schedule).toHaveLength(12)
    expect(schedule.every((season, i) => i === 0 || season !== schedule[i - 1])).toBe(true)
    expect(quickTapVipSeasonAt(state, 6_999)).toBe(schedule[0])
    expect(quickTapVipSeasonAt(state, 7_000)).toBe(schedule[1])
    for (let phase = 0; phase < 12; phase++)
      expect(quickTapVipSeasonAt(state, phase * 7_000)).toBe(schedule[phase])
  })
  it('preserves −1 winter taps without a score floor', () => {
    const state = createQuickTapVipScoreState(4, 'seasons')
    state.schedule[0] = 'winter'
    expect(VIP_SEASONS.winter.value).toBe(-1)
    expect(applyQuickTapVipTap(state, 100).score).toBe(-1)
  })
  it('rerolls to another season once per round and preserves the automatic phase clock', () => {
    const state = createQuickTapVipScoreState(20, 'seasons')
    const before = quickTapVipSeasonAt(state, 100)
    const changed = rerollQuickTapVipSeason(state, 100)
    expect(quickTapVipSeasonAt(changed, 100)).not.toBe(before)
    expect(rerollQuickTapVipSeason(changed, 200)).toBe(changed)
    expect(quickTapVipSeasonAt(changed, 7_000)).toBe(state.schedule[1])
    const newRound = rerollQuickTapVipSeason(changed, 28_100)
    expect(newRound.usedRerollRounds).toEqual([0, 1])
  })
  it('settles Stillness without taps and cancels it on a tap', () => {
    const { state, offer, at } = boxState('stillness', 'winter')
    const selected = claimQuickTapVipBox(state, offer, at)
    expect(advanceQuickTapVipState(selected, at + 1_999).score).toBe(0)
    const awarded = advanceQuickTapVipState(selected, at + 2_000)
    expect(awarded.score).toBe(14)
    expect(advanceQuickTapVipState(awarded, at + 2_500).score).toBe(14)
    const tapped = applyQuickTapVipTap(selected, at + 100)
    expect(tapped.score).toBe(-1)
    expect(advanceQuickTapVipState(tapped, at + 2_500).score).toBe(-1)
  })
  it('contains seasonal rewards and penalties and keeps them appropriate to winter', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const results = Array.from({ length: 1000 }, (_, seed) =>
        resolveQuickTapVipBox(seed, 0, season)
      )
      const good = results.filter((result) => result.good).length
      expect(good).toBeGreaterThan(550)
      expect(good).toBeLessThan(720)
      if (season === 'winter')
        expect(results.every((result) => !result.multiplier && result.tapValue === undefined)).toBe(
          true
        )
    }
  })
  it('ends seasonal effects when the weather changes or is rerolled', () => {
    const { state, offer, at } = boxState('bloom', 'spring')
    const boosted = claimQuickTapVipBox(state, offer, at)
    expect(rerollQuickTapVipSeason(boosted, at + 100).activeEffect).toBeNull()
    expect(advanceQuickTapVipState(boosted, 7_000).activeEffect).toBeNull()
  })
})

describe('VIP AI parity', () => {
  it('produces repeatable distinct full races and exact live final scores', () => {
    for (const mode of ['race', 'seasons'] as const) {
      const race = simulateQuickTapVipAiRace({ seed: 424242, playerId: 'steady-ai', mode })
      expect(race).toEqual(simulateQuickTapVipAiRace({ seed: 424242, playerId: 'steady-ai', mode }))
      expect(race.rawTaps).toBeGreaterThan(150)
      expect(race.rawTaps).toBeLessThan(600)
      expect(
        race.progress.every((point, i) => i === 0 || point.atMs >= race.progress[i - 1].atMs)
      ).toBe(true)
      expect(race.roundScores.reduce((a, b) => a + b)).toBe(race.score)
      expect(getQuickTapVipProgressAt(race.progress, quickTapVipDurationMs(mode)).score).toBe(
        race.score
      )
      const other = simulateQuickTapVipAiRace({ seed: 424242, playerId: 'other-ai', mode })
      expect(other.claimedOfferIndexes).not.toEqual(race.claimedOfferIndexes)
      expect(other.rawTaps).not.toBe(race.rawTaps)
    }
  })
  it('does not read extra hidden outcome fields from offers when deciding', () => {
    const offers = createQuickTapVipOffers(88)
    const modified = offers.map((offer) => ({ ...offer, secretOutcome: 'huge penalty' }))
    expect(simulateQuickTapVipAiRace({ seed: 88, playerId: 'gambler', offers: modified })).toEqual(
      simulateQuickTapVipAiRace({ seed: 88, playerId: 'gambler', offers })
    )
  })
  it('allows reaction mistakes when an unexpected winter starts', () => {
    let seed = 0
    while (
      buildQuickTapVipSeasons(seed)[0] === 'winter' ||
      buildQuickTapVipSeasons(seed)[1] !== 'winter'
    )
      seed++
    const races = Array.from({ length: 12 }, (_, i) =>
      simulateQuickTapVipAiRace({
        seed,
        playerId: `reaction-${i}`,
        mode: 'seasons',
        offers: [],
        durationMs: 10_000,
      })
    )
    expect(
      races.some((race) =>
        race.progress.some(
          (point, i) => i > 0 && point.atMs >= 7_000 && point.score < race.progress[i - 1].score
        )
      )
    ).toBe(true)
  })
  it('resolves unrestricted rosters through the same simulator', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `ai-${i}`)
    for (const mode of ['race', 'seasons'] as const) {
      const scores = scoreQuickTapVipAiOnly({ seed: 404, participantIds: ids, mode })
      expect(Object.keys(scores)).toHaveLength(32)
      expect(new Set(Object.values(scores)).size).toBeGreaterThan(20)
    }
  })
})
