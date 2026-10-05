import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import FinalPowerBattleIntro from '../FinalPowerBattleIntro'

const finalists = createInitialGameState({ seed: 315 }).players.slice(0, 3)

afterEach(() => {
  vi.useRealTimers()
})

describe('FinalPowerBattleIntro', () => {
  it('plays its five faux-TV beats and waits for Play before Part 1', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<FinalPowerBattleIntro finalists={finalists} mode="classic" onComplete={onComplete} />)

    expect(screen.getByRole('region', { name: 'Final Power Battle introduction' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'The Final Power Battle' })).toBeTruthy()

    act(() => vi.advanceTimersByTime(2200))
    expect(screen.getByRole('heading', { name: 'One advances' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(2600))
    expect(screen.getByRole('heading', { name: 'One last place' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(2600))
    expect(screen.getByRole('heading', { name: 'Power changes everything' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(2600))
    expect(screen.getByText('Press Play to begin Part 1.')).toBeTruthy()

    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('lets an early Play skip to the ready beat without advancing the game', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(
      <FinalPowerBattleIntro finalists={finalists} mode="vox_populi" onComplete={onComplete} />
    )

    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(screen.getByText('Press Play to begin Part 1.')).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('describes the audience-led Part 3 correctly in Vox Populi', () => {
    vi.useFakeTimers()
    render(<FinalPowerBattleIntro finalists={finalists} mode="vox_populi" onComplete={vi.fn()} />)

    act(() => vi.advanceTimersByTime(2200))
    act(() => vi.advanceTimersByTime(2600))
    act(() => vi.advanceTimersByTime(2600))
    expect(screen.getByText(/audience decides the last final two place/i)).toBeTruthy()
  })
})
