import { describe, expect, it } from 'vitest'
import type { EyeoleanRewardLine } from '../economy/eyeoleans'
import profilesReducer, {
  armEyeoleanStorePower,
  consumeEyeoleanStorePower,
  createProfile,
  debugGrantEyeoleans,
  purchaseEyeoleanStoreProduct,
  returnEyeoleanStorePower,
  settleSeasonEyeoleans,
  spendEyeoleans,
} from './profilesSlice'

const REWARDS: EyeoleanRewardLine[] = [
  {
    code: 'season_winner',
    label: 'Season winner',
    quantity: 1,
    unitAmount: 100_000,
    amount: 100_000,
  },
  {
    code: 'loh_win',
    label: 'LOH win',
    quantity: 2,
    unitAmount: 10_000,
    amount: 20_000,
  },
]

describe('Eyeolean profile wallet', () => {
  it('supports an idempotent QA-only wallet grant', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    const grant = debugGrantEyeoleans({ grantId: 'wallet-test', amount: 5_000_000 })
    state = profilesReducer(state, grant)
    state = profilesReducer(state, grant)

    expect(state.profiles[0]?.eyeoleans).toBe(5_000_000)
    expect(state.profiles[0]?.eyeoleanTransactions).toHaveLength(1)
    expect(state.profiles[0]?.eyeoleanTransactions?.[0]).toMatchObject({
      id: 'qa-grant:wallet-test',
      amount: 5_000_000,
      source: 'adjustment',
      label: 'QA wallet grant',
    })
  })

  it('settles a season once even when the finale is reopened', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))

    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(120_000)
    expect(profile.eyeoleanTransactions).toHaveLength(2)
    expect(profile.settledEyeoleanSeasonIds).toEqual(['eyeoleans:season:1:game-a'])
  })

  it('keeps purchase idempotency even when an old transaction is no longer in the display ledger', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )

    const profileId = state.activeProfileId
    state = {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              eyeoleanTransactions: [],
              processedEyeoleanTransactionIds: ['store:old-skin'],
            }
          : profile
      ),
    }

    state = profilesReducer(
      state,
      spendEyeoleans({ transactionId: 'store:old-skin', amount: 20_000, label: 'Old Skin' })
    )

    expect(state.profiles[0]?.eyeoleans).toBe(120_000)
    expect(state.profiles[0]?.eyeoleanTransactions).toHaveLength(0)
  })

  it('rejects non-finite credits and debits without corrupting the wallet', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))

    state = profilesReducer(
      state,
      settleSeasonEyeoleans({
        seasonId: 'eyeoleans:season:bad-credit',
        rewards: [
          {
            code: 'loh_win',
            label: 'LOH win',
            quantity: 1,
            unitAmount: Number.NaN,
            amount: Number.NaN,
          },
        ],
      })
    )
    state = profilesReducer(
      state,
      spendEyeoleans({ transactionId: 'store:bad-debit', amount: Number.NaN, label: 'Invalid' })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(0)
    expect(profile.eyeoleanTransactions).toEqual([])
  })

  it('spends atomically and never permits duplicate or overdrawn purchases', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )

    state = profilesReducer(
      state,
      spendEyeoleans({ transactionId: 'store:skin-1', amount: 50_000, label: 'Skin 1' })
    )
    state = profilesReducer(
      state,
      spendEyeoleans({ transactionId: 'store:skin-1', amount: 50_000, label: 'Skin 1' })
    )
    state = profilesReducer(
      state,
      spendEyeoleans({ transactionId: 'store:too-expensive', amount: 80_000, label: 'Locked' })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(70_000)
    expect(profile.eyeoleanTransactions).toHaveLength(3)
    expect(profile.eyeoleanTransactions?.at(-1)?.amount).toBe(-50_000)
  })
  it('buys repeatable Eyeolean consumables at canonical catalog prices', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )

    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:first',
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
      })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:second',
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
      })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:remove-vote:first',
        productKey: 'remove_vote',
        gameId: 'game-a',
        season: 1,
      })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(55_000)
    expect(profile.eyeoleanInventory).toEqual({
      extra_vote: 2,
      remove_vote: 1,
    })
    expect(profile.eyeoleanTransactions?.slice(-3).map((entry) => entry.amount)).toEqual([
      -15_000, -25_000, -25_000,
    ])
    expect(profile.eyeoleanPowerSeasonProgress).toMatchObject({
      extra_vote: { gameId: 'game-a', season: 1, purchases: 2, uses: 0 },
      remove_vote: { gameId: 'game-a', season: 1, purchases: 1, uses: 0 },
    })
  })

  it('caps Store purchases at two per power per season and resets the tier next season', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      debugGrantEyeoleans({ grantId: 'season-stock', amount: 100_000 })
    )

    for (const transactionId of ['first', 'second', 'third']) {
      state = profilesReducer(
        state,
        purchaseEyeoleanStoreProduct({
          transactionId: `store:extra-vote:${transactionId}`,
          productKey: 'extra_vote',
          gameId: 'game-a',
          season: 1,
        })
      )
    }

    expect(state.profiles[0]?.eyeoleans).toBe(60_000)
    expect(state.profiles[0]?.eyeoleanInventory?.extra_vote).toBe(2)
    expect(state.profiles[0]?.eyeoleanPowerSeasonProgress?.extra_vote).toMatchObject({
      gameId: 'game-a',
      season: 1,
      purchases: 2,
      uses: 0,
    })

    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:new-season',
        productKey: 'extra_vote',
        gameId: 'game-b',
        season: 2,
      })
    )

    expect(state.profiles[0]?.eyeoleans).toBe(45_000)
    expect(state.profiles[0]?.eyeoleanInventory?.extra_vote).toBe(3)
    expect(state.profiles[0]?.eyeoleanPowerSeasonProgress?.extra_vote).toMatchObject({
      gameId: 'game-b',
      season: 2,
      purchases: 1,
      uses: 0,
    })
  })

  it('does not duplicate inventory or charge twice when a store transaction is replayed', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )

    const purchase = purchaseEyeoleanStoreProduct({
      transactionId: 'store:remove-vote:stable',
      productKey: 'remove_vote',
      gameId: 'game-a',
      season: 1,
    })
    state = profilesReducer(state, purchase)
    state = profilesReducer(state, purchase)

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(95_000)
    expect(profile.eyeoleanInventory?.remove_vote).toBe(1)
  })

  it('does not overdraw the wallet when an Eyeolean product is unaffordable', () => {
    const state = profilesReducer(
      profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' })),
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:no-funds',
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
      })
    )

    expect(state.profiles[0]?.eyeoleans).toBe(0)
    expect(state.profiles[0]?.eyeoleanInventory).toEqual({})
    expect(state.profiles[0]?.eyeoleanTransactions).toEqual([])
  })

  it('reserves one purchased power and returns it without loss when disarmed', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:reserve',
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
      })
    )

    state = profilesReducer(
      state,
      armEyeoleanStorePower({
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
        week: 3,
      })
    )

    expect(state.profiles[0]?.eyeoleanInventory?.extra_vote).toBe(0)
    expect(state.profiles[0]?.eyeoleanPowerReservations?.extra_vote).toMatchObject({
      productKey: 'extra_vote',
      gameId: 'game-a',
      season: 1,
      armedWeek: 3,
    })

    state = profilesReducer(
      state,
      returnEyeoleanStorePower({ productKey: 'extra_vote', gameId: 'game-a' })
    )

    expect(state.profiles[0]?.eyeoleanInventory?.extra_vote).toBe(1)
    expect(state.profiles[0]?.eyeoleanPowerReservations?.extra_vote).toBeUndefined()
  })

  it('consumes an armed power without refund only after gameplay confirms use', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      settleSeasonEyeoleans({ seasonId: 'eyeoleans:season:1:game-a', rewards: REWARDS })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:remove-vote:reserve',
        productKey: 'remove_vote',
        gameId: 'game-a',
        season: 1,
      })
    )
    state = profilesReducer(
      state,
      armEyeoleanStorePower({
        productKey: 'remove_vote',
        gameId: 'game-a',
        season: 1,
        week: 4,
      })
    )

    state = profilesReducer(
      state,
      consumeEyeoleanStorePower({ productKey: 'remove_vote', gameId: 'game-a' })
    )

    expect(state.profiles[0]?.eyeoleanInventory?.remove_vote).toBe(0)
    expect(state.profiles[0]?.eyeoleanPowerReservations?.remove_vote).toBeUndefined()
    expect(state.profiles[0]?.eyeoleans).toBe(95_000)
    expect(state.profiles[0]?.eyeoleanPowerSeasonProgress?.remove_vote).toMatchObject({
      gameId: 'game-a',
      season: 1,
      purchases: 1,
      uses: 1,
    })
  })

  it('caps resolved uses at two per power per season even when more inventory exists', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(state, debugGrantEyeoleans({ grantId: 'use-cap', amount: 100_000 }))

    for (const [transactionId, week] of [
      ['first', 3],
      ['second', 4],
    ] as const) {
      state = profilesReducer(
        state,
        purchaseEyeoleanStoreProduct({
          transactionId: `store:extra-vote:${transactionId}`,
          productKey: 'extra_vote',
          gameId: 'game-a',
          season: 1,
        })
      )
      state = profilesReducer(
        state,
        armEyeoleanStorePower({
          productKey: 'extra_vote',
          gameId: 'game-a',
          season: 1,
          week,
        })
      )
      state = profilesReducer(
        state,
        consumeEyeoleanStorePower({ productKey: 'extra_vote', gameId: 'game-a' })
      )
    }

    state = {
      ...state,
      profiles: state.profiles.map((profile, index) =>
        index === 0
          ? {
              ...profile,
              eyeoleanInventory: {
                ...(profile.eyeoleanInventory ?? {}),
                extra_vote: 1,
              },
            }
          : profile
      ),
    }
    state = profilesReducer(
      state,
      armEyeoleanStorePower({
        productKey: 'extra_vote',
        gameId: 'game-a',
        season: 1,
        week: 5,
      })
    )

    expect(state.profiles[0]?.eyeoleanPowerSeasonProgress?.extra_vote?.uses).toBe(2)
    expect(state.profiles[0]?.eyeoleanInventory?.extra_vote).toBe(1)
    expect(state.profiles[0]?.eyeoleanPowerReservations?.extra_vote).toBeUndefined()
  })
})
