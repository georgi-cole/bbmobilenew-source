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

describe('Competition Director V1', () => {
  it('has explicit LOH and POS preferences for every field size from 16 down to 4', () => {
    for (let size = 4; size <= 16; size++) {
      expect(COMPETITION_DIRECTOR_PREFERENCES[size]?.LOH.length).toBeGreaterThan(0)
      expect(COMPETITION_DIRECTOR_PREFERENCES[size]?.POS.length).toBeGreaterThan(0)
      for (const type of ['LOH', 'POS'] as const) {
        const candidates = getCompetitionDirectorCandidates(context(size, type))
        expect(candidates.length, `${size} players / ${type}`).toBeGreaterThan(0)
        expect(candidates.every(({ game }) => !game.retired && supportsPlayerCount(game, size))).toBe(true)
      }
    }
  })

  it('keeps the premiere fixed and excludes retired/special-purpose entries throughout the season', () => {
    expect(getCompetitionDirectorCandidates(context(16, 'LOH', 1)).map(({ game }) => game.key))
      .toEqual(['majorityRules'])
    expect(getCompetitionDirectorCandidates(context(16, 'POS', 1)).map(({ game }) => game.key))
      .toEqual(['quickTap'])

    for (const size of [4, 5, 6, 8, 10, 12, 16]) {
      for (const type of ['LOH', 'POS'] as const) {
        const keys = getCompetitionDirectorCandidates(context(size, type)).map(({ game }) => game.key)
        expect(keys).not.toContain('bigSpender')
        expect(keys).not.toContain('gridOfLuck')
        expect(keys).not.toContain('capitalization')
        expect(keys).not.toContain('finalThreeCircuit')
        expect(keys).not.toContain('downMemoryLane')
      }
    }
  })

  it('honors narrative introduction order and day gates for both spinoffs', () => {
    const withoutPrequel = getCompetitionDirectorCandidates(context(8, 'LOH', 10))
      .map(({ game }) => game.key)
    expect(withoutPrequel).not.toContain('crystal_path_shattered')
    expect(withoutPrequel).not.toContain('castleRescue2')

    const withPrequel = getCompetitionDirectorCandidates(
      context(8, 'LOH', 9, ['glass_bridge_brutal', 'castleRescue'])
    ).map(({ game }) => game.key)
    expect(withPrequel).toContain('crystal_path_shattered')
    expect(withPrequel).not.toContain('castleRescue2')

    const day10 = getCompetitionDirectorCandidates(
      context(5, 'LOH', 10, ['castleRescue'])
    ).map(({ game }) => game.key)
    expect(day10).toContain('castleRescue2')
    expect(getCompetitionDirectorCandidates(
      context(9, 'LOH', 7, ['glass_bridge_brutal'])
    ).map(({ game }) => game.key)).not.toContain('crystal_path_shattered')
  })

  it('adapts to returnees and enforces technical and pacing limits', () => {
    const seven = getCompetitionDirectorCandidates(context(7, 'LOH')).map(({ game }) => game.key)
    const nine = getCompetitionDirectorCandidates(context(9, 'LOH')).map(({ game }) => game.key)
    expect(seven).not.toContain('trapAuction')
    expect(nine).toContain('trapAuction')
    expect(nine).not.toContain('wildcardWestern')
    expect(seven).toContain('wildcardWestern')
    expect(getCompetitionDirectorCandidates(context(6, 'POS')).map(({ game }) => game.key))
      .not.toContain('mysticChamber')
    expect(getCompetitionDirectorCandidates(context(5, 'POS')).map(({ game }) => game.key))
      .toContain('mysticChamber')
  })

  it('never repeats while ANY appropriate unused LOH or POS game exists', () => {
    for (const size of [4, 6, 8, 10, 12, 16]) {
      for (const type of ['LOH', 'POS'] as const) {
        if (size === 16) continue // the deliberate fixed premiere is a special rule
        const eligible = getCompetitionDirectorCandidates(context(size, type))
        expect(eligible.length).toBeGreaterThan(1)
        const played = eligible.slice(0, Math.min(5, eligible.length - 1))
          .map(({ game }) => game.key)
        const selected = pickCompetitionDirectorGame(context(size, type, 10, played), 20261020)
        expect(played, `${size}/${type}`).not.toContain(selected?.key)
      }
    }
  })

  it('allows repeats only when its ENTIRE eligible set is exhausted', () => {
    const pool = getCompetitionDirectorCandidates(context(8, 'POS'))
    const played = pool.map(({ game }) => game.key)
    const picked = pickCompetitionDirectorGame(context(8, 'POS', 10, played), 101)
    expect(played).toContain(picked?.key)
  })

  it('uses Democracia carry priority only on the following LOH day', () => {
    const skipped = { day: 7, playerCount: 9 }
    const regular = getCompetitionDirectorCandidates(context(8, 'LOH', 8))
    const carried = getCompetitionDirectorCandidates({
      ...context(8, 'LOH', 8), democraciaCarry: skipped,
    })
    const find = (items: typeof regular, key: string) =>
      items.find(({ game }) => game.key === key)?.weight
    expect(find(regular, 'glass_bridge_brutal')).toBe(2)
    expect(find(carried, 'glass_bridge_brutal')).toBe(3)

    const nextPos = getCompetitionDirectorCandidates({
      ...context(8, 'POS', 8), democraciaCarry: skipped,
    })
    expect(nextPos).toEqual(getCompetitionDirectorCandidates(context(8, 'POS', 8)))

    const later = getCompetitionDirectorCandidates({
      ...context(8, 'LOH', 9), democraciaCarry: skipped,
    })
    expect(later).toEqual(getCompetitionDirectorCandidates(context(8, 'LOH', 9)))
  })

  it('is deterministic for identical seeded selection inputs', () => {
    const input = context(10, 'LOH', 8)
    const a = pickCompetitionDirectorGame(input, 707, [])
    const b = pickCompetitionDirectorGame(input, 707, [])
    expect(a?.key).toBe(b?.key)
  })
})
