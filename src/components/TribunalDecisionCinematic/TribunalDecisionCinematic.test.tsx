import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Player } from '../../types'
import TribunalDecisionCinematic from './TribunalDecisionCinematic'
import { createCinematicAudio } from '../../services/sound/cinematicAudio'

const harness = vi.hoisted(() => ({
  settings: { display: { reduceMotion: true }, gameUX: { animations: true } },
  audio: { play: vi.fn(), fadeOutAndStop: vi.fn(), dispose: vi.fn() },
}))
vi.mock('../../store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({ settings: harness.settings }),
}))
vi.mock('../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: vi.fn(() => harness.audio),
}))
vi.mock('./TribunalStageFigure', () => ({
  default: ({ player, onSettled }: { player: Player; onSettled: (id: string) => void }) => (
    <figure aria-label="Player standing in the scene">
      <img alt="" onLoad={() => onSettled(player.id)} />
    </figure>
  ),
}))

const player = { id: 'human', name: 'Alex', status: 'jury', isUser: true, avatar: '👩' } as Player
const musicWindow = window as Window & { _introhubMusicOn?: boolean }

async function resolveArtwork() {
  document.querySelectorAll('.tdc-scene img').forEach((image) => fireEvent.load(image))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('Tribunal cinematic music handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    harness.settings.display.reduceMotion = true
    delete musicWindow._introhubMusicOn
    Reflect.deleteProperty(navigator, 'connection')
  })
  afterEach(() => {
    cleanup()
    delete musicWindow._introhubMusicOn
    Reflect.deleteProperty(navigator, 'connection')
    vi.useRealTimers()
  })

  it.each(['sequester', 'exit'] as const)(
    'holds the twin reveal cue until the %s action and fades before handoff',
    async (destination) => {
      const onComplete = vi.fn().mockResolvedValue(true)
      const { unmount } = render(
        <TribunalDecisionCinematic
          destination={destination}
          player={player}
          members={[]}
          history={[]}
          onComplete={onComplete}
        />
      )
      await resolveArtwork()
      expect(createCinematicAudio).toHaveBeenCalledWith(
        expect.stringContaining('assets/sounds/cinematic/Twin_shock_presentation.mp4'),
        0.62,
        { loop: true }
      )
      expect(harness.audio.play).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000)
      })
      expect(harness.audio.fadeOutAndStop).not.toHaveBeenCalled()
      fireEvent.click(
        screen.getByRole('button', {
          name: destination === 'sequester' ? 'Continue season' : 'Home',
        })
      )
      expect(harness.audio.fadeOutAndStop).toHaveBeenCalledWith(220)
      expect(onComplete).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(220)
      })
      expect(onComplete).toHaveBeenCalledTimes(1)
      unmount()
      expect(harness.audio.dispose).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps the cue through Skip until the main action is chosen', async () => {
    harness.settings.display.reduceMotion = false
    render(
      <TribunalDecisionCinematic
        destination="sequester"
        player={player}
        members={[]}
        history={[]}
        onComplete={vi.fn()}
      />
    )
    await resolveArtwork()
    fireEvent.click(screen.getByRole('button', { name: 'Skip animation' }))
    expect(screen.getByRole('button', { name: 'Continue season' })).toBeEnabled()
    expect(harness.audio.play).toHaveBeenCalledTimes(1)
    expect(harness.audio.fadeOutAndStop).not.toHaveBeenCalled()
  })

  it('respects the existing cinematic music switch', async () => {
    musicWindow._introhubMusicOn = false
    render(
      <TribunalDecisionCinematic
        destination="exit"
        player={player}
        members={[]}
        history={[]}
        onComplete={vi.fn()}
      />
    )
    await resolveArtwork()
    expect(createCinematicAudio).toHaveBeenCalledTimes(1)
    expect(harness.audio.play).not.toHaveBeenCalled()
  })

  it('keeps a failed departure retryable after the cue fades', async () => {
    const onComplete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(
      <TribunalDecisionCinematic
        destination="exit"
        player={player}
        members={[]}
        history={[]}
        onComplete={onComplete}
      />
    )
    await resolveArtwork()
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again')
    fireEvent.click(screen.getByRole('button', { name: 'Retry exit' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220)
    })
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(harness.audio.play).toHaveBeenCalledTimes(1)
  })

  it('releases music and cancels a pending handoff when the scene unmounts', async () => {
    const onComplete = vi.fn()
    const { unmount } = render(
      <TribunalDecisionCinematic
        destination="exit"
        player={player}
        members={[]}
        history={[]}
        onComplete={onComplete}
      />
    )
    await resolveArtwork()
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220)
    })
    expect(onComplete).not.toHaveBeenCalled()
    expect(harness.audio.dispose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sequester', { saveData: true, effectiveType: '4g' }],
    ['exit', { saveData: false, effectiveType: '2g' }],
  ] as const)(
    'uses a complete %s title card without scenery or cue downloads for a constrained connection',
    async (destination, connection) => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: connection })
      const onComplete = vi.fn().mockResolvedValue(true)
      render(
        <TribunalDecisionCinematic
          destination={destination}
          player={player}
          members={[]}
          history={[]}
          onComplete={onComplete}
        />
      )
      expect(document.querySelector('.tdc-dialog')).toHaveAttribute('data-presentation', 'slate')
      expect(document.querySelectorAll('.tdc-scene img')).toHaveLength(0)
      expect(createCinematicAudio).not.toHaveBeenCalled()
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: destination === 'exit' ? 'Home' : 'Continue season' })
        )
      })
      expect(onComplete).toHaveBeenCalledTimes(1)
    }
  )

  it('commits to the title card after the artwork deadline instead of playing a partial scene', async () => {
    render(
      <TribunalDecisionCinematic
        destination="sequester"
        player={player}
        members={[]}
        history={[]}
        onComplete={vi.fn()}
      />
    )
    expect(createCinematicAudio).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800)
    })
    expect(document.querySelector('.tdc-dialog')).toHaveAttribute('data-presentation', 'slate')
    expect(screen.getByRole('button', { name: 'Continue season' })).toBeEnabled()
    expect(document.querySelectorAll('.tdc-scene img')).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(createCinematicAudio).not.toHaveBeenCalled()
    expect(document.querySelector('.tdc-dialog')).toHaveAttribute('data-presentation', 'slate')
  })

  it('uses the title card when the critical city image fails', () => {
    render(
      <TribunalDecisionCinematic
        destination="exit"
        player={player}
        members={[]}
        history={[]}
        onComplete={vi.fn()}
      />
    )
    fireEvent.error(document.querySelector('.tdc-city-view img')!)
    expect(screen.getByRole('button', { name: 'Home' })).toBeEnabled()
    expect(document.querySelector('.tdc-dialog')).toHaveAttribute('data-presentation', 'slate')
    expect(createCinematicAudio).not.toHaveBeenCalled()
  })

  it.each([
    ['fourth_place', 'exit', 'Fourth place', 'fourth place'],
    ['bronze', 'sequester', 'Bronze medalist', 'The Tribunal will choose'],
    ['bronze_public', 'sequester', 'Bronze medalist', 'The audience will choose'],
  ] as const)(
    'adapts the %s result and continues through its supplied milestone handoff',
    async (milestone, destination, title, copy) => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true },
      })
      const onComplete = vi.fn().mockResolvedValue(true)
      render(
        <TribunalDecisionCinematic
          destination={destination}
          milestone={milestone}
          player={player}
          members={[]}
          history={[]}
          onComplete={onComplete}
        />
      )
      const dialog = screen.getByRole('dialog', { name: title })
      expect(dialog).toHaveTextContent(copy)
      expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Continue season' }))
      })
      expect(onComplete).toHaveBeenCalledTimes(1)
    }
  )
})
