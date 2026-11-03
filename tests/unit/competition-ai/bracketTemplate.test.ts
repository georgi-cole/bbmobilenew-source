import { describe, expect, it } from 'vitest'
import {
  CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS,
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
    const approved = new Set<string>(CLASSIC_CAMPAIGN_ELIGIBLE_GAME_KEYS)
    expect([...scheduled].filter((key) => !getGame(key) || getGame(key)?.retired)).toEqual([])
    expect([...scheduled].filter((key) => !approved.has(key))).toEqual([])
    expect([...approved].filter((key) => !scheduled.has(key))).toEqual([])
  })

  it('keeps special-purpose games out of ordinary regular-season bands', () => {
    const regularBands = DEFAULT_BRACKET_TEMPLATE.filter((band) => band.minDay !== undefined)
    const regular = new Set(allKeys(regularBands))
    expect(regular).not.toContain('finalThreeCircuit')
    expect(regular).not.toContain('downMemoryLane')
    expect(regular).not.toContain('targetPractice')
  })

  it('maps Bigg Gates to every former Fit Me In campaign day and cast size', () => {
    const formerFitMeInBands = [
      { day: 7, minPlayers: 8, maxPlayers: 10 },
      { day: 8, minPlayers: 7, maxPlayers: 9 },
      { day: 9, minPlayers: 6, maxPlayers: 8 },
      { day: 10, minPlayers: 5, maxPlayers: 5 },
      { day: 11, minPlayers: 4, maxPlayers: 5 },
      { day: 12, minPlayers: 3, maxPlayers: 5 },
    ]

    formerFitMeInBands.forEach(({ day, minPlayers, maxPlayers }) => {
      for (let playerCount = minPlayers; playerCount <= maxPlayers; playerCount += 1) {
        const pool = getClassicCampaignPoolForContext({ day, playerCount, compType: 'POS' })
        expect(pool, `day ${day} / ${playerCount} players`).toContain('gatesOfTheEye')
        expect(pool, `day ${day} / ${playerCount} players`).not.toContain('tetris')
      }
    })
  })
  it('maps Boxed Out into large-cast LOH pools only', () => {
    for (const [day, counts] of [
      [4, [12]],
      [5, [11, 12]],
      [6, [10, 11, 12]],
      [7, [8, 9, 10]],
      [8, [8, 9]],
    ] as const) {
      for (const playerCount of counts) {
        expect(getClassicCampaignPoolForContext({ day, playerCount, compType: 'LOH' })).toContain(
          'boxedOut'
        )
        expect(
          getClassicCampaignPoolForContext({ day, playerCount, compType: 'POS' })
        ).not.toContain('boxedOut')
      }
    }
    expect(
      getClassicCampaignPoolForContext({ day: 9, playerCount: 7, compType: 'LOH' })
    ).not.toContain('boxedOut')
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

  it('filters games by supported cast size within wider roster bands', () => {
    expect(
      getClassicCampaignPoolForContext({ day: 2, playerCount: 16, compType: 'LOH' })
    ).toContain('boxedOut')
    expect(
      getClassicCampaignPoolForContext({ day: 4, playerCount: 12, compType: 'LOH' })
    ).toContain('boxedOut')
    expect(
      getClassicCampaignPoolForContext({ day: 4, playerCount: 13, compType: 'LOH' })
    ).toContain('boxedOut')
    expect(
      getClassicCampaignPoolForContext({ day: 4, playerCount: 17, compType: 'LOH' })
    ).not.toContain('boxedOut')
    expect(getClassicCampaignPoolForContext({ day: 9, playerCount: 8, compType: 'LOH' })).toContain(
      'boxedOut'
    )
    expect(
      getClassicCampaignPoolForContext({ day: 9, playerCount: 7, compType: 'LOH' })
    ).not.toContain('boxedOut')
  })

  it('reserves Final Three Circuit for Parts 1 and 2 and Down Memory Lane for Part 3', () => {
    const part1 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp1_minigame')
    )
    const part2 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp2_minigame')
    )
    const part3 = DEFAULT_BRACKET_TEMPLATE.find((band) =>
      band.phases?.includes('final3_comp3_minigame')
    )
    const circuit = getGame('finalThreeCircuit')
    const memoryLane = getGame('downMemoryLane')

    expect(part1?.loh).toEqual(['finalThreeCircuit'])
    expect(part2?.loh).toEqual(['finalThreeCircuit'])
    expect(part3?.loh).toEqual(['downMemoryLane'])
    expect(circuit?.minPlayers).toBe(2)
    expect(circuit?.maxPlayers).toBe(3)
    expect(memoryLane?.minPlayers).toBe(2)
    expect(memoryLane?.maxPlayers).toBe(3)
  })
})

describe('getBracketPoolForContext compatibility resolver', () => {
  it.each([
    [16, 'LOH', 'holdWall'],
    [13, 'POS', 'quickTap'],
    [10, 'LOH', 'blackjackTournament'],
    [9, 'POS', 'gatesOfTheEye'],
    [5, 'POS', 'quickTap'],
    [4, 'LOH', 'batteryLow'],
    [3, 'LOH', 'finalThreeCircuit'],
    [3, 'LOH', 'downMemoryLane'],
  ] as const)('maps %i players / %s to %s', (playerCount, compType, expectedKey) => {
    expect(getBracketPoolForContext(playerCount, compType)).toContain(expectedKey)
  })

  it('keeps Final 3 free of POS games', () => {
    expect(getBracketPoolForContext(3, 'POS')).toEqual([])
    expect(getBracketPoolForContext(2, 'POS')).toEqual([])
  })
})

describe('getClassicCampaignPoolForContext', () => {
  it('uses the fixed premiere pool on day 1 and a larger curated pool from day 2', () => {
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
    expect(day2).toContain('holdWall')
    expect(day2.length).toBeGreaterThan(day1.length)
  })

  it('keeps the finale phase-owned: Circuit for Parts 1-2 and Down Memory Lane for Part 3', () => {
    const resolve = (
      phase: 'final3_comp1_minigame' | 'final3_comp2_minigame' | 'final3_comp3_minigame'
    ) => getClassicCampaignPoolForContext({ day: 14, playerCount: 3, compType: 'LOH', phase })

    expect(resolve('final3_comp1_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp2_minigame')).toEqual(['finalThreeCircuit'])
    expect(resolve('final3_comp3_minigame')).toEqual(['downMemoryLane'])
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
    ).toEqual(['downMemoryLane'])
  })
})
