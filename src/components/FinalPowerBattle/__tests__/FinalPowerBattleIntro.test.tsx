import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import FinalPowerBattleIntro from '../FinalPowerBattleIntro'

const finalists = createInitialGameState({ seed: 315 }).players.slice(0, 3)

describe('FinalPowerBattleIntro', () => {
  it('shows one separate beat at a time and advances only when Play is pressed', () => {
    const onComplete = vi.fn()
    render(<FinalPowerBattleIntro finalists={finalists} mode="classic" onComplete={onComplete} />)

    expect(screen.getByRole('region', { name: 'Final Power Battle introduction' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { name: 'The Final Power Battle' })).toBeTruthy()
    expect(screen.getByText('Press Play to continue.')).toBeTruthy()

    expect(screen.queryByRole('heading', { name: 'One advances' })).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(screen.getByRole('heading', { name: 'One advances' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'The Final Power Battle' })).toBeNull()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(screen.getByRole('heading', { name: 'One last place' })).toBeTruthy()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(screen.getByRole('heading', { name: 'Power changes everything' })).toBeTruthy()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(screen.getByText('Press Play to begin Part 1.')).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('advances only one beat per Play press without starting the game early', () => {
    const onComplete = vi.fn()
    render(
      <FinalPowerBattleIntro finalists={finalists} mode="vox_populi" onComplete={onComplete} />
    )

    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(screen.getByRole('heading', { name: 'One advances' })).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('describes the audience-led Part 3 correctly in Vox Populi', () => {
    render(<FinalPowerBattleIntro finalists={finalists} mode="vox_populi" onComplete={vi.fn()} />)

    for (let beat = 0; beat < 3; beat += 1) {
      act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    }
    expect(screen.getByText(/audience decides the last final two place/i)).toBeTruthy()
  })
})
