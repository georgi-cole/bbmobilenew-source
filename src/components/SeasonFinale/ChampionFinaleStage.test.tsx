import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../store/gameSlice'
import ChampionFinaleStage from './ChampionFinaleStage'
import styles from './ChampionFinaleStage.css?raw'

const [winner, runnerUp] = createInitialGameState({ seed: 514 }).players.slice(0, 2)

afterEach(cleanup)

describe('shared champion coronation', () => {
  it('preserves the suspense until the verdict cue and gives both finalists their own podium', () => {
    const onContinue = vi.fn()
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        runnerUp={runnerUp}
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
    expect(container.querySelector('[data-finale-set="garden"][data-scene="champion"]')).toBeTruthy()
    expect(container.querySelectorAll('.season-finale__champion-podium')).toHaveLength(2)
    expect(screen.getByText('One season. One champion.')).toBeTruthy()
    expect(screen.queryByText(winner.name)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue to winner interview' })).toBeNull()
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('reveals the Tribunal winner, acknowledges the runner-up and advances only on Continue', () => {
    const onContinue = vi.fn()
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        runnerUp={runnerUp}
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
    expect(screen.getByText(`Runner-up · ${runnerUp.name}`)).toBeTruthy()
    const continueButton = screen.getByRole('button', { name: 'Continue to winner interview' })
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.click(continueButton)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('shows the audience verdict language in Vox and remains safe without a runner-up record', () => {
    const { container } = render(
      <ChampionFinaleStage
        winner={winner}
        runnerUp={null}
        season={7}
        decidedBy="audience"
        revealed
        active
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByText(/Chosen by the public/)).toBeTruthy()
    expect(container.querySelectorAll('.season-finale__champion-podium')).toHaveLength(1)
    expect(screen.queryByText(/Runner-up ·/)).toBeNull()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-final-vote', 'audience')
  })

  it('keeps suspended coronations inert and supports reduced motion', () => {
    render(
      <ChampionFinaleStage
        winner={winner}
        runnerUp={runnerUp}
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
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation-play-state: paused')
  })
})
