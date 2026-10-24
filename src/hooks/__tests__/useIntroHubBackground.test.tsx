import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useIntroHubBackground from '../useIntroHubBackground'

const nativeImage = window.Image

afterEach(() => {
  vi.useRealTimers()
  window.Image = nativeImage
})

describe('useIntroHubBackground', () => {
  it('uses the local scene after remote validation reaches its deadline', async () => {
    vi.useFakeTimers()

    class StalledImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      src = ''
    }
    window.Image = StalledImage as unknown as typeof Image

    const { result } = renderHook(() =>
      useIntroHubBackground('https://example.com/slow-background.jpg', '/assets/local-scene.jpg')
    )

    expect(result.current).toEqual({ url: '/assets/local-scene.jpg', ready: false })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(result.current).toEqual({ url: '/assets/local-scene.jpg', ready: true })
  })
})
