import { describe, expect, it } from 'vitest'
import type { PlayerSeasonSummary } from '../store/seasonArchive'
import {
  computeSeasonEyeoleanRewards,
  EYEOLEAN_REWARD_AMOUNTS,
  totalEyeoleanRewards,
  PUBLIC_FAVORITE_FORECAST_EYEOLEANS,
} from './eyeoleans'

function summary(overrides: Partial<PlayerSeasonSummary> = {}): PlayerSeasonSummary {
  return {
    playerId: 'user',
    displayName: 'Player',
    finalPlacement: null,
    ...overrides,
  }
}

describe('Eyeolean season economy', () => {
  it('pays authoritative achievements additively, including winner + Public Favorite', () => {
    const rewards = computeSeasonEyeoleanRewards(
      summary({
        finalPlacement: 1,
        lohWins: 2,
        posWins: 1,
        battleBackWins: 1,
        wonPublicFavorite: true,
        wonFinalHoh: true,
        survivedDoubleEviction: true,
        survivedTripleEviction: true,
      })
    )

    expect(totalEyeoleanRewards(rewards)).toBe(163_000)
    expect(rewards.map((reward) => reward.code)).toEqual(
      expect.arrayContaining([
        'season_winner',
        'public_favorite',
        'final_loh',
        'loh_win',
        'pos_win',
        'battle_back_win',
        'survived_double_eviction',
        'survived_triple_eviction',
      ])
    )
  })

  it('uses the configured Public Favorite award instead of hardcoding the prize', () => {
    const rewards = computeSeasonEyeoleanRewards(summary({ wonPublicFavorite: true }), {
      publicFavoriteAwardAmount: 40_000,
    })

    expect(rewards).toEqual([
      {
        code: 'public_favorite',
        label: 'Public favorite',
        quantity: 1,
        unitAmount: 40_000,
        amount: 40_000,
      },
    ])
  })

  it('keeps repeatable volume out of the economy and ignores invalid counts', () => {
    const rewards = computeSeasonEyeoleanRewards(
      summary({
        lohWins: -2,
        posWins: Number.NaN,
        timesNominated: 12,
      })
    )

    expect(rewards).toEqual([])
    expect(EYEOLEAN_REWARD_AMOUNTS.publicFavorite).toBe(25_000)
    expect(PUBLIC_FAVORITE_FORECAST_EYEOLEANS).toBe(5_000)
  })
})
