import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedTheme } from '../utils/backgroundTheme'

const { mockResolveTheme, mockBoundaryDelay } = vi.hoisted(() => ({
  mockResolveTheme: vi.fn(),
  mockBoundaryDelay: vi.fn(),
}))

vi.mock('../utils/backgroundTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/backgroundTheme')>()
  return {
    ...actual,
    getNextThemeBoundaryDelay: mockBoundaryDelay,
    resolveTheme: mockResolveTheme,
  }
})

import useBackgroundTheme from './useBackgroundTheme'

const theme: ResolvedTheme = {
  key: 'day',
  url: '/assets/skins/day.webp',
  reason: 'fallback:location',
  assetFile: 'day.webp',
  assetSource: 'bundled',
  platform: 'web',
  permissionStatus: 'unknown',
}

const rainyTheme: ResolvedTheme = {
  ...theme,
  key: 'weather:rain:day',
  url: '/assets/skins/rain-day.webp',
  reason: 'weather:61:rain',
  assetFile: 'rain-day.webp',
  permissionStatus: 'granted',
}

function pendingTheme() {
  let resolve: (value: ResolvedTheme) => void = () => undefined
  const promise = new Promise<ResolvedTheme>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useBackgroundTheme', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 1, 12))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    mockResolveTheme.mockReset().mockResolvedValue(theme)
    mockBoundaryDelay.mockReset().mockReturnValue(60 * 60 * 1000)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('queues and shares an explicit location retry behind its no-prompt initial resolution', async () => {
    const initial = pendingTheme()
    mockResolveTheme.mockReturnValueOnce(initial.promise).mockResolvedValue(rainyTheme)
    const { result } = renderHook(() => useBackgroundTheme())
    expect(mockResolveTheme).toHaveBeenCalledOnce()

    const firstRequest = result.current.requestWeatherLocation()
    const secondRequest = result.current.requestWeatherLocation()
    expect(firstRequest).toBe(secondRequest)
    expect(mockResolveTheme).toHaveBeenCalledOnce()

    await act(async () => {
      initial.resolve(theme)
      await firstRequest
      await secondRequest
    })

    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
    expect(mockResolveTheme).toHaveBeenNthCalledWith(1, { requestLocationPermission: false })
    expect(mockResolveTheme).toHaveBeenNthCalledWith(2, { requestLocationPermission: true })
    expect(result.current).toMatchObject({
      url: rainyTheme.url,
      reason: rainyTheme.reason,
    })
  })

  it('updates a visible daytime background when rain starts without waiting for a daypart boundary', async () => {
    const { result } = renderHook(() => useBackgroundTheme())
    await act(async () => {})
    expect(result.current.key).toBe('day')
    mockResolveTheme.mockResolvedValue(rainyTheme)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1)
    })
    expect(mockResolveTheme).toHaveBeenCalledOnce()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(result.current.key).toBe('weather:rain:day')
    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
    expect(mockResolveTheme).toHaveBeenLastCalledWith({ requestLocationPermission: false })
  })

  it('skips periodic weather requests while hidden and checks again when the page becomes visible', async () => {
    const { result } = renderHook(() => useBackgroundTheme())
    await act(async () => {})
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mockResolveTheme.mockResolvedValue(rainyTheme)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    })
    expect(mockResolveTheme).toHaveBeenCalledOnce()
    expect(result.current.key).toBe('day')

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.key).toBe('weather:rain:day')
    expect(mockResolveTheme).toHaveBeenLastCalledWith({ requestLocationPermission: false })
  })

  it('retries after connectivity returns without prompting for location', async () => {
    mockResolveTheme.mockResolvedValueOnce({ ...theme, reason: 'fallback:weather' })
    const { result } = renderHook(() => useBackgroundTheme())
    await act(async () => {})
    mockResolveTheme.mockResolvedValue(rainyTheme)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.key).toBe('weather:rain:day')
    expect(mockResolveTheme).toHaveBeenLastCalledWith({ requestLocationPermission: false })

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
  })

  it('deduplicates foreground events and refreshes again on a later return', async () => {
    renderHook(() => useBackgroundTheme())
    await act(async () => {})

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(mockResolveTheme).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      window.dispatchEvent(new Event('pageshow'))
    })
    expect(mockResolveTheme).toHaveBeenCalledTimes(3)
  })

  it('does not overlap a pending request with periodic, foreground, or reconnect checks', async () => {
    const initial = pendingTheme()
    mockResolveTheme.mockReturnValueOnce(initial.promise)
    const { result } = renderHook(() => useBackgroundTheme())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(mockResolveTheme).toHaveBeenCalledOnce()

    await act(async () => initial.resolve(rainyTheme))
    expect(result.current.key).toBe('weather:rain:day')
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
  })

  it('preserves the exact local theme boundary refresh independently of weather polling', async () => {
    mockBoundaryDelay.mockReturnValue(60_000)
    const { result } = renderHook(() => useBackgroundTheme())
    await act(async () => {})
    mockResolveTheme.mockResolvedValue({ ...theme, key: 'sunset', url: '/assets/sunset.webp' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_049)
    })
    expect(result.current.key).toBe('day')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.key).toBe('sunset')
    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
  })

  it('cancels timers, listeners, and queued location work on unmount', async () => {
    const initial = pendingTheme()
    mockResolveTheme.mockReturnValueOnce(initial.promise)
    const { result, unmount } = renderHook(() => useBackgroundTheme({ attachToRoot: true }))
    const request = result.current.requestWeatherLocation()
    const retryAfterUnmount = result.current.requestWeatherLocation
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      initial.resolve(rainyTheme)
      expect(await request).toBeUndefined()
      expect(await retryAfterUnmount()).toBeUndefined()
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(mockResolveTheme).toHaveBeenCalledOnce()
    expect(document.documentElement.style.getPropertyValue('--intro-bg-image')).toBe('')
  })

  it('applies a safe fallback for an unexpected resolver error and permits a later retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useBackgroundTheme())
    await act(async () => {})
    mockResolveTheme.mockRejectedValueOnce(new Error('temporary failure'))

    await act(async () => {
      await result.current.requestWeatherLocation()
    })
    expect(result.current).toMatchObject({
      key: 'day',
      reason: 'resolveTheme:error:temporary failure',
    })
    mockResolveTheme.mockResolvedValue(rainyTheme)
    await act(async () => {
      await result.current.requestWeatherLocation()
    })
    expect(result.current.key).toBe('weather:rain:day')
  })
})
