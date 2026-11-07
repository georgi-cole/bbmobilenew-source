import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CinematicVideo } from './CinematicVideo'
import {
  releaseCinematicVideoElement,
  resolveCinematicMediaUrl,
  type CinematicVideoAsset,
} from './cinematicMedia'

const asset: CinematicVideoAsset = {
  revision: 'test-v1',
  filePath: 'public/assets/test.mp4',
  sourceFile: 'src/remotion/Test.tsx',
  runtimePath: 'assets/test.mp4',
  posterPath: 'assets/test.webp',
  posterWidth: 540,
  posterHeight: 960,
  posterFormat: 'webp',
  width: 540,
  height: 960,
  durationSeconds: 1,
  frameRate: 30,
  encodedBytes: 1000,
  codec: 'avc1',
  audioTrackCount: 0,
  fastStart: true,
  phase: 'test',
  fallback: 'static-test',
  audioPolicy: 'silent',
}

describe('CinematicVideo', () => {
  afterEach(() => vi.restoreAllMocks())

  it('resolves GitHub Pages and Capacitor relative paths', () => {
    expect(
      resolveCinematicMediaUrl(
        'assets/test.mp4',
        '/bbmobilenew/',
        'https://game.example/bbmobilenew/'
      )
    ).toBe('https://game.example/bbmobilenew/assets/test.mp4')
    expect(resolveCinematicMediaUrl('assets/test.mp4', './', 'capacitor://localhost/')).toBe(
      'capacitor://localhost/assets/test.mp4'
    )
  })

  it('attaches media only while prepared and releases its captured element on unmount', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const view = render(<CinematicVideo asset={asset} prepare={false} data-testid="pilot-video" />)
    const video = view.getByTestId('pilot-video') as HTMLVideoElement

    expect(video).not.toHaveAttribute('src')
    expect(video).not.toHaveAttribute('poster')
    expect(video).toHaveAttribute('preload', 'none')

    view.rerender(<CinematicVideo asset={asset} prepare data-testid="pilot-video" />)
    expect(video).toHaveAttribute('data-cinematic-preparing', 'true')
    expect(video.src).toMatch(/\/assets\/test\.mp4$/)
    expect(video.poster).toMatch(/\/assets\/test\.webp$/)

    view.unmount()
    await act(async () => Promise.resolve())

    expect(video).not.toHaveAttribute('src')
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
  })

  it('releases nested source elements as well as the parent source', () => {
    const video = document.createElement('video')
    const source = document.createElement('source')
    source.src = '/movie.mp4'
    video.src = '/parent.mp4'
    video.append(source)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)

    releaseCinematicVideoElement(video)

    expect(video).not.toHaveAttribute('src')
    expect(source).not.toHaveAttribute('src')
  })
})
