import { describe, expect, it } from 'vitest'
import type { EyeoleanRewardLine } from '../economy/eyeoleans'
import profilesReducer, {
  createProfile,
  purchaseEyeoleanStoreProduct,
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
      })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:second',
        productKey: 'extra_vote',
      })
    )
    state = profilesReducer(
      state,
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:remove-vote:first',
        productKey: 'remove_vote',
      })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(109_000)
    expect(profile.eyeoleanInventory).toEqual({
      extra_vote: 2,
      remove_vote: 1,
    })
    expect(profile.eyeoleanTransactions?.slice(-3).map((entry) => entry.amount)).toEqual([
      -3_000, -3_000, -5_000,
    ])
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
    })
    state = profilesReducer(state, purchase)
    state = profilesReducer(state, purchase)

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(115_000)
    expect(profile.eyeoleanInventory?.remove_vote).toBe(1)
  })

  it('does not overdraw the wallet when an Eyeolean product is unaffordable', () => {
    const state = profilesReducer(
      profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' })),
      purchaseEyeoleanStoreProduct({
        transactionId: 'store:extra-vote:no-funds',
        productKey: 'extra_vote',
      })
    )

    expect(state.profiles[0]?.eyeoleans).toBe(0)
    expect(state.profiles[0]?.eyeoleanInventory).toEqual({})
    expect(state.profiles[0]?.eyeoleanTransactions).toEqual([])
  })
})
