import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MinigameUtilityDock from './MinigameUtilityDock'
import { clampDockAnchor, dockBounds } from './dockPosition'
import { horizontalSwipe } from '../../hooks/useHorizontalSwipe'
import { WeekendHubSaysChoices } from '../WeekendInterludeOverlay/WeekendInterludeOverlay'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number
      isPrimary: boolean
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
        this.isPrimary = init.isPrimary ?? true
      }
    }
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('shared gesture policies', () => {
  it('recognizes only deliberate horizontal motion', () => {
    expect(horizontalSwipe(-40, 0)).toBe(1)
    expect(horizontalSwipe(40, 0)).toBe(-1)
    expect(horizontalSwipe(39, 0)).toBe(0)
    expect(horizontalSwipe(45, 40)).toBe(0)
    expect(horizontalSwipe(0, 100)).toBe(0)
  })
  it('clamps dock travel in small viewports and rejects invalid preferences', () => {
    expect(dockBounds(20, 30, 20)).toEqual({ min: 40, max: 40 })
    expect(dockBounds(844, 44, 34)).toEqual({ min: 54, max: 756 })
    expect(clampDockAnchor(NaN)).toBe(0)
    expect(clampDockAnchor(2)).toBe(1)
  })
  it('moves the eye vertically without opening its menu, while taps still work', () => {
    const toggle = vi.fn(),
      close = vi.fn()
    render(
      <MinigameUtilityDock
        phase="playing"
        menuOpen={false}
        onToggleMenu={toggle}
        onCloseMenu={close}
        onOpenRules={vi.fn()}
        onRequestExit={vi.fn()}
      />
    )
    const orb = screen.getByRole('button', { name: 'Open minigame menu' })
    fireEvent.pointerDown(orb, { clientX: 10, clientY: 20 })
    fireEvent.pointerMove(orb, { clientX: 100, clientY: 220 })
    fireEvent.pointerUp(orb, { clientX: 100, clientY: 220 })
    fireEvent.click(orb)
    expect(toggle).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    expect(parseFloat((orb.parentElement as HTMLElement).style.top)).toBe(210)
    fireEvent.pointerDown(orb, { clientX: 10, clientY: 220 })
    fireEvent.pointerUp(orb, { clientX: 10, clientY: 220 })
    fireEvent.click(orb)
    expect(toggle).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(orb, { key: 'End' })
    expect(localStorage.getItem('bigeye:minigame-dock-anchor:v1')).toBe('1')
    fireEvent.keyDown(orb, { key: 'Home' })
    expect(parseFloat((orb.parentElement as HTMLElement).style.top)).toBe(10)
  })
  it('pages Hub Says without selecting an avatar, and clamps at the last page', () => {
    const select = vi.fn()
    const players = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      avatar: '',
      status: 'active' as const,
    }))
    const view = render(<WeekendHubSaysChoices players={players} onSelect={select} />)
    const swipe = (dx: number, dy = 0) => {
      const area = view.container.querySelector('.weekend-interlude__players')!
      act(() => {
        fireEvent.pointerDown(area, { clientX: 100, clientY: 100 })
        fireEvent.pointerUp(area, { clientX: 100 + dx, clientY: 100 + dy })
      })
    }
    swipe(-80)
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Choose a Hubmate, page 2 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Player 4' }))
    expect(select).not.toHaveBeenCalled()
    swipe(-80)
    swipe(-80)
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Choose a Hubmate, page 3 of 3')
    swipe(80, 100)
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Choose a Hubmate, page 3 of 3')
    swipe(80)
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Choose a Hubmate, page 2 of 3')
  })
})
