import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickSectorIndex, WHEEL_SECTORS } from '../../../features/riskWheel/riskWheelSlice'
import { SoundManager } from '../../../services/sound/SoundManager'
import RiskWheelAbyss from './RiskWheelAbyss'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn() },
}))

const contestants = Array.from({ length: 13 }, (_, index) => ({
  id: `player-${index}`,
  name: `Contestant ${index}`,
  isHuman: index === 0,
  precomputedScore: 0,
  previousPR: null,
}))
const voidSeed = Array.from({ length: 100 }, (_, seed) => seed).find(
  (seed) => WHEEL_SECTORS[pickSectorIndex(seed, 0)].type === 'bankrupt'
)

function spin() {
  fireEvent.click(screen.getByRole('button', { name: 'Spin the wheel' }))
  expect(screen.getByRole('button', { name: 'Spinning…' })).toBeDisabled()
  const playback = vi
    .mocked(SoundManager.play)
    .mock.calls.find(([key]) => key === 'minigame:risk_wheel_spin')?.[1]
  expect(playback?.durationMs).toBeGreaterThan(0)
  expect(playback?.signal?.aborted).toBe(false)
  return playback!
}

describe('Risk Wheel: Abyss spin lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.mocked(SoundManager.play).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows the last spin before the balance handoff and stops the looping sound', () => {
    expect(voidSeed).toBeDefined()
    render(<RiskWheelAbyss participants={contestants} seed={voidSeed} />)
    const playback = spin()
    expect(screen.queryByRole('heading', { name: 'Pass your balance' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(playback.durationMs!))
    expect(playback.signal?.aborted).toBe(true)
    expect(screen.getByRole('heading', { name: 'Pass your balance' })).toBeInTheDocument()
    const roster = screen.getByRole('list', { name: 'Contestants' })
    fireEvent.click(within(roster).getByRole('button', { name: /^Contestant 1\b/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Seal handoff' }))
    expect(screen.queryByRole('heading', { name: 'Pass your balance' })).not.toBeInTheDocument()
    expect(
      vi.mocked(SoundManager.play).mock.calls.filter(([key]) => key === 'minigame:risk_wheel_spin')
    ).toHaveLength(1)
  })

  it('commits the pending spin and silences it immediately when the app is backgrounded', () => {
    render(<RiskWheelAbyss participants={contestants} seed={voidSeed} />)
    const playback = spin()
    fireEvent(document, new Event('pause'))
    expect(playback.signal?.aborted).toBe(true)
    expect(screen.getByRole('heading', { name: 'Pass your balance' })).toBeInTheDocument()
  })

  it('stops spin playback when leaving the competition', () => {
    const { unmount } = render(<RiskWheelAbyss participants={contestants} seed={voidSeed} />)
    const playback = spin()
    unmount()
    expect(playback.signal?.aborted).toBe(true)
  })

  it('does not start an automatic spin sound when the choice expires in the background', () => {
    render(<RiskWheelAbyss participants={contestants} seed={voidSeed} />)
    fireEvent(document, new Event('pause'))
    act(() => vi.advanceTimersByTime(20_000))
    expect(SoundManager.play).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Pass your balance' })).toBeInTheDocument()
  })
})
