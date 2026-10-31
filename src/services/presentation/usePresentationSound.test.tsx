import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePresentationSound } from './usePresentationSound'

afterEach(cleanup)
describe('presentation sound scopes', () => {
  it('aborts on coverage, starts a fresh scope on resume, and ignores inactive play calls', () => {
    const player = vi.fn()
    const { result, rerender, unmount } = renderHook(
      ({ active, sequence }) => usePresentationSound(active, sequence, player),
      {
        initialProps: { active: true, sequence: 'first' },
        wrapper: StrictMode,
      }
    )
    act(() => result.current.play('cue', { volume: 0.4 }))
    const first = player.mock.calls[0][1].signal as AbortSignal
    expect(first.aborted).toBe(false)
    rerender({ active: false, sequence: 'first' })
    expect(first.aborted).toBe(true)
    act(() => result.current.play('covered-cue'))
    expect(player).toHaveBeenCalledTimes(1)
    rerender({ active: true, sequence: 'first' })
    act(() => result.current.play('resumed-cue'))
    const resumed = player.mock.calls[1][1].signal as AbortSignal
    expect(resumed).not.toBe(first)
    expect(resumed.aborted).toBe(false)
    rerender({ active: true, sequence: 'second' })
    expect(resumed.aborted).toBe(true)
    act(() => result.current.play('new-sequence'))
    const replacement = player.mock.calls[2][1].signal as AbortSignal
    unmount()
    expect(replacement.aborted).toBe(true)
  })

  it('cancels sound before calling the scene completion and cannot restart after Skip', () => {
    const player = vi.fn()
    const complete = vi.fn()
    const { result } = renderHook(() => usePresentationSound(true, 'scene', player))
    act(() => result.current.play('cue'))
    const signal = player.mock.calls[0][1].signal as AbortSignal
    act(() => {
      result.current.cancel()
      complete(signal.aborted)
    })
    expect(complete).toHaveBeenCalledWith(true)
    act(() => result.current.play('late-cue'))
    expect(player).toHaveBeenCalledTimes(1)
  })
})
