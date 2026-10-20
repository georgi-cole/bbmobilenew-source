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

  it('keeps the premiere fixed and retired/special-purpose games excluded', () => {
    expect(keys(context(16, 'LOH', 1))).toEqual(['majorityRules'])
    expect(keys(context(16, 'POS', 1))).toEqual(['quickTap'])

    for (const size of [4, 5, 6, 8, 10, 12, 16]) {
      for (const type of ['LOH', 'POS'] as const) {
        const available = keys(context(size, type))
        expect(available).not.toContain('bigSpender')
        expect(available).not.toContain('gridOfLuck')
        expect(available).not.toContain('capitalization')
        expect(available).not.toContain('finalThreeCircuit')
        expect(available).not.toContain('downMemoryLane')
      }
    }
  })

  it('preserves first-season introduction order for both spinoffs', () => {
    const withoutOriginal = keys(context(8, 'LOH', 10))
    expect(withoutOriginal).not.toContain('crystal_path_shattered')
    expect(withoutOriginal).not.toContain('castleRescue2')

    const withOriginals = keys(context(8, 'LOH', 9, ['glass_bridge_brutal', 'castleRescue']))
    expect(withOriginals).toContain('crystal_path_shattered')
    expect(withOriginals).not.toContain('castleRescue2')

    const day10 = keys(context(5, 'LOH', 10, ['castleRescue']))
    expect(day10).toContain('castleRescue2')
    const day7 = keys(context(9, 'LOH', 7, ['glass_bridge_brutal']))
    expect(day7).not.toContain('crystal_path_shattered')
  })

  it('adapts to returnees and enforces technical and pacing limits', () => {
    const seven = keys(context(7, 'LOH'))
    const nine = keys(context(9, 'LOH'))
    expect(seven).not.toContain('trapAuction')
    expect(nine).toContain('trapAuction')
    expect(nine).not.toContain('wildcardWestern')
    expect(seven).toContain('wildcardWestern')
    expect(keys(context(6, 'POS'))).not.toContain('mysticChamber')
    expect(keys(context(5, 'POS'))).toContain('mysticChamber')
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

    expect(findWeight(regular, 'glass_bridge_brutal')).toBe(2)
    expect(findWeight(carried, 'glass_bridge_brutal')).toBe(3)

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
