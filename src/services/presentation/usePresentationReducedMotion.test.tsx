import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePresentationReducedMotion } from './usePresentationReducedMotion'

afterEach(() => {
  cleanup()
  document.body.classList.remove('reduce-motion', 'no-animations')
  vi.restoreAllMocks()
})

describe('presentation motion settings', () => {
  it('shares live system preference changes and removes the listener after its last consumer', () => {
    const query = new EventTarget()
    Object.assign(query, {
      addListener: (listener: EventListener) => query.addEventListener('change', listener),
      removeListener: (listener: EventListener) => query.removeEventListener('change', listener),
    })
    Object.defineProperty(query, 'matches', { value: false, configurable: true })
    const add = vi.spyOn(query, 'addEventListener')
    const remove = vi.spyOn(query, 'removeEventListener')
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList)
    const first = renderHook(usePresentationReducedMotion)
    const second = renderHook(usePresentationReducedMotion)
    expect(first.result.current).toBe(false)
    act(() => {
      Object.defineProperty(query, 'matches', { value: true, configurable: true })
      query.dispatchEvent(new Event('change'))
    })
    expect(first.result.current).toBe(true)
    expect(second.result.current).toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
    first.unmount()
    expect(remove).not.toHaveBeenCalled()
    act(() => {
      Object.defineProperty(query, 'matches', { value: false, configurable: true })
      query.dispatchEvent(new Event('change'))
    })
    expect(second.result.current).toBe(false)
    second.unmount()
    expect(remove).toHaveBeenCalledExactlyOnceWith('change', add.mock.calls[0][1])
  })

  it('updates mounted presentations when either app control changes and disconnects after unmount', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const first = renderHook(usePresentationReducedMotion)
    const second = renderHook(usePresentationReducedMotion)
    expect(first.result.current).toBe(false)
    await act(async () => {
      document.body.classList.add('reduce-motion')
      await Promise.resolve()
    })
    expect(first.result.current).toBe(true)
    expect(second.result.current).toBe(true)
    first.unmount()
    expect(disconnect).not.toHaveBeenCalled()
    await act(async () => {
      document.body.classList.remove('reduce-motion')
      document.body.classList.add('no-animations')
      await Promise.resolve()
    })
    expect(second.result.current).toBe(true)
    await act(async () => {
      document.body.classList.remove('no-animations')
      await Promise.resolve()
    })
    expect(second.result.current).toBe(false)
    second.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
