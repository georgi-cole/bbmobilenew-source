import { describe, expect, it } from 'vitest'
import {
  CLASSIC_CAMPAIGN_FINALE_GAME_KEYS,
  getClassicCampaignPoolForContext,
} from '../../../src/ai/competition/bracketTemplate'
import { getAllGames, getGame, getPoolByFilter } from '../../../src/minigames/registry'

describe('Down Memory Lane finale registration', () => {
  it('is a two-player authoritative React duel that remains Lab-visible', () => {
    const game = getGame('downMemoryLane')
    expect(game).toBeDefined()
    expect(game?.title).toBe('Down Memory Lane')
    expect(game?.implementation).toBe('react')
    expect(game?.reactComponentKey).toBe('DownMemoryLane')
    expect(game?.authoritative).toBe(true)
    expect(game?.minPlayers).toBe(2)
    expect(game?.maxPlayers).toBe(3)
    expect(getAllGames().some((entry) => entry.key === 'downMemoryLane')).toBe(true)
  })

  it('is excluded from ordinary random pools', () => {
    expect(
      getPoolByFilter({ retired: false }).some((entry) => entry.key === 'downMemoryLane')
    ).toBe(false)
  })

  it('owns the playable Part 3 phase', () => {
    const partThreePool = getClassicCampaignPoolForContext({
      day: 14,
      playerCount: 3,
      compType: 'LOH',
      phase: 'final3_comp3_minigame',
    })

    expect(CLASSIC_CAMPAIGN_FINALE_GAME_KEYS).toContain('downMemoryLane')
    expect(partThreePool).toEqual(['downMemoryLane'])
  })
})
