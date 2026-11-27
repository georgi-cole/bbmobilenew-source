import { describe, expect, it } from 'vitest'
import {
  CLASSIC_CAMPAIGN_CALIBRATION_GAME_KEYS,
  CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
  CLASSIC_CAMPAIGN_FINALE_GAME_KEYS,
  CLASSIC_CAMPAIGN_GAME_MAX_PLAYERS,
  CLASSIC_CAMPAIGN_GAME_MIN_PLAYERS,
  DEFAULT_BRACKET_TEMPLATE,
  getBracketPoolForContext,
  getClassicCampaignPoolForContext,
  type BracketTemplate,
} from '../../../src/ai/competition/bracketTemplate'
import { getGame, supportsPlayerCount } from '../../../src/minigames/registry'

function allKeys(template: BracketTemplate): string[] {
  return template.flatMap((band) => [...band.loh, ...band.pos])
}

describe('classic campaign map registry integrity', () => {
  it('only references active, explicitly approved registry games', () => {
    const scheduled = new Set(allKeys(DEFAULT_BRACKET_TEMPLATE))
    const approved = new Set<string>([
      ...CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
      ...CLASSIC_CAMPAIGN_FINALE_GAME_KEYS,
    ])
    expect([...scheduled].filter((key) => !getGame(key) || getGame(key)?.retired)).toEqual([])
    expect([...scheduled].filter((key) => !approved.has(key))).toEqual([])
    expect([...approved].filter((key) => !scheduled.has(key))).toEqual([])
  })

  it('keeps special-purpose games out of ordinary regular-season bands', () => {
    const regularBands = DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined)
    const regular = new Set(allKeys(regularBands))
    expect(regular).not.toContain('finalThreeCircuit')
    expect(regular).not.toContain('downMemoryLane')
    expect(regular).not.toContain('rescueTheKing')
    expect(regular).not.toContain('targetPractice')
  })

  it('contains only the retained games in the map and labels all others for calibration', () => {
    const dailyScheduled = new Set(
      allKeys(DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined))
    )
    const approved = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
    const finaleOnly = new Set<string>(CLASSIC_CAMPAIGN_FINALE_GAME_KEYS)
    const calibration = new Set<string>(CLASSIC_CAMPAIGN_CALIBRATION_GAME_KEYS)

    expect([...dailyScheduled].sort()).toEqual([...approved].sort())
    expect(approved.size).toBe(24)
    expect([...finaleOnly]).toEqual(['finalThreeCircuit'])
    expect([...finaleOnly].some((key) => calibration.has(key))).toBe(false)
    expect([...dailyScheduled].some((key) => calibration.has(key))).toBe(false)
    expect([...calibration].filter((key) => !getGame(key) || getGame(key)?.retired)).toEqual([])
    expect([...calibration]).toEqual(
      expect.arrayContaining([
        'hangman',
        'estimationGame',
        'pressurePlank',
        'minesweeps',
        'tiltLabyrinth',
      ])
    )
    expect([...calibration]).not.toContain('finalThreeCircuit')
    expect([...calibration]).toContain('downMemoryLane')
  })
  it('only maps each game to field sizes its registry entry supports', () => {
    DEFAULT_BRACKET_TEMPLATE.forEach((band) => {
      for (let players = band.minPlayers; players <= band.maxPlayers; players += 1) {
        ;[...band.loh, ...band.pos].forEach((key) => {
          const game = getGame(key)
          expect(game, `${key} is missing from the registry`).toBeDefined()
          expect(
            supportsPlayerCount(game!, players) ||
              players <
                (CLASSIC_CAMPAIGN_GAME_MIN_PLAYERS[
                  key as keyof typeof CLASSIC_CAMPAIGN_GAME_MIN_PLAYERS
                ] ?? Number.NEGATIVE_INFINITY) ||
              players >
                (CLASSIC_CAMPAIGN_GAME_MAX_PLAYERS[
                  key as keyof typeof CLASSIC_CAMPAIGN_GAME_MAX_PLAYERS
                ] ?? Number.POSITIVE_INFINITY),
            `${key} does not support ${players} players`
          ).toBe(true)
        })
      }
    })
  })

  it('filters accepted games to their registered roster limits', () => {
    const pool = (day: number, playerCount: number) =>
      getClassicCampaignPoolForContext({ day, playerCount, compType: 'LOH' })

    expect(pool(7, 8)).toContain('boxedOut')
    expect(pool(8, 7)).not.toContain('boxedOut')
    expect(pool(7, 8)).toContain('trapAuction')
    expect(pool(8, 7)).not.toContain('trapAuction')
    expect(pool(10, 6)).not.toContain('mysticChamber')
  })

  it('keeps calibration-only games out of every regular campaign pool', () => {
    const calibration = new Set<string>(CLASSIC_CAMPAIGN_CALIBRATION_GAME_KEYS)
    for (const [day, players] of [
      [1, 16],
      [4, 13],
      [8, 9],
      [12, 4],
    ] as const) {
      for (const compType of ['LOH', 'POS'] as const) {
        const pool = getClassicCampaignPoolForContext({ day, playerCount: players, compType })
        expect(pool.every((key) => !calibration.has(key))).toBe(true)
      }
    }
  })

  it('preserves the Circuit qualifiers and uses retained map games in Final 3 Part 3', () => {
    const part1 = DEFAULT_BRACKET_TEMPLATE.find((band) => band.phases?.includes('final3_comp1'))
    const part2 = DEFAULT_BRACKET_TEMPLATE.find((band) => band.phases?.includes('final3_comp2'))
    const part3 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp3_minigame')
    )
    expect(part1?.loh).toEqual(['finalThreeCircuit'])
    expect(part2?.loh).toEqual(['finalThreeCircuit'])
    expect(part3?.loh).toEqual(['quickTapSeasons', 'snake', 'capitalization'])
  })
})

describe('getBracketPoolForContext compatibility resolver', () => {
  it.each([
    [16, 'LOH', 'holdWall'],
    [13, 'POS', 'quickTap'],
    [10, 'LOH', 'snake'],
    [9, 'POS', 'riskWheel'],
    [5, 'POS', 'quickTap'],
    [4, 'LOH', 'holdWall'],
    [3, 'LOH', 'quickTap'],
  ] as const)('maps %i players / %s to %s', (playerCount, compType, expectedKey) => {
    expect(getBracketPoolForContext(playerCount, compType)).toContain(expectedKey)
  })

  it('keeps Final 3 free of POS games', () => {
    expect(getBracketPoolForContext(3, 'POS')).toEqual([])
    expect(getBracketPoolForContext(2, 'POS')).toEqual([])
  })
})

describe('getClassicCampaignPoolForContext', () => {
  it('uses only retained games in the premiere and regular campaign pools', () => {
    const approved = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
    const day1 = getClassicCampaignPoolForContext({
      day: 1,
      playerCount: 16,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    const day2 = getClassicCampaignPoolForContext({
      day: 2,
      playerCount: 16,
      compType: 'LOH',
      phase: 'loh_comp',
    })
    expect(day1).toEqual(['majorityRules', 'percentagePanic'])
    expect(getClassicCampaignPoolForContext({ day: 1, playerCount: 16, compType: 'POS' })).toEqual([
      'quickTap',
    ])
    expect(day2).toContain('holdWall')
    expect(day2).toContain('riskWheelAbyss')
    expect(
      getClassicCampaignPoolForContext({ day: 2, playerCount: 16, compType: 'POS' })
    ).toContain('riskWheelAbyss')
    expect(day2.every((key) => approved.has(key))).toBe(true)
  })

  it('keeps the finale phase-owned while using only retained games', () => {
    const resolve = (
      phase: 'final3_comp1_minigame' | 'final3_comp2_minigame' | 'final3_comp3_minigame'
    ) => getClassicCampaignPoolForContext({ day: 14, playerCount: 3, compType: 'LOH', phase })

    expect(resolve('final3_comp1_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp2_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp3_minigame')).toEqual(['quickTapSeasons', 'snake', 'capitalization'])
  })

  it('is mode-agnostic for Classic, Vox Populi and Cupid finale scheduling', () => {
    // These three modes all use this same non-Survival campaign map in challengeSlice;
    // mode-specific state only changes the question context and AI identity.
    expect(
      getClassicCampaignPoolForContext({
        day: 14,
        playerCount: 3,
        compType: 'LOH',
        phase: 'final3_comp1_minigame',
      })
    ).toEqual(['finalThreeCircuit'])
    expect(
      getClassicCampaignPoolForContext({
        day: 14,
        playerCount: 3,
        compType: 'LOH',
        phase: 'final3_comp2_minigame',
      })
    ).toEqual(['finalThreeCircuit'])
    expect(
      getClassicCampaignPoolForContext({
        day: 14,
        playerCount: 3,
        compType: 'LOH',
        phase: 'final3_comp3_minigame',
      })
    ).toEqual(['quickTapSeasons', 'snake', 'capitalization'])
  })
})
