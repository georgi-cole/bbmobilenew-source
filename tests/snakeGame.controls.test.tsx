import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import SnakeGame from '../src/components/SnakeGame/SnakeGame'
import game from '../src/store/gameSlice'
import settings from '../src/store/settingsSlice'

describe('Serpentine responsive controls', () => {
  const fillRect = vi.fn()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect,
    } as unknown as CanvasRenderingContext2D)
    render(
      <Provider store={configureStore({ reducer: { game, settings } })}>
        <SnakeGame autoStart />
      </Provider>
    )
    fillRect.mockClear()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function step() {
    fillRect.mockClear()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    return fillRect.mock.calls.find((args) => args[2] === 14 && args[3] === 14)?.slice(0, 2)
  }
  function press(name: string) {
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
    Object.defineProperties(event, { pointerType: { value: 'touch' }, isPrimary: { value: true } })
    fireEvent(screen.getByRole('button', { name, exact: true }), event)
  }

  it('turns on contact without waiting for release, preserving two quick corners', () => {
    press('Up')
    press('Left')
    expect(step()).toEqual([150, 135])
    expect(step()).toEqual([135, 135])
  })

  it('rejects reversals against queued turns and ignores release-generated clicks', () => {
    press('Up')
    press('Down')
    fireEvent.click(screen.getByRole('button', { name: 'Left', exact: true }), { detail: 1 })
    expect(step()).toEqual([150, 135])
    expect(step()).toEqual([150, 120])
  })

  it('accepts accessible keyboard clicks and steers during a short swipe', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Up', exact: true }), { detail: 0 })
    const board = screen.getByLabelText('Serpentine game board')
    fireEvent.touchStart(board, { touches: [{ clientX: 100, clientY: 100 }] })
    fireEvent.touchMove(board, { touches: [{ clientX: 80, clientY: 100 }] })
    expect(step()).toEqual([150, 135])
    expect(step()).toEqual([135, 135])
    expect(screen.getByRole('progressbar', { name: 'Goal progress' })).toHaveAttribute(
      'max',
      '1000'
    )
  })

  it('bounds the turn queue and ignores repeated straight inputs', () => {
    press('Up')
    press('Up')
    press('Left')
    press('Down')
    expect(step()).toEqual([150, 135])
    expect(step()).toEqual([135, 135])
    expect(step()).toEqual([120, 135])
  })
})
