import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FinaleControls from '../src/components/FinalFaceoff/FinaleControls'

describe('FinaleControls', () => {
  it('hides Skip All while a human ballot is pending', () => {
    render(
      <FinaleControls
        opening
        showOpeningCue={false}
        isComplete={false}
        onSkipAll={vi.fn()}
        onDismiss={vi.fn()}
        onPlay={vi.fn()}
      />
    )

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps Skip All usable during vote reveal even when all jurors are revealed', () => {
    const onSkipAll = vi.fn()

    render(
      <FinaleControls
        opening={false}
        showOpeningCue={false}
        isComplete={false}
        onSkipAll={onSkipAll}
        onDismiss={vi.fn()}
        onPlay={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: 'Skip All ▶▶' })
    expect(button).not.toBeDisabled()

    fireEvent.click(button)
    expect(onSkipAll).toHaveBeenCalledTimes(1)
  })
})
