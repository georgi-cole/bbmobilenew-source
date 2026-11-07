import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FinalOverrideChallenge from '../../../src/components/FinalThreeCircuit/FinalOverrideChallenge'
import { buildFinalOverrideRounds } from '../../../src/components/FinalThreeCircuit/finalOverrideQuestionBank'

afterEach(() => {
  vi.useRealTimers()
})

describe('Final Override completion', () => {
  it('shows a terminal result and hands it back when the player locks it in', () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(<FinalOverrideChallenge seed={424242} stake={0.4} onFinish={onFinish} />)

    for (const round of buildFinalOverrideRounds(424242)) {
      expect(screen.getByText(round.prompt)).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: round.correct }))
      act(() => {
        vi.advanceTimersByTime(300)
      })
    }

    expect(screen.getByText('Override accepted')).toBeVisible()
    expect(screen.getByText('5 correct')).toBeVisible()
    expect(onFinish).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Lock in result' }))
    expect(onFinish).toHaveBeenCalledWith(true)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
