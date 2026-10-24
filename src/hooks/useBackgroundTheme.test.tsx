import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedTheme } from '../utils/backgroundTheme'

const mockResolveTheme = vi.hoisted(() => vi.fn())

vi.mock('../utils/backgroundTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/backgroundTheme')>()
  return {
    ...actual,
    getNextThemeBoundaryDelay: () => 60_000,
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

describe('useBackgroundTheme', () => {
  beforeEach(() => {
    mockResolveTheme.mockReset().mockResolvedValue(theme)
  })

  it('queues the first location request behind its no-prompt initial resolution', async () => {
    let resolveInitial: (resolved: ResolvedTheme) => void = () => undefined
    mockResolveTheme.mockImplementationOnce(
      () =>
        new Promise<ResolvedTheme>((resolve) => {
          resolveInitial = resolve
        })
    )

    const { result } = renderHook(() => useBackgroundTheme())
    await waitFor(() => expect(mockResolveTheme).toHaveBeenCalledOnce())

    let request: Promise<void> = Promise.resolve()
    act(() => {
      request = Promise.all([
        result.current.requestWeatherLocation(),
        result.current.requestWeatherLocation(),
      ]).then(() => undefined)
    })
    expect(mockResolveTheme).toHaveBeenCalledOnce()

    await act(async () => {
      resolveInitial(theme)
      await request
    })

    expect(mockResolveTheme).toHaveBeenCalledTimes(2)
    expect(mockResolveTheme).toHaveBeenNthCalledWith(1, { requestLocationPermission: false })
    expect(mockResolveTheme).toHaveBeenNthCalledWith(2, { requestLocationPermission: true })
    expect(result.current.url).toBe(theme.url)
  })
})
