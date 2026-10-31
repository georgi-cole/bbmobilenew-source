import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreditsTimeline from './CreditsTimeline'

vi.mock('../../cinematic/audio/creditsSoundtrack', () => ({ getCreditsSoundtrackTime: () => 0 }))
vi.mock('../../cinematic/credits/CreditsOverlay', () => ({
  CreditsOverlay: ({ frame }: { frame: number }) => (
    <output data-testid="credits-frame">{frame}</output>
  ),
}))

describe('credits text clock', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback)
      return nextId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
  })
  afterEach(() => {
    cleanup()
    frames.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(performance.now()))
    })
  }

  it('freezes fallback elapsed time in the background and cancels its clock on unmount', () => {
    const videoRef = { current: null }
    const elapsedRef = { current: 3 }
    const onEnd = vi.fn()
    const props = { videoRef, elapsedRef, onEnd, credits: [], playing: false, fallback: true }
    const { rerender, unmount } = render(<CreditsTimeline {...props} running />)
    advance(1000)
    expect(screen.getByTestId('credits-frame')).toHaveTextContent('120')
    rerender(<CreditsTimeline {...props} running={false} />)
    advance(60_000)
    rerender(<CreditsTimeline {...props} running />)
    advance(1000)
    expect(screen.getByTestId('credits-frame')).toHaveTextContent('150')
    expect(onEnd).not.toHaveBeenCalled()
    unmount()
    expect(frames.size).toBe(0)
  })
})
