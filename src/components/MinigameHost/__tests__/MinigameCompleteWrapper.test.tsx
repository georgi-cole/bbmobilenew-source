import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MinigameCompleteWrapper from '../MinigameCompleteWrapper'

describe('MinigameCompleteWrapper', () => {
  it('keeps an optional results panel around the hero, placements, and disabled action', () => {
    const onContinue = vi.fn()

    render(
      <MinigameCompleteWrapper
        className="fit-me-in-results"
        panelClassName="fit-me-in-results__panel"
        placementsClassName="fit-me-in-results__standings"
        placementsNode={
          <ol aria-label="Standings">
            <li>First</li>
          </ol>
        }
        onContinue={onContinue}
        continueLabel="Next round"
        continueDisabled
        continueButtonClassName="fit-me-in-results__continue"
      >
        <header>
          <h2>Semifinal complete</h2>
        </header>
      </MinigameCompleteWrapper>
    )

    const panel = document.querySelector('section.fit-me-in-results__panel')
    expect(panel).not.toBeNull()
    expect(
      within(panel as HTMLElement).getByRole('heading', { name: 'Semifinal complete' })
    ).toBeInTheDocument()
    expect(
      within(panel as HTMLElement).getByRole('list', { name: 'Standings' })
    ).toBeInTheDocument()

    const continueButton = within(panel as HTMLElement).getByRole('button', { name: 'Next round' })
    expect(continueButton).toBeDisabled()
    expect(continueButton).toHaveClass('fit-me-in-results__continue')
    fireEvent.click(continueButton)
    expect(onContinue).not.toHaveBeenCalled()
  })
})
