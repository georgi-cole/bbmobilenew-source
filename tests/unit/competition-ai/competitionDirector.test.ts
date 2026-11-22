import { describe, expect, it } from 'vitest'
import {
  COMPETITION_DIRECTOR_PREFERENCES,
  getCompetitionDirectorCandidates,
  pickCompetitionDirectorGame,
  type DirectorContext,
} from '../../../src/ai/competition/competitionDirector'
import { supportsPlayerCount } from '../../../src/minigames/registry'

function context(
  playerCount: number,
  compType: 'LOH' | 'POS',
  day = 10,
  playedGameKeys: string[] = []
): DirectorContext {
  return { day, playerCount, compType, playedGameKeys }
}

function keys(input: DirectorContext): string[] {
  return getCompetitionDirectorCandidates(input).map(({ game }) => game.key)
}

describe('Competition Director V1', () => {
  it('has LOH and POS candidates for every field size from 16 down to 4', () => {
    for (let size = 4; size <= 16; size++) {
      expect(COMPETITION_DIRECTOR_PREFERENCES[size]?.LOH.length).toBeGreaterThan(0)
      expect(COMPETITION_DIRECTOR_PREFERENCES[size]?.POS.length).toBeGreaterThan(0)
      for (const type of ['LOH', 'POS'] as const) {
        const candidates = getCompetitionDirectorCandidates(context(size, type))
        expect(candidates.length, `${size} players / ${type}`).toBeGreaterThan(0)
        expect(
          candidates.every(({ game }) => !game.retired && supportsPlayerCount(game, size))
        ).toBe(true)
      }
    }
  })

  it('keeps the premiere inside the retained competition map', () => {
    expect(keys(context(16, 'LOH', 1))).toEqual(['holdWall'])
    expect(keys(context(16, 'POS', 1))).toEqual(['quickTap', 'riskWheel'])

    for (const size of [4, 5, 6, 8, 10, 12, 16]) {
      for (const type of ['LOH', 'POS'] as const) {
        const available = keys(context(size, type))
        expect(available).not.toContain('bigSpender')
        expect(available).not.toContain('gridOfLuck')
        if (type === 'LOH') expect(available).toContain('capitalization')
        else expect(available).not.toContain('capitalization')
        expect(available).not.toContain('finalThreeCircuit')
        expect(available).not.toContain('downMemoryLane')
        expect(available).not.toContain('gatesOfTheEye')
        expect(available).not.toContain('boxedOut')
      }
    }
  })

  it('keeps the Day 1 POS draw between Quick Tap and Risk Wheel', () => {
    const premiere = context(16, 'POS', 1)
    const candidates = getCompetitionDirectorCandidates(premiere)
    expect(candidates.map(({ game }) => game.key)).toEqual(['quickTap', 'riskWheel'])

    const totals = { quickTap: 0, riskWheel: 0 }
    for (let seed = 1; seed <= 2000; seed += 1) {
      const selected = pickCompetitionDirectorGame(premiere, seed)
      if (selected?.key === 'quickTap') totals.quickTap += 1
      if (selected?.key === 'riskWheel') totals.riskWheel += 1
    }

    expect(totals.quickTap).toBeGreaterThan(900)
    expect(totals.quickTap).toBeLessThan(1100)
    expect(totals.riskWheel).toBeGreaterThan(900)
    expect(totals.riskWheel).toBeLessThan(1100)
  })

  it('holds calibration games out of every competition director draw', () => {
    const calibrationKeys = [
      'boxedOut',
      'gatesOfTheEye',
      'majorityRules',
      'percentagePanic',
      'trapAuction',
      'batteryLow',
      'blackjackTournament',
      'wildcardWestern',
    ]
    for (const size of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      for (const type of ['LOH', 'POS'] as const) {
        expect(keys(context(size, type)).filter((key) => calibrationKeys.includes(key))).toEqual([])
      }
    }
  })

  it('offers each social game for either prize only at five through eight players', () => {
    const socialKeys = ['rockPaperScissors', 'lastLight']
    for (const count of [4, 5, 6, 7, 8, 9]) {
      for (const type of ['LOH', 'POS'] as const) {
        const available = keys(context(count, type))
        for (const key of socialKeys) {
          expect(available.includes(key)).toBe(count >= 5 && count <= 8)
        }
      }
    }
  })
  it('keeps Crystal Path: Infinity independent of the calibration-only original', () => {
    const day10 = keys(context(9, 'LOH', 10))
    expect(day10).toContain('crystal_path_shattered')
    const day7 = keys(context(9, 'LOH', 7))
    expect(day7).not.toContain('crystal_path_shattered')
  })

  it('enforces the retained Crystal Path: Infinity cast-size limit', () => {
    const seven = keys(context(7, 'LOH'))
    const nine = keys(context(9, 'LOH'))
    expect(seven).toContain('crystal_path_shattered')
    expect(nine).toContain('crystal_path_shattered')
    expect(keys(context(6, 'LOH'))).not.toContain('crystal_path_shattered')
  })

  it('never repeats while a compatible unused LOH or POS game exists', () => {
    for (const size of [4, 6, 8, 10, 12]) {
      for (const type of ['LOH', 'POS'] as const) {
        const eligible = keys(context(size, type))
        expect(eligible.length).toBeGreaterThan(1)
        const played = eligible.slice(0, Math.min(5, eligible.length - 1))
        const selected = pickCompetitionDirectorGame(context(size, type, 10, played), 20261020)
        expect(played, `${size}/${type}`).not.toContain(selected?.key)
      }
    }
  })

  it('repeats only if the entire eligible set is exhausted', () => {
    const played = keys(context(8, 'POS'))
    const picked = pickCompetitionDirectorGame(context(8, 'POS', 10, played), 101)
    expect(played).toContain(picked?.key)
  })

  it('uses Democracia carry priority only on the next LOH day', () => {
    const skipped = { day: 7, playerCount: 9 }
    const regular = getCompetitionDirectorCandidates(context(8, 'LOH', 8))
    const carried = getCompetitionDirectorCandidates({
      ...context(8, 'LOH', 8),
      democraciaCarry: skipped,
    })
    const findWeight = (items: typeof regular, key: string) =>
      items.find(({ game }) => game.key === key)?.weight

    expect(findWeight(regular, 'crystal_path_shattered')).toBe(2)
    expect(findWeight(carried, 'crystal_path_shattered')).toBe(3)

    const nextPos = getCompetitionDirectorCandidates({
      ...context(8, 'POS', 8),
      democraciaCarry: skipped,
    })
    expect(nextPos).toEqual(getCompetitionDirectorCandidates(context(8, 'POS', 8)))

    const later = getCompetitionDirectorCandidates({
      ...context(8, 'LOH', 9),
      democraciaCarry: skipped,
    })
    expect(later).toEqual(getCompetitionDirectorCandidates(context(8, 'LOH', 9)))
  })

  it('is deterministic for identical seeded inputs', () => {
    const input = context(10, 'LOH', 8)
    const first = pickCompetitionDirectorGame(input, 707)
    const second = pickCompetitionDirectorGame(input, 707)
    expect(first?.key).toBe(second?.key)
  })
})
