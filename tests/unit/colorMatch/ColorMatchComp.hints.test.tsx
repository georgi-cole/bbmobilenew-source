import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ColorMatchComp from '../../../src/components/ColorMatchComp/ColorMatchComp'

vi.mock('../../../src/hooks/useSound', () => ({
  default: () => ({ play: vi.fn() }),
}))

vi.mock('../../../src/minigames/competitionResultContext', () => ({
  useCompetitionResultCheckpoint: vi.fn(),
}))

describe('Color Match hint feedback', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps exact match feedback hidden until a hint is purchased and applies the stated penalty', () => {
    vi.useFakeTimers()
    const view = render(<ColorMatchComp seed={42} />)

    act(() => {
      vi.advanceTimersByTime(1600)
    })

    const accuracyValue = () => view.container.querySelector('.cm__accuracy-val')?.textContent
    expect(accuracyValue()).toBe('?')
    expect(screen.getByText('buy hint to reveal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /buy hint/i }))
    const warning = screen.getByRole('dialog', { name: /hint purchase warning/i })
    expect(warning).toHaveTextContent('5%')
    expect(warning).toHaveTextContent('reveal your % match')
    expect(accuracyValue()).toBe('?')

    fireEvent.click(within(warning).getByRole('button', { name: /cancel/i }))
    expect(accuracyValue()).toBe('?')
    expect(screen.getByText('-0% final score')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /buy hint/i }))
    const confirmedWarning = screen.getByRole('dialog', { name: /hint purchase warning/i })
    fireEvent.click(within(confirmedWarning).getByRole('button', { name: /^buy hint$/i }))

    expect(accuracyValue()).toMatch(/^\d+%$/)
    expect(screen.getByText('-5% final score')).toBeInTheDocument()
    expect(screen.getByTestId('hint-panel')).toBeInTheDocument()
  })
})
