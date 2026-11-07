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

  it('reviews their lives before reaching the present-day reveal', () => {
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

  it('uses the pre-rendered background only when the pilot flag is enabled', () => {
    vi.stubEnv('VITE_FEATURE_TWIN_SHOCK_VIDEO_PILOT', 'true')
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
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
