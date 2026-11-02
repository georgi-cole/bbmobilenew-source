import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../../../store/gameSlice'
import FinalThreeBlockReveal, { FINAL_THREE_BLOCK_REVEAL_MS } from '../FinalThreeBlockReveal'

const finalists = createInitialGameState({ seed: 731 }).players.slice(0, 3)

describe('FinalThreeBlockReveal', () => {
  it('stages two full-body competitors and the nominated finalist on a matching backdrop', () => {
    const { container } = render(
      <FinalThreeBlockReveal
        blockPlayer={finalists[0]}
        competitors={finalists.slice(1)}
        mode="classic"
        onComplete={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Final Power Battle setup' })).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'The two Final Power Battle competitors' })
    ).toBeTruthy()
    expect(container.querySelector('.fpb-block__backdrop-image')?.getAttribute('style')).toContain(
      'background-image'
    )
    expect(container.querySelectorAll('.fpb-block__competitor-cutout')).toHaveLength(2)
    expect(container.querySelector('.fpb-block__nominee-monitor')).toBeTruthy()
    expect(container.querySelector('.fpb-block__nominee-avatar')).toBeTruthy()
    expect(
      container
        .querySelector('.fpb-block__scene-plane')
        ?.contains(container.querySelector('.fpb-block__nominee-monitor'))
    ).toBe(true)
    expect(screen.queryByText('NOMINATION WALL')).toBeNull()
    expect(screen.queryByText('ON THE BLOCK')).toBeNull()
    expect(screen.queryByText('On block')).toBeNull()
    expect(screen.getByText('Next')).toBeTruthy()
    expect(screen.queryByText('Awaiting')).toBeNull()
    expect(screen.queryByText('Press Play to begin.')).toBeNull()
    expect(container.querySelector('.fpb-block__wildcard-avatar')).toBeTruthy()
    expect(screen.getByText(finalists[0].name)).toBeTruthy()
  })

  it('keeps the existing Play-to-enter flow', () => {
    const onComplete = vi.fn()
    render(
      <FinalThreeBlockReveal
        blockPlayer={finalists[0]}
        competitors={finalists.slice(1)}
        mode="classic"
        onComplete={onComplete}
      />
    )

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('cannot stall indefinitely: auto-hands off once when Play is not pressed', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    try {
      render(
        <FinalThreeBlockReveal
          blockPlayer={finalists[0]}
          competitors={finalists.slice(1)}
          mode="classic"
          onComplete={onComplete}
        />
      )
      act(() => vi.advanceTimersByTime(FINAL_THREE_BLOCK_REVEAL_MS - 1))
      expect(onComplete).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(onComplete).toHaveBeenCalledOnce()
      act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
      expect(onComplete).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('suspends the automatic handoff in the background and resumes on return', () => {
    vi.useFakeTimers()
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const onComplete = vi.fn()
    try {
      render(
        <FinalThreeBlockReveal
          blockPlayer={finalists[0]}
          competitors={finalists.slice(1)}
          mode="classic"
          onComplete={onComplete}
        />
      )
      act(() => vi.advanceTimersByTime(2000))
      act(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      act(() => vi.advanceTimersByTime(60_000))
      expect(onComplete).not.toHaveBeenCalled()
      act(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      act(() => vi.advanceTimersByTime(FINAL_THREE_BLOCK_REVEAL_MS))
      expect(onComplete).toHaveBeenCalledOnce()
    } finally {
      if (hidden) Object.defineProperty(document, 'hidden', hidden)
      else Reflect.deleteProperty(document, 'hidden')
      vi.useRealTimers()
    }
  })

  it('does not reset the auto-handoff clock when the parent recreates its callback', () => {
    vi.useFakeTimers()
    const oldCallback = vi.fn()
    const newCallback = vi.fn()
    try {
      const { rerender } = render(
        <FinalThreeBlockReveal
          blockPlayer={finalists[0]}
          competitors={finalists.slice(1)}
          mode="classic"
          onComplete={oldCallback}
        />
      )
      act(() => vi.advanceTimersByTime(3000))
      rerender(
        <FinalThreeBlockReveal
          blockPlayer={finalists[0]}
          competitors={finalists.slice(1)}
          mode="classic"
          onComplete={newCallback}
        />
      )
      act(() => vi.advanceTimersByTime(FINAL_THREE_BLOCK_REVEAL_MS - 3000))
      expect(oldCallback).not.toHaveBeenCalled()
      expect(newCallback).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
