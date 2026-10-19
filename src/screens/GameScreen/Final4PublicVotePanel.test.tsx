import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Player } from '../../types'
import Final4PublicVotePanel from './Final4PublicVotePanel'

const nominees = [
  { id: 'lia', name: 'Lia', status: 'nominated', avatar: '👩' },
  { id: 'bea', name: 'Bea', status: 'nominated', avatar: '👩🏻' },
] as Player[]

describe('Final4PublicVotePanel', () => {
  it('lets the player cast a public vote directly from the live chat beat', () => {
    const onSelect = vi.fn()
    render(<Final4PublicVotePanel nominees={nominees} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vote to eliminate Bea' }))

    expect(onSelect).toHaveBeenCalledWith('bea')
  })

  it.each(['mouse', 'touch', 'pen'])(
    'handles a %s pointer release without submitting twice for its click event',
    (pointerType) => {
      const onSelect = vi.fn()
      render(<Final4PublicVotePanel nominees={nominees} onSelect={onSelect} />)
      const voteButton = screen.getByRole('button', { name: 'Vote to eliminate Bea' })

      fireEvent.pointerUp(voteButton, { button: 0, pointerType })
      fireEvent.click(voteButton, { detail: 1 })

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect).toHaveBeenCalledWith('bea')
    }
  )
})
