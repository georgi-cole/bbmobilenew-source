import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import FinaleTribunalStream from './FinaleTribunalStream'

describe('FinaleTribunalStream', () => {
  afterEach(() => vi.useRealTimers())

  it('reveals the Tribunal debate one message at a time and uses the standard back control', () => {
    vi.useFakeTimers()
    const players = createInitialGameState({ seed: 69021 }).players
    const defender = players[1]
    const challenger = players[2]
    const onClose = vi.fn()
    render(
      <FinaleTribunalStream
        players={players}
        onClose={onClose}
        speeches={[
          {
            speakerId: defender.id,
            speakerName: defender.name,
            stance: 'defend',
            text: 'They have earned their place in the finale.',
          },
          {
            speakerId: challenger.id,
            speakerName: challenger.name,
            stance: 'challenge',
            text: 'I still need to see a move worth rewarding.',
          },
        ]}
      />
    )

    const chat = screen.getByRole('log', { name: 'Tribunal conversation' })
    expect(within(chat).queryByText(defender.name)).not.toBeInTheDocument()
    expect(within(chat).queryByText(challenger.name)).not.toBeInTheDocument()
    expect(
      within(chat).getByRole('status', { name: 'Tribunal members are speaking' })
    ).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(700))
    expect(within(chat).getByText(defender.name)).toBeInTheDocument()
    expect(within(chat).getByText(/earned their place/)).toBeInTheDocument()
    expect(within(chat).queryByText(challenger.name)).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1150))
    expect(within(chat).getByText(challenger.name)).toBeInTheDocument()
    expect(within(chat).getByText(/move worth rewarding/)).toBeInTheDocument()
    expect(
      within(chat).queryByRole('status', { name: 'Tribunal members are speaking' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Back to the Final Three/i })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to the game' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
