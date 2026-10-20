import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeekendArtworkCover } from './WeekendPartyAtmosphere'

describe('WeekendArtworkCover', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the lightweight preview until the full artwork has decoded', async () => {
    const image = {
      decoding: 'async',
      complete: false,
      naturalWidth: 0,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      decode: vi.fn(() => Promise.resolve()),
      src: '',
    }
    function MockImage() {
      return image as unknown as HTMLImageElement
    }
    vi.stubGlobal('Image', MockImage)

    const { container } = render(<WeekendArtworkCover artwork="fireside-page" surface="page" />)
    const cover = container.querySelector('.weekend-artwork-cover')!
    expect(cover.getAttribute('data-full-ready')).toBe('false')
    expect(cover.getAttribute('style')).toContain('weekend-fireside-background-v3-preview.webp')

    await act(async () => {
      image.onload?.()
      await Promise.resolve()
    })

    expect(cover.getAttribute('data-full-ready')).toBe('true')
  })

  it('keeps the preview visible when full-size artwork fails to load', () => {
    const image = {
      decoding: 'async',
      complete: false,
      naturalWidth: 0,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      decode: vi.fn(() => Promise.resolve()),
      src: '',
    }
    function MockImage() {
      return image as unknown as HTMLImageElement
    }
    vi.stubGlobal('Image', MockImage)

    const { container } = render(<WeekendArtworkCover artwork="reunion-tv" surface="tv" />)
    act(() => image.onerror?.())

    expect(container.querySelector('.weekend-artwork-cover')?.getAttribute('data-full-ready')).toBe(
      'false'
    )
  })
})
