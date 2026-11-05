import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import ChampionFinaleStage from './ChampionFinaleStage'
const [winner] = createInitialGameState({ seed: 514 }).players

afterEach(cleanup)

describe('shared champion coronation', () => {
  it('preserves the suspense without leaking the winner before the verdict cue', () => {
    const onContinue = vi.fn()
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        season={3}
        decidedBy="tribunal"
        revealed={false}
        active
        onContinue={onContinue}
      />
    )

    const root = screen.getByRole('dialog', { name: 'Season 3 champion coronation' })
    expect(root).toHaveAttribute('data-champion-revealed', 'false')
    expect(root).toHaveAttribute('data-final-vote', 'tribunal')
    expect(root).not.toHaveAttribute('data-winner-id')
    expect(container.querySelector('.season-finale__champion-backdrop')).toHaveAttribute(
      'src',
      expect.stringContaining('winner-stage.webp')
    )
    expect(container.querySelector('.season-finale__champion-stage')).toHaveAttribute('hidden')
    expect(container.querySelector('.season-finale__champion-cutout')).not.toBeVisible()
    expect(container.querySelector('.f3-venue__monitor')).toBeNull()
    expect(screen.getByText('One season. One champion.')).toBeTruthy()
    expect(screen.queryByText(winner.name)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue to winner interview' })).toBeNull()
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('celebrates only the Tribunal winner and advances only on the shared Continue control', () => {
    const onContinue = vi.fn()
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        season={3}
        decidedBy="tribunal"
        revealed
        active
        onContinue={onContinue}
      />
    )

    expect(container.querySelector('[data-winner-id]')).toHaveAttribute('data-winner-id', winner.id)
    expect(screen.getByRole('heading', { name: winner.name })).toBeTruthy()
    expect(screen.getByText(/Chosen by the Tribunal/)).toBeTruthy()
    expect(screen.queryByText(/Runner-up/)).toBeNull()
    expect(container.querySelectorAll('.season-finale__champion-cutout')).toHaveLength(1)
    expect(container.querySelectorAll('.champion-fireworks__burst')).toHaveLength(4)
    const continueButton = screen.getByRole('button', { name: 'Continue to winner interview' })
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.click(continueButton)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('shows the audience verdict in Vox without motion or a second finalist', () => {
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        season={7}
        decidedBy="audience"
        revealed
        active
        animate={false}
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByText(/Chosen by the public/)).toBeTruthy()
    expect(container.querySelectorAll('.season-finale__champion-cutout')).toHaveLength(1)
    expect(container.querySelector('.champion-fireworks')).toBeNull()
    expect(container.querySelector('.f3-venue__monitor')).toBeNull()
    expect(screen.queryByText(/Runner-up ·/)).toBeNull()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-final-vote', 'audience')
  })

  it('keeps suspended coronations inert so backgrounded overlays cannot be advanced', () => {
    render(
      <ChampionFinaleStage
        winner={winner}
        season={1}
        decidedBy="audience"
        revealed
        active={false}
        onContinue={vi.fn()}
      />
    )
    const dialog = document.querySelector('[data-presentation-root="season-winner"]')
    expect(dialog).toHaveAttribute('inert')
    expect(dialog).toHaveAttribute('aria-hidden', 'true')
    expect(dialog).toHaveAttribute('data-presentation-suspended')
  })
})
