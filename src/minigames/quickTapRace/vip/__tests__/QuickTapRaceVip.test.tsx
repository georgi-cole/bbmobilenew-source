import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuickTapRaceVip from '../QuickTapRaceVip'
import { buildQuickTapVipSeasons } from '../quickTapVipLogic'

vi.mock('../../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(async () => undefined) },
}))
const participants = Array.from({ length: 16 }, (_, i) => ({
  id: `player-${i}`,
  name: i === 0 ? 'You' : `AI ${i}`,
  isHuman: i === 0,
  precomputedScore: 999,
  previousPR: null,
}))
function mount(mode: 'race' | 'seasons', seed = 424242) {
  const onFinish = vi.fn()
  const store = configureStore({ reducer: { game: (state = { players: [] }) => state } })
  render(
    <Provider store={store}>
      <QuickTapRaceVip
        mode={mode}
        seed={seed}
        autoStart
        participants={participants}
        onFinish={onFinish}
      />
    </Provider>
  )
  return onFinish
}
let elapsed = 0
async function advanceTo(time: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(time - elapsed)
  })
  elapsed = time
}
function tap() {
  fireEvent.keyDown(window, { code: 'Space', key: ' ' })
}

describe('VIP round lifecycle', () => {
  const originalRAF = window.requestAnimationFrame,
    originalCAF = window.cancelAnimationFrame
  beforeEach(() => {
    elapsed = 0
    vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  })
  afterEach(() => {
    cleanup()
    window.requestAnimationFrame = originalRAF
    window.cancelAnimationFrame = originalCAF
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('banks three Race rounds, rejects intermission taps and reports all 16 results once', async () => {
    const onFinish = mount('race')
    await advanceTo(32)
    tap()
    await advanceTo(64)
    expect(screen.getByTestId('vip-score')).toHaveTextContent('1')
    await advanceTo(25_100)
    expect(screen.getByText('Take a breath.')).toBeInTheDocument()
    tap()
    await advanceTo(25_200)
    expect(screen.getByTestId('vip-score')).toHaveTextContent('1')
    await advanceTo(29_100)
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-round', '2')
    tap()
    await advanceTo(58_100)
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-round', '3')
    tap()
    await advanceTo(83_100)
    expect(screen.getByText('THE FINAL PULSE')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Continue' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0][0]).toBe(3)
    expect(Object.keys(onFinish.mock.calls[0][2].rawResults)).toHaveLength(16)
    expect(onFinish.mock.calls[0][2].rawResults['player-0']).toBe(3)
  })

  it('keeps winter negative, hides next-round weather and resets the seasonal reroll', async () => {
    let seed = 0
    while (buildQuickTapVipSeasons(seed)[0] !== 'winter') seed++
    const schedule = buildQuickTapVipSeasons(seed)
    mount('seasons', seed)
    await advanceTo(32)
    tap()
    await advanceTo(64)
    expect(screen.getByTestId('vip-score')).toHaveTextContent('-1')
    await advanceTo(7_200)
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-season', schedule[1])
    fireEvent.click(screen.getByRole('button', { name: /Change season/ }))
    await advanceTo(7_400)
    expect(screen.getByRole('button', { name: /Change used/ })).toBeDisabled()
    await advanceTo(28_100)
    expect(screen.getByText('Take a breath.')).toBeInTheDocument()
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-season', schedule[3])
    await advanceTo(32_100)
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-round', '2')
    expect(screen.getByTestId('quick-tap-vip')).toHaveAttribute('data-season', schedule[4])
    expect(screen.getByRole('button', { name: /Change season/ })).toBeEnabled()
  })
})
