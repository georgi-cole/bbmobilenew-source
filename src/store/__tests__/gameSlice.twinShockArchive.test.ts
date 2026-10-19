import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, resetGame } from '../gameSlice'

describe('per-season Twin Shock archives', () => {
  it('repairs a legacy current-season archive using the activation season marker', () => {
    const initial = createInitialGameState({ seed: 23 })
    const state = {
      ...initial,
      season: 4,
      twinShockConsumed: true,
      twinShockActivatedSeason: 3,
      seasonArchives: [
        {
          seasonIndex: 4,
          seasonId: 'season-4',
          twinShockConsumed: true,
          playerSummaries: [],
        },
      ],
    }

    const next = gameReducer(state, resetGame())

    expect(next.season).toBe(5)
    expect(next.seasonArchives?.[0]?.twinShockConsumed).toBe(false)
    expect(next.twinShockConsumed).toBe(true)
  })

  it('infers the original Twin Shock season when a legacy save has repeated flags', () => {
    const initial = createInitialGameState({ seed: 29 })
    const state = {
      ...initial,
      season: 4,
      twinShockConsumed: true,
      twinShockActivatedSeason: null,
      seasonArchives: [
        { seasonIndex: 3, seasonId: 'season-3', twinShockConsumed: true, playerSummaries: [] },
        { seasonIndex: 4, seasonId: 'season-4', twinShockConsumed: true, playerSummaries: [] },
      ],
    }

    const next = gameReducer(state, resetGame())

    expect(next.seasonArchives?.map((archive) => archive.twinShockConsumed)).toEqual([true, false])
    expect(next.twinShockConsumed).toBe(true)
  })
})
