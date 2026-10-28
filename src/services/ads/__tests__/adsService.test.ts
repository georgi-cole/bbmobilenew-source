import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSafetyFixture } from '../../../safety/__tests__/safetyFixture'
import { declarePlayerAge, setOptionalPlayerFeature } from '../../../safety/playerSafety'
import type { RootState } from '../../../store/store'
import {
  canShowAd,
  clearRewardHandler,
  initAdBridge,
  showInterstitial,
  showRewarded,
} from '../adsService'

function makeState(
  overrides?: Partial<RootState['ads']>,
  vipOverrides?: Partial<RootState['vip']>
): RootState {
  return {
    game: { players: [{ id: 'human', isUser: true }] },
    ads: {
      hasNoAdsPack: false,
      dailyUsage: {},
      automaticBreaks: {},
      lastCompLastPlaceType: null,
      ...overrides,
    },
    vip: {
      isActive: false,
      entitlements: {
        survivalMode: false,
        publicMode: false,
        tribunalHouse: false,
        dramaMode: false,
        noAds: false,
      },
      ...vipOverrides,
    },
  } as RootState
}

describe('adsService bridge guards', () => {
  beforeEach(() => {
    installSafetyFixture(28, ['ads'])
  })
  afterEach(() => {
    vi.restoreAllMocks()
    clearRewardHandler('social_energy_recharge')
    delete window.GameAds
    delete window.onAdRewardGranted
  })

  it('does not call an ad bridge for a teen or grant an old pending adult reward', () => {
    const bridge = vi.fn()
    const reward = vi.fn()
    window.GameAds = { showInterstitial: bridge, showRewarded: bridge }
    initAdBridge()
    expect(showRewarded('social_energy_recharge', makeState(), vi.fn(), reward)).toBe(true)
    declarePlayerAge(15)
    expect(showInterstitial('live_vote_auto', makeState(), vi.fn())).toBe(false)
    expect(showRewarded('social_energy_recharge', makeState(), vi.fn(), reward)).toBe(false)
    window.onAdRewardGranted?.('social_energy_recharge')
    expect(bridge).toHaveBeenCalledOnce()
    expect(reward).not.toHaveBeenCalled()
  })

  it('requires adult advertising opt-in', () => {
    setOptionalPlayerFeature('ads', false)
    const bridge = vi.fn()
    window.GameAds = { showInterstitial: bridge, showRewarded: bridge }
    expect(showInterstitial('live_vote_auto', makeState(), vi.fn())).toBe(false)
    expect(bridge).not.toHaveBeenCalled()
  })

  it('does not record usage for interstitials when the native bridge is missing', () => {
    const dispatch = vi.fn()

    expect(showInterstitial('live_vote_auto', makeState(), dispatch)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not record usage for rewarded ads when the native bridge is missing', () => {
    const dispatch = vi.fn()

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('records rewarded usage only after completion, not merely a request', () => {
    const dispatch = vi.fn()
    const showRewardedBridge = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: showRewardedBridge,
    }

    initAdBridge()
    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    window.onAdRewardGranted?.('social_energy_recharge')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ads/recordAdShown',
        payload: 'social_energy_recharge',
      })
    )
    expect(showRewardedBridge).toHaveBeenCalledWith('social_energy_recharge')
  })

  it('grants the centralized +6 social-energy reward after completion', () => {
    const dispatch = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(),
    }
    initAdBridge()

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(true)
    window.onAdRewardGranted?.('social_energy_recharge')

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'social/setEnergyBankEntry',
        payload: expect.objectContaining({ value: 6 }),
      })
    )
  })

  it('removes the reward handler before invoking it so re-entrant callbacks cannot grant twice', () => {
    const dispatch = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(),
    }
    initAdBridge()
    const onReward = vi.fn(() => {
      window.onAdRewardGranted?.('social_energy_recharge', { source: 'duplicate' })
    })

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, onReward)).toBe(true)
    window.onAdRewardGranted?.('social_energy_recharge', { source: 'native' })
    window.onAdRewardGranted?.('social_energy_recharge', { source: 'late-duplicate' })

    expect(onReward).toHaveBeenCalledTimes(1)
    expect(onReward).toHaveBeenCalledWith({ source: 'native' })
  })

  it('allows only one in-flight rewarded request for the same placement', () => {
    const dispatch = vi.fn()
    const showRewardedBridge = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: showRewardedBridge,
    }

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(true)
    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(showRewardedBridge).toHaveBeenCalledTimes(1)
  })

  it('recovers when the rewarded native bridge throws without recording usage', () => {
    const dispatch = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(() => {
        throw new Error('native rewarded bridge failed')
      }),
    }

    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()

    window.GameAds.showRewarded = vi.fn()
    expect(showRewarded('social_energy_recharge', makeState(), dispatch, vi.fn())).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('releases a cancelled native reward without consuming its daily allowance', async () => {
    const dispatch = vi.fn()
    const onReward = vi.fn()
    const onDismissed = vi.fn()
    window.GameAds = { showInterstitial: vi.fn(), showRewarded: vi.fn().mockResolvedValue(false) }
    initAdBridge()
    expect(
      showRewarded('social_energy_recharge', makeState(), dispatch, onReward, { onDismissed })
    ).toBe(true)
    await vi.waitFor(() => expect(onDismissed).toHaveBeenCalledOnce())
    expect(dispatch).not.toHaveBeenCalled()
    expect(onReward).not.toHaveBeenCalled()
    expect(showRewarded('social_energy_recharge', makeState(), dispatch, onReward)).toBe(true)
    await Promise.resolve()
  })

  it('grants exactly once when the asynchronous native request earns its reward', async () => {
    const dispatch = vi.fn()
    const onReward = vi.fn()
    window.GameAds = { showInterstitial: vi.fn(), showRewarded: vi.fn().mockResolvedValue(true) }
    initAdBridge()
    expect(showRewarded('social_energy_recharge', makeState(), dispatch, onReward)).toBe(true)
    await vi.waitFor(() => expect(onReward).toHaveBeenCalledOnce())
    window.onAdRewardGranted?.('social_energy_recharge')
    expect(onReward).toHaveBeenCalledOnce()
    expect(
      dispatch.mock.calls.filter(([action]) => action.type === 'ads/recordAdShown')
    ).toHaveLength(1)
  })

  it('does not grant a late native result to a replacement request', async () => {
    let complete!: (earned: boolean) => void
    window.GameAds = {
      showInterstitial: vi.fn(),
      showRewarded: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            complete = resolve
          })
      ),
    }
    initAdBridge()
    const oldReward = vi.fn()
    const newReward = vi.fn()
    showRewarded('social_energy_recharge', makeState(), vi.fn(), oldReward)
    const oldComplete = complete
    clearRewardHandler('social_energy_recharge')
    showRewarded('social_energy_recharge', makeState(), vi.fn(), newReward)
    oldComplete(true)
    await Promise.resolve()
    expect(oldReward).not.toHaveBeenCalled()
    expect(newReward).not.toHaveBeenCalled()
    complete(false)
    await Promise.resolve()
  })

  it('recovers when the interstitial native bridge throws without recording usage', () => {
    const dispatch = vi.fn()
    window.GameAds = {
      showInterstitial: vi.fn(() => {
        throw new Error('native interstitial bridge failed')
      }),
      showRewarded: vi.fn(),
    }

    expect(showInterstitial('live_vote_auto', makeState(), dispatch)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('canShowAd guard logic', () => {
  it('blocks automatic interstitials when the legacy No Ads Pack is owned', () => {
    expect(canShowAd('live_vote_auto', makeState({ hasNoAdsPack: true }))).toBe(false)
  })

  it('blocks automatic interstitials for standalone No Ads owners', () => {
    expect(
      canShowAd(
        'live_vote_auto',
        makeState(undefined, {
          entitlements: {
            survivalMode: false,
            publicMode: false,
            tribunalHouse: false,
            dramaMode: false,
            cupidArrow: false,
            voxPopuli: false,
            premiumChallenges: false,
            noAds: true,
          },
        })
      )
    ).toBe(false)
  })

  it('blocks automatic interstitials for VIP owners', () => {
    expect(canShowAd('live_vote_auto', makeState(undefined, { isActive: true }))).toBe(false)
  })

  it('does not block voluntary rewarded ads when No Ads Pack is owned', () => {
    expect(canShowAd('social_energy_recharge', makeState({ hasNoAdsPack: true }))).toBe(true)
    expect(canShowAd('public_meter_audience_insight', makeState({ hasNoAdsPack: true }))).toBe(true)
    expect(canShowAd('competition_retry', makeState({ hasNoAdsPack: true }))).toBe(true)
  })

  it('does not block voluntary rewarded ads for VIP owners', () => {
    expect(
      canShowAd('public_meter_audience_insight', makeState(undefined, { isActive: true }))
    ).toBe(true)
  })

  it('blocks competition_retry during the final-3 week', () => {
    expect(canShowAd('competition_retry', makeState(), { isFinal3Week: true })).toBe(false)
  })

  it('allows competition_retry outside the final-3 week', () => {
    expect(canShowAd('competition_retry', makeState(), { isFinal3Week: false })).toBe(true)
    expect(canShowAd('competition_retry', makeState())).toBe(true)
  })

  it('blocks daily-limited placements when already shown today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(
      canShowAd(
        'social_energy_recharge',
        makeState({ dailyUsage: { social_energy_recharge: today } })
      )
    ).toBe(false)
  })

  it('allows daily-limited placements when last shown on a different day', () => {
    expect(
      canShowAd(
        'social_energy_recharge',
        makeState({ dailyUsage: { social_energy_recharge: '2000-01-01' } })
      )
    ).toBe(true)
  })
})
