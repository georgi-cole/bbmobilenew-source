import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import Credits from '../Credits'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../../../services/presentation/presentationOwnership'

const EXIT_FADE_MS = 420

const soundtrackMock = vi.hoisted(() => ({
  fadeOut: vi.fn(),
  getTime: vi.fn(() => 0),
  isPlaying: vi.fn(() => true),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  sync: vi.fn(),
}))

const contentMock = vi.hoisted(() => ({
  load: vi.fn(() =>
    Promise.resolve({
      cards: [
        {
          id: 'runtime-producer',
          fromSecond: 0,
          toSecond: 4,
          lines: [{ text: 'Runtime Producer', style: 'name' }],
        },
      ],
      source: 'runtime' as const,
      url: '/config/credits.json',
    })
  ),
}))

vi.mock('../../../cinematic/audio/creditsSoundtrack', () => ({
  fadeOutCreditsSoundtrack: soundtrackMock.fadeOut,
  getCreditsSoundtrackTime: soundtrackMock.getTime,
  isCreditsSoundtrackPlaying: soundtrackMock.isPlaying,
  pauseCreditsSoundtrack: vi.fn(),
  startCreditsSoundtrackFromGesture: soundtrackMock.start,
  stopCreditsSoundtrack: soundtrackMock.stop,
  syncCreditsSoundtrackToTime: soundtrackMock.sync,
}))

vi.mock('../../../cinematic/credits/creditsContent', () => ({
  loadCreditsContent: contentMock.load,
}))

function renderCredits(props: { autoPlay?: boolean; onComplete?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/credits']}>
      <Routes>
        <Route path="/credits" element={<Credits {...props} />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Credits', () => {
  beforeEach(() => {
    soundtrackMock.fadeOut.mockClear()
    soundtrackMock.getTime.mockReset()
    soundtrackMock.getTime.mockReturnValue(0)
    soundtrackMock.isPlaying.mockReset()
    soundtrackMock.isPlaying.mockReturnValue(true)
    soundtrackMock.start.mockClear()
    soundtrackMock.stop.mockClear()
    soundtrackMock.sync.mockClear()
    contentMock.load.mockClear()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.classList.remove('no-animations', 'reduce-motion')
  })

  it('uses the pre-rendered muted video and starts it immediately', () => {
    renderCredits()

    const video = screen.getByTestId('credits-background-video')
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveProperty('muted', true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Skip credits' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tap to start credits' })).toBeNull()
  })

  it('disables its video family without disabling live credits or the Skip handoff', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_FEATURE_CREDITS_VIDEO', 'false')
    const onComplete = vi.fn()
    renderCredits({ onComplete })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('credits-background-fallback')).toBeVisible()
    act(() => vi.advanceTimersByTime(600))
    expect(screen.getAllByText('Runtime Producer').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('credits-background-video')).toBeNull()
  })

  it.each(['no-animations', 'reduce-motion'])('keeps credits static for %s', (motionClass) => {
    document.body.classList.add(motionClass)
    const { container } = renderCredits()

    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(container.querySelector('.credits-media')).toHaveAttribute('data-video-ready', 'false')
  })

  it('keeps the current chapter on fallback when motion is disabled and re-enabled', async () => {
    vi.useFakeTimers()
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
    const paintFrame = () => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(performance.now()))
    }
    const onComplete = vi.fn()
    renderCredits({ onComplete })
    const video = screen.getByTestId('credits-background-video') as HTMLVideoElement
    video.currentTime = 50
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    fireEvent.play(video)
    act(paintFrame)
    await act(async () => {
      document.body.classList.add('reduce-motion')
      await Promise.resolve()
    })
    expect(video).not.toHaveAttribute('src')
    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    const playCount = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length
    await act(async () => {
      document.body.classList.remove('reduce-motion')
      await Promise.resolve()
    })
    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playCount)
    act(() => {
      vi.advanceTimersByTime(4200)
      paintFrame()
    })
    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('keeps the separate soundtrack available at the current chapter when video fails', async () => {
    soundtrackMock.isPlaying.mockReturnValue(false)
    renderCredits()
    const video = screen.getByTestId('credits-background-video') as HTMLVideoElement
    video.currentTime = 5
    fireEvent.error(video)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(soundtrackMock.start).toHaveBeenLastCalledWith(5)
    expect(soundtrackMock.stop).not.toHaveBeenCalled()
  })

  it('waits for foreground ownership before loading or starting video', async () => {
    const releaseBlocker = acquirePresentationOwnership(
      createPresentationOwnerToken(),
      'foreground-blocker',
      200
    )
    try {
      renderCredits()
      const video = screen.getByTestId('credits-background-video')

      expect(video).not.toHaveAttribute('src')
      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()

      releaseBlocker()
      await act(async () => {
        await Promise.resolve()
      })

      expect(video).toHaveAttribute('src')
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    } finally {
      releaseBlocker()
    }
  })

  it('reveals the video as soon as its first frame has decoded', () => {
    renderCredits()

    const video = screen.getByTestId('credits-background-video')
    expect(video).not.toHaveClass('is-ready')
    fireEvent.loadedData(video)
    expect(video).toHaveClass('is-ready')
  })

  it('falls back when the video cannot produce a decoded frame in time', () => {
    vi.useFakeTimers()
    const view = renderCredits()
    const video = screen.getByTestId('credits-background-video')

    act(() => vi.advanceTimersByTime(1_800))

    expect(view.queryByTestId('credits-background-video')).toBeNull()
    expect(video).not.toHaveAttribute('src')
    expect(screen.getByTestId('credits-background-fallback')).toBeInTheDocument()
  })

  it('falls back if native video autoplay is rejected', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Blocked'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const view = renderCredits()

    await waitFor(() => expect(view.queryByTestId('credits-background-video')).toBeNull())
    expect(screen.getByTestId('credits-background-fallback')).toBeInTheDocument()
  })

  it('honours autoplay when credits are embedded after the finale', () => {
    renderCredits({ autoPlay: false })

    expect(screen.getByTestId('credits-background-video')).not.toHaveAttribute('autoplay')
    expect(screen.getByTestId('credits-background-video')).not.toHaveAttribute('src')
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
  })

  it('keeps runtime-loaded credit cards above the video', async () => {
    renderCredits()

    await waitFor(() => expect(contentMock.load).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByText('Runtime Producer').length).toBeGreaterThan(0))
    expect(screen.getByTestId('credits-background-video').parentElement).toHaveAttribute(
      'data-content-source',
      'runtime'
    )
  })

  it('uses the logo-free city-lights fallback when the video fails', () => {
    renderCredits()

    fireEvent.error(screen.getByTestId('credits-background-video'))

    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(screen.getByTestId('credits-background-fallback')).toBeInTheDocument()
    expect(screen.queryByAltText('Kolequant')).toBeNull()
  })

  it('starts external music when video playback begins and no music is active', () => {
    soundtrackMock.isPlaying.mockReturnValue(false)
    renderCredits()

    const video = screen.getByTestId('credits-background-video')
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 2.5 })
    fireEvent.play(video)

    expect(soundtrackMock.start).toHaveBeenCalledWith(2.5)
  })

  it('resumes the soundtrack after temporary video buffering', () => {
    renderCredits()

    const video = screen.getByTestId('credits-background-video')
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 1.25 })
    fireEvent.waiting(video)
    fireEvent.playing(video)

    expect(soundtrackMock.sync).toHaveBeenLastCalledWith(1.25, true)
  })

  it('switches to the live timeline when video buffering does not recover', () => {
    vi.useFakeTimers()
    renderCredits()
    const video = screen.getByTestId('credits-background-video')

    fireEvent.loadedData(video)
    fireEvent.playing(video)
    fireEvent.waiting(video)
    act(() => vi.advanceTimersByTime(1_800))

    expect(screen.queryByTestId('credits-background-video')).toBeNull()
    expect(video).not.toHaveAttribute('src')
    expect(screen.getByTestId('credits-background-fallback')).toBeInTheDocument()
  })

  it('fades music and returns home when skipped', () => {
    vi.useFakeTimers()
    renderCredits()

    fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    expect(soundtrackMock.fadeOut).toHaveBeenCalledWith(EXIT_FADE_MS)

    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })

  it('detaches the video source before handing off after the exit fade', () => {
    vi.useFakeTimers()
    renderCredits()

    const video = screen.getByTestId('credits-background-video')
    fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    expect(video).toHaveAttribute('src')

    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))

    expect(video).not.toHaveAttribute('src')
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })

  it('finishes only once when Skip and video End race in the same turn', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    renderCredits({ onComplete })
    const video = screen.getByTestId('credits-background-video')

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
      fireEvent.ended(video)
      fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }))
    })
    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(soundtrackMock.fadeOut).toHaveBeenCalledTimes(1)
  })

  it('releases the captured video on route unmount and survives the StrictMode effect replay', async () => {
    const view = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/credits']}>
          <Routes>
            <Route path="/credits" element={<Credits />} />
            <Route path="/" element={<div>Home screen</div>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    )
    const video = screen.getByTestId('credits-background-video')

    await act(async () => {
      await Promise.resolve()
    })
    expect(video).toHaveAttribute('src')

    view.unmount()
    await act(async () => {
      await Promise.resolve()
    })

    expect(video).not.toHaveAttribute('src')
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
  })

  it('finishes embedded finale credits after the video ends', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    renderCredits({ autoPlay: true, onComplete })

    fireEvent.ended(screen.getByTestId('credits-background-video'))
    expect(soundtrackMock.stop).toHaveBeenCalled()
    expect(screen.getByTestId('credits-end-guard')).toHaveClass('is-visible')

    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('exits on Escape', () => {
    vi.useFakeTimers()
    renderCredits()

    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(EXIT_FADE_MS))

    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })
})
