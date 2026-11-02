import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import FinalPowerBattleIntro from '../FinalPowerBattleIntro'

const finalists = createInitialGameState({ seed: 315 }).players.slice(0, 3)

describe('FinalPowerBattleIntro', () => {
  it('shows one concise, ready-to-start scene instead of five Play-controlled beats', () => {
    const { container } = render(<FinalPowerBattleIntro finalists={finalists} mode="classic" />)
    expect(screen.getByRole('region', { name: 'Final Power Battle introduction' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Finalists' }).children).toHaveLength(3)
    expect(container.querySelectorAll('.fpb-intro__cutout')).toHaveLength(3)
    expect(container.querySelector('[data-finale-set="garden"][data-scene="opening"]')).toBeTruthy()
    expect(container.querySelector('.f3-venue__background')?.getAttribute('style')).toContain(
      'final-power-battle-backyard'
    )
    expect(container.querySelector('.f3-venue__monitor-frame')).toBeTruthy()
    expect(container.querySelector('.f3-venue__eye img')).toBeTruthy()
    expect(container.querySelectorAll('.fpb-intro__podium')).toHaveLength(3)
    expect(
      container
        .querySelector('.f3-venue__screen')
        ?.contains(screen.getByRole('heading', { name: 'The Final Power Battle' }))
    ).toBe(true)
    expect(container.querySelector('.fpb-intro')?.getAttribute('data-beat')).toBe('0')
    expect(screen.getAllByRole('heading', { name: 'The Final Power Battle' })).toHaveLength(1)
    expect(screen.getByText(/Press Play to begin/i)).toBeTruthy()
    expect(screen.getByText(/winner earns final power/i)).toBeTruthy()
    expect(screen.queryByText('The finale begins here')).toBeNull()
    expect(screen.queryByText('Ready when you are')).toBeNull()
  })

  it('correctly describes final immunity in Vox, without implying the holder chooses the Final Two', () => {
    render(<FinalPowerBattleIntro finalists={finalists} mode="vox_populi" />)
    expect(screen.getByText(/winner earns final immunity/i)).toBeTruthy()
    expect(screen.queryByText(/winner earns final power/i)).toBeNull()
  })
})
