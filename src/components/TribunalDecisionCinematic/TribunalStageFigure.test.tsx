import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Player } from '../../types'
import TribunalStageFigure from './TribunalStageFigure'

vi.mock('../PlayerAvatar/PlayerAvatar', () => ({
  default: ({ player }: { player: Player }) => <span>Portrait of {player.name}</span>,
}))

const player = {
  id: 'user',
  name: 'Alex',
  isUser: true,
  avatar: '👩',
  appearance: { kind: 'catalog', lookId: 'pc-002', revision: 1 },
} as Player

describe('Tribunal cast presentation', () => {
  it('uses the selected body in a compact, grounded asset and reports readiness', () => {
    const settled = vi.fn()
    const { container } = render(
      <TribunalStageFigure player={player} placement="player" onSettled={settled} />
    )
    const image = screen.getByRole('img', { name: 'Alex' })
    expect(image.getAttribute('src')).toMatch(/assets\/tribunal\/cast\/[a-f0-9]+\.webp$/)
    expect(Number(image.getAttribute('height'))).toBeLessThanOrEqual(600)
    expect(container.querySelector('figure')).toHaveAttribute('data-player-id', 'user')
    fireEvent.load(image)
    expect(settled).toHaveBeenCalledWith('user')
  })

  it('presents an uploaded photo as a portrait even when a catalogue body is selected', () => {
    const { container } = render(
      <TribunalStageFigure
        player={{ ...player, avatar: 'profile-photo:uploaded' }}
        placement="player"
        onSettled={vi.fn()}
      />
    )
    expect(container.querySelector('figure')).toHaveAttribute('data-presentation', 'portrait')
    expect(screen.getByText('Portrait of Alex')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('recovers from a missing cutout with the player portrait and allows the reveal to proceed', () => {
    const settled = vi.fn()
    const { container } = render(
      <TribunalStageFigure player={player} placement="left" onSettled={settled} />
    )
    fireEvent.error(screen.getByRole('img', { name: 'Alex' }))
    expect(container.querySelector('figure')).toHaveAttribute('data-presentation', 'portrait')
    expect(screen.getByText('Portrait of Alex')).toBeVisible()
    expect(settled).toHaveBeenCalledWith('user')
  })
})
