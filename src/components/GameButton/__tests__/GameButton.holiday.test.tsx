import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameButton from '../GameButton'

describe('GameButton holiday treatment', () => {
  const themes = [
    { key: 'halloween', motifs: ['spiderweb', 'ghost', 'pumpkin', 'hanging-spider'] },
    { key: 'christmas', motifs: ['christmas-tree', 'presents', 'candy-canes', 'tree-lights'] },
    { key: 'newYear', motifs: ['midnight-clock', 'new-year-number', 'fireworks'] },
    { key: 'easter', motifs: ['bunny', 'easter-egg'] },
    { key: 'independenceDay', motifs: ['flag-stripes', 'stars'] },
  ] as const

  it.each(themes)('renders integrated $key artwork on the primary action', ({ key, motifs }) => {
    render(<GameButton label="Play" variant="primary_large" holidayTheme={key} />)

    const button = screen.getByRole('button', { name: 'Play' })
    const artwork = button.querySelector('.btn-holiday-artwork svg')
    const glassSurface = button.querySelector('.btn-holiday-artwork__glass')
    expect(button).toHaveClass(`game-btn--holiday-${key}`)
    expect(artwork).toHaveAttribute('data-theme', key)
    expect(artwork?.lastElementChild).toHaveAttribute('stroke', 'rgba(225, 235, 255, 0.24)')
    expect(glassSurface).toBeInTheDocument()
    expect(glassSurface?.getAttribute('style')).toContain('111, 86, 255')
    expect(glassSurface?.getAttribute('style')).toContain('rgba(10, 14, 24, 0.05)')
    expect(button.querySelector('.btn-bg')).toBeNull()

    for (const motif of motifs) {
      expect(artwork?.querySelector(`[data-motif="${motif}"]`)).toBeInTheDocument()
    }
  })

  it('keeps the standard primary action free of holiday artwork', () => {
    render(<GameButton label="Play" variant="primary_large" />)

    const button = screen.getByRole('button', { name: 'Play' })
    expect(button).not.toHaveClass('game-btn--holiday')
    expect(button.querySelector('.btn-holiday-artwork')).toBeNull()
  })

  it('keeps holiday artwork on the primary action only', () => {
    render(<GameButton label="Continue" variant="secondary_medium" holidayTheme="christmas" />)

    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button.querySelector('.btn-holiday-artwork')).toBeNull()
    expect(button.querySelector('.btn-bg')).toBeInTheDocument()
  })
})
