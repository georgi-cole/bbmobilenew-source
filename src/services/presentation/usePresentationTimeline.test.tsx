import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresentationTimeline } from './usePresentationTimeline'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('finite presentation timelines', () => {
  it('preserves remaining time and never replays a fired cue after suspension', () => {
    const opening = vi.fn(),
      ending = vi.fn()
    const cues = [
      { atMs: 500, run: opening },
      { atMs: 2000, run: ending },
    ]
    const { rerender } = renderHook(({ active }) => usePresentationTimeline(active, cues), {
      initialProps: { active: true },
    })
    act(() => vi.advanceTimersByTime(1000))
    expect(opening).toHaveBeenCalledTimes(1)
    rerender({ active: false })
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(30_000))
    rerender({ active: true })
    act(() => vi.advanceTimersByTime(999))
    expect(ending).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(ending).toHaveBeenCalledTimes(1)
    expect(opening).toHaveBeenCalledTimes(1)
  })

  it('cancels old completion work and starts a distinct sequence from zero', () => {
    const complete = vi.fn()
    const cues = [{ atMs: 1000, run: complete }]
    const { result, rerender, unmount } = renderHook(
      ({ sequence }) => usePresentationTimeline(true, cues, sequence),
      { initialProps: { sequence: 'old' } }
    )
    act(() => {
      vi.advanceTimersByTime(500)
      result.current()
    })
    act(() => vi.advanceTimersByTime(1000))
    expect(complete).not.toHaveBeenCalled()
    rerender({ sequence: 'new' })
    act(() => vi.advanceTimersByTime(1000))
    expect(complete).toHaveBeenCalledTimes(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not duplicate callbacks during StrictMode effect replay', () => {
    const complete = vi.fn()
    const cues = [{ atMs: 0, run: complete }]
    renderHook(() => usePresentationTimeline(true, cues), { wrapper: StrictMode })
    act(() => vi.advanceTimersByTime(0))
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
