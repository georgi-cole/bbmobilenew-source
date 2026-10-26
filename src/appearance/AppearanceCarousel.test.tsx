import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppearanceCarousel from './AppearanceCarousel'
import { SELECTABLE_LOOKS } from './catalog'
import { warmAppearanceRole } from './preloadAppearance'

vi.mock('./preloadAppearance', () => ({ warmAppearanceRole: vi.fn(async () => {}) }))

function LookPicker() {
  const [selectedId, setSelectedId] = useState(SELECTABLE_LOOKS[0].id)
  return <AppearanceCarousel selectedId={selectedId} onSelect={setSelectedId} />
}

describe('appearance carousel roster', () => {
  beforeEach(() => {
    vi.mocked(warmAppearanceRole).mockClear()
  })

  it('shows the look label without the Included counter', () => {
    render(<LookPicker />)
    expect(screen.getByText('Look 1')).toBeDefined()
    expect(screen.queryByText(/included|\d+ of \d+/i)).toBeNull()
  })

  it('cycles through all 27 looks, including repaired and approved packs', () => {
    render(<LookPicker />)
    for (const look of SELECTABLE_LOOKS.slice(1)) {
      fireEvent.click(screen.getByRole('button', { name: 'Next look' }))
      expect(screen.getByRole('img', { name: look.label })).toBeDefined()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next look' }))
    expect(screen.getByRole('img', { name: 'Look 1' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Previous look' }))
    expect(screen.getByRole('img', { name: 'Look 27' })).toBeDefined()
  })

  it('preloads only the current and neighboring casual figures while browsing', () => {
    render(<LookPicker />)
    expect(
      vi
        .mocked(warmAppearanceRole)
        .mock.calls.map(([selection, role]) => [
          selection?.kind === 'catalog' ? selection.lookId : 'legacy',
          role,
        ])
    ).toEqual([
      ['pc-027', 'casual'],
      ['pc-001', 'casual'],
      ['pc-002', 'casual'],
    ])
  })
})
