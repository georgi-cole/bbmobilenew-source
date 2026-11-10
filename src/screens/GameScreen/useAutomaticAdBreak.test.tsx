import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSurvivorRun } from '../../modes/survivorRun'
import { installSafetyFixture } from '../../safety/__tests__/safetyFixture'
import adsReducer from '../../store/adsSlice'
import type { AppDispatch, RootState } from '../../store/store'
import { invalidateAdMobRequests } from '../../services/ads/admobBridge'
import { useAutomaticAdBreak } from './useAutomaticAdBreak'

vi.mock('../../services/ads/admobBridge', () => ({ invalidateAdMobRequests: vi.fn() }))

function setup() {
  let state = {
    game: { ...createSurvivorRun(), phase: 'week_end' },
    ads: adsReducer(undefined, { type: 'init' }),
    vip: { isActive: false, entitlements: { noAds: false } },
  } as RootState
  const dispatch = vi.fn((action) => {
    state = { ...state, ads: adsReducer(state.ads, action) }
    return action
  }) as unknown as AppDispatch
  const getState = () => state
  return {
    getState,
    dispatch,
    update: (change: Partial<RootState>) => {
      state = { ...state, ...change }
    },
    render: (blocked = false) =>
      renderHook(
        ({ presentationBlocked }) =>
          useAutomaticAdBreak({ game: state.game, dispatch, getState, presentationBlocked }),
        { initialProps: { presentationBlocked: blocked } }
      ),
  }
}

describe('automatic Survival ad boundary', () => {
  beforeEach(() => {
    installSafetyFixture(28, ['ads'])
    window.GameAds = {
      showInterstitial: vi.fn().mockResolvedValue(true),
      showRewarded: vi.fn(),
    }
  })

  afterEach(() => {
    delete window.GameAds
    vi.clearAllMocks()
  })

  it('keeps controls blocked after the announcement until the native ad actually closes', async () => {
    let finish!: (shown: boolean) => void
    window.GameAds!.showInterstitial = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    )
    const harness = setup()
    const { result } = harness.render()
    expect(result.current.announcement?.title).toBe('SHORT BREAK')
    expect(result.current.active).toBe(true)

    act(() => result.current.dismissAnnouncement())
    expect(window.GameAds!.showInterstitial).toHaveBeenCalledWith('survival_elimination_auto')
    expect(result.current.announcement).toBeNull()
    expect(result.current.active).toBe(true)
    act(() => result.current.dismissAnnouncement())
    expect(window.GameAds!.showInterstitial).toHaveBeenCalledOnce()

    await act(async () => finish(true))
    await waitFor(() => expect(result.current.active).toBe(false))
  })

  it('waits for elimination and replacement presentations before queuing the break', () => {
    const harness = setup()
    const { result, rerender } = harness.render(true)
    expect(result.current.announcement).toBeNull()
    expect(harness.getState().ads.automaticBreaks).toEqual({})

    rerender({ presentationBlocked: false })
    expect(result.current.announcement?.title).toBe('SHORT BREAK')
    expect(Object.keys(harness.getState().ads.automaticBreaks)).toHaveLength(1)
  })

  it('does not repeat the same completed-day break after remounting', async () => {
    const harness = setup()
    const first = harness.render()
    await act(async () => first.result.current.dismissAnnouncement())
    await waitFor(() => expect(first.result.current.active).toBe(false))
    first.unmount()

    const second = harness.render()
    expect(second.result.current.announcement).toBeNull()
    expect(window.GameAds!.showInterstitial).toHaveBeenCalledOnce()
  })

  it('queues another break after the next completed day', async () => {
    const harness = setup()
    const { result, rerender } = harness.render()
    await act(async () => result.current.dismissAnnouncement())
    await waitFor(() => expect(result.current.active).toBe(false))

    harness.update({ game: { ...harness.getState().game, week: 2, phase: 'week_start' } })
    rerender({ presentationBlocked: false })
    expect(result.current.active).toBe(false)
    harness.update({ game: { ...harness.getState().game, phase: 'week_end' } })
    rerender({ presentationBlocked: false })
    expect(result.current.announcement?.title).toBe('SHORT BREAK')
    expect(Object.keys(harness.getState().ads.automaticBreaks)).toHaveLength(2)
  })

  it('does not interrupt a failed run or revive into an automatic ad', () => {
    const harness = setup()
    const game = harness.getState().game
    harness.update({
      game: {
        ...game,
        status: 'failed',
        players: game.players.map((player) =>
          player.isUser ? { ...player, status: 'evicted' } : player
        ),
      },
    })
    const { result, rerender } = harness.render()
    expect(result.current.active).toBe(false)
    harness.update({ game: { ...game, status: 'active', phase: 'week_start' } })
    rerender({ presentationBlocked: false })
    expect(result.current.active).toBe(false)
    expect(window.GameAds!.showInterstitial).not.toHaveBeenCalled()
  })

  it('skips the announcement for VIP, No Ads and missing native bridges', () => {
    for (const type of ['vip', 'noAds', 'missing'] as const) {
      const harness = setup()
      if (type === 'vip') {
        harness.update({ vip: { ...harness.getState().vip, isActive: true } })
      } else if (type === 'noAds') {
        harness.update({ ads: { ...harness.getState().ads, hasNoAdsPack: true } })
      } else delete window.GameAds
      const rendered = harness.render()
      expect(rendered.result.current.active).toBe(false)
      expect(harness.getState().ads.automaticBreaks).toEqual({})
      rendered.unmount()
    }
  })

  it('releases the break when an ad fails instead of trapping the player', async () => {
    window.GameAds!.showInterstitial = vi.fn().mockResolvedValue(false)
    const harness = setup()
    const { result } = harness.render()
    await act(async () => result.current.dismissAnnouncement())
    await waitFor(() => expect(result.current.active).toBe(false))
    expect(harness.getState().ads.dailyUsage).toEqual({})
  })

  it('invalidates a loading ad when leaving the screen', () => {
    window.GameAds!.showInterstitial = vi.fn(() => new Promise<boolean>(() => undefined))
    const harness = setup()
    const { result, unmount } = harness.render()
    act(() => result.current.dismissAnnouncement())
    unmount()
    expect(invalidateAdMobRequests).toHaveBeenCalledOnce()
  })
})
