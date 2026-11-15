import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDispatch, RootState } from '../../store/store'
import { showRewarded } from '../../services/ads/adsService'
import { setAdRequestFailure } from '../../services/ads/adAvailability'
import { requestRewardedPrompt } from './rewardedPromptRequest'

vi.mock('../../services/ads/adsService', () => ({ showRewarded: vi.fn(() => true) }))
vi.mock('../../services/ads/adAvailability', () => ({
  getAdAvailabilityMessage: vi.fn(() => null),
  setAdRequestFailure: vi.fn(),
}))

function request() {
  const onReward = vi.fn()
  const setPending = vi.fn()
  requestRewardedPrompt({
    placement: 'eviction_vote_breakdown',
    state: {} as RootState,
    dispatch: vi.fn() as AppDispatch,
    onReward,
    setPending,
  })
  return { onReward, setPending }
}

describe('rewarded prompt request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(showRewarded).mockReturnValue(true)
  })

  it('clears pending after an unearned dismissal and leaves the reward locked', () => {
    const { onReward, setPending } = request()
    expect(setPending).toHaveBeenLastCalledWith(true)
    vi.mocked(showRewarded).mock.calls[0]![4]!.onDismissed!()
    expect(setPending).toHaveBeenLastCalledWith(false)
    expect(onReward).not.toHaveBeenCalled()
    expect(setAdRequestFailure).toHaveBeenCalledWith(expect.stringContaining('try again'))
  })

  it('clears pending when the native request cannot start without unlocking the reward', () => {
    vi.mocked(showRewarded).mockReturnValue(false)
    const { onReward, setPending } = request()
    expect(setPending.mock.calls).toEqual([[true], [false]])
    expect(onReward).not.toHaveBeenCalled()
  })

  it('grants only the earned reward and releases pending even when the reward handler fails', () => {
    const { onReward, setPending } = request()
    onReward.mockImplementation(() => {
      throw new Error('screen transition failed')
    })
    expect(() => vi.mocked(showRewarded).mock.calls[0]![3]()).toThrow('screen transition failed')
    expect(onReward).toHaveBeenCalledOnce()
    expect(setPending).toHaveBeenLastCalledWith(false)
    expect(setAdRequestFailure).toHaveBeenLastCalledWith(null)
  })
})
