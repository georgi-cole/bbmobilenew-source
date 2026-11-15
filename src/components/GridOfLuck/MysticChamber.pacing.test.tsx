import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MysticChamber from './MysticChamber'

vi.mock('./chamberGame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chamberGame')>()),
  chooseChamberAiAction: () => ({ action: 'surge' }),
}))

afterEach(() => vi.useRealTimers())

describe('Mystic Chamber manual AI pacing', () => {
  it('leaves time to read the choice and activation, then waits for Continue', () => {
    vi.useFakeTimers()
    const { container } = render(
      <MysticChamber
        seed={42}
        participants={['Aria', 'Kai'].map((name) => ({
          id: name.toLowerCase(),
          name,
          isHuman: false,
          precomputedScore: 0,
          previousPR: null,
        }))}
      />
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-advance AI turns' }))
    act(() => vi.advanceTimersByTime(1599))
    expect(screen.getByRole('heading', { name: /is weighing the offers/ })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(container.querySelector('.mystic-chamber__activation')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2399))
    expect(container.querySelector('.mystic-chamber__activation')).toBeInTheDocument()
    expect(container.querySelector('.mystic-chamber__result')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    const result = container.querySelector('.mystic-chamber__result')!
    const text = result.textContent
    act(() => vi.advanceTimersByTime(10000))
    expect(result).toBeInTheDocument()
    expect(result.textContent).toBe(text)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: /is weighing the offers/ })).toBeInTheDocument()
  })
})
