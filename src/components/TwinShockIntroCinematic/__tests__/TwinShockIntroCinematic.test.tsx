import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TwinShockIntroCinematic from '../TwinShockIntroCinematic'
import { SoundManager } from '../../../services/sound/SoundManager'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../../../services/presentation/presentationOwnership'

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    panicStopAllMusic: vi.fn(),
    syncMusic: vi.fn(),
  },
}))

vi.mock('../../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    syncTo: vi.fn(),
    currentTime: vi.fn(() => 0),
    fadeOutAndStop: vi.fn(),
    dispose: vi.fn(),
  }),
}))

describe('TwinShockIntroCinematic', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    document.body.classList.remove('no-animations')
  })

  const reveal = {
    type: 'combined' as const,
    playerId: 'lia',
    fromName: 'Lia',
    fromAvatar: '/lia.webp',
    toName: 'Lia & Ali',
    toAvatar: '/lia-ali.webp',
  }

  it('preserves the live chapter sequence when video is explicitly disabled', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'false')
    const onComplete = vi.fn()
    const { container } = render(
      <TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />
    )

    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'signal')
    expect(screen.getByTestId('twin-shock-background-video')).not.toHaveAttribute('src')
    act(() => vi.advanceTimersByTime(1_600))
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'childhood')
    act(() => vi.advanceTimersByTime(2_900))
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'grown')
    act(() => vi.advanceTimersByTime(2_900))
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'reveal')
    act(() => vi.advanceTimersByTime(3_700))
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'verdict')
    act(() => vi.advanceTimersByTime(5_400))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('can be skipped into the existing avatar-change animation', () => {
    const onComplete = vi.fn()
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    act(() => vi.advanceTimersByTime(420))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('suspends without advancing when a higher-priority presentation takes ownership', async () => {
    const onComplete = vi.fn()
    const { container } = render(
      <TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />
    )
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'signal')

    vi.mocked(SoundManager.syncMusic).mockClear()
    let releaseFinale: () => void = () => undefined
    act(() => {
      releaseFinale = acquirePresentationOwnership(
        createPresentationOwnerToken(),
        'season-finale',
        100
      )
    })

    expect(container.querySelector('.twin-intro')).toBeNull()
    expect(onComplete).not.toHaveBeenCalled()
    expect(SoundManager.syncMusic).not.toHaveBeenCalled()

    await act(async () => {
      releaseFinale()
      await Promise.resolve()
    })

    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'signal')
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('uses the default video background while keeping chapter text live', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { container } = render(<TwinShockIntroCinematic reveal={reveal} onComplete={vi.fn()} />)
    const video = screen.getByTestId('twin-shock-background-video')

    expect(video).toHaveAttribute('data-cinematic-preparing', 'true')
    expect(video.getAttribute('src')).toContain('twin-shock-intro-v1.mp4')
    expect(container.querySelector('.twin-intro__chapter--childhood h2')).toHaveTextContent(
      'Double troublefrom day one.'
    )
    fireEvent.loadedData(video)
    expect(video).toHaveClass('twin-intro__video--ready')
  })

  it('requests a decoded frame when preload stops at metadata without hiding the live fallback early', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    play.mockClear()
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={vi.fn()} />)
    const video = screen.getByTestId('twin-shock-background-video')
    expect(play).toHaveBeenCalledTimes(1)
    fireEvent.loadedMetadata(video)
    expect(play).toHaveBeenCalledTimes(1)
    expect(video).not.toHaveClass('twin-intro__video--ready')
    fireEvent.loadedData(video)
    fireEvent.canPlay(video)
    expect(video).toHaveClass('twin-intro__video--ready')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('allows Skip again after a pending Skip is interrupted', async () => {
    const onComplete = vi.fn()
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    let release: () => void = () => undefined
    act(() => {
      release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
    })
    act(() => vi.advanceTimersByTime(500))
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => {
      release()
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    act(() => vi.advanceTimersByTime(420))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
  })

  it('seeks a reattached video to the suspended chapter', async () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={vi.fn()} />)
    const firstVideo = screen.getByTestId('twin-shock-background-video') as HTMLVideoElement
    fireEvent.loadedData(firstVideo)
    fireEvent.playing(firstVideo)
    firstVideo.currentTime = 5
    fireEvent.timeUpdate(firstVideo)
    let release: () => void = () => undefined
    act(() => {
      release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
    })
    await act(async () => {
      release()
      await Promise.resolve()
    })
    const resumedVideo = screen.getByTestId('twin-shock-background-video') as HTMLVideoElement
    fireEvent.loadedData(resumedVideo)
    expect(resumedVideo).not.toBe(firstVideo)
    expect(firstVideo).not.toHaveAttribute('src')
    expect(resumedVideo.currentTime).toBe(5)
  })

  it('falls back when play never starts after a frame is ready', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise(() => {}))
    const onComplete = vi.fn()
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />)
    const video = screen.getByTestId('twin-shock-background-video')
    fireEvent.loadedData(video)
    act(() => vi.advanceTimersByTime(1_500))
    expect(video).not.toHaveAttribute('src')
    act(() => vi.advanceTimersByTime(16_300))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('falls back immediately when no first frame arrives and ignores a late frame', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { container } = render(<TwinShockIntroCinematic reveal={reveal} onComplete={vi.fn()} />)
    const video = screen.getByTestId('twin-shock-background-video')
    expect(video).toHaveAttribute('src')

    act(() => vi.advanceTimersByTime(900))
    expect(video).not.toHaveAttribute('src')
    fireEvent.loadedData(video)
    expect(container.querySelector('.twin-intro--video-ready')).toBeNull()
    expect(container.querySelector('.twin-intro__photo--childhood')).not.toBeNull()
  })

  it('returns to the live sequence when prepared video stalls', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { container } = render(<TwinShockIntroCinematic reveal={reveal} onComplete={vi.fn()} />)
    const video = screen.getByTestId('twin-shock-background-video')

    fireEvent.loadedData(video)
    fireEvent.playing(video)
    expect(video).toHaveClass('twin-intro__video--ready')
    fireEvent.waiting(video)

    act(() => vi.advanceTimersByTime(1_500))

    expect(video).not.toHaveAttribute('src')
    expect(container.querySelector('.twin-intro--video-ready')).toBeNull()
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'signal')
  })

  it('completes without waiting through the cinematic when app animations are off', () => {
    document.body.classList.add('no-animations')
    const onComplete = vi.fn()
    const { container } = render(
      <TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />
    )

    expect(container.querySelector('.twin-intro')).toBeNull()
    act(() => vi.advanceTimersByTime(0))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
