import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CeremonyOverlay from '../src/components/CeremonyOverlay/CeremonyOverlay'
import PublicSaveReveal from '../src/components/PublicSaveReveal/PublicSaveReveal'
import AudienceVerdictReveal from '../src/components/AudienceVerdictReveal/AudienceVerdictReveal'
import ShockIntroOverlay from '../src/components/ui/ShockIntroOverlay/ShockIntroOverlay'
import TvAnnouncementOverlay from '../src/components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import FinalLightsOutSequence from '../src/components/FinalLightsOutSequence/FinalLightsOutSequence'
import VoxFinalistShowcase from '../src/components/VoxPopuliFinale/VoxFinalistShowcase'
import { SoundManager } from '../src/services/sound/SoundManager'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
  getPresentationOwner,
} from '../src/services/presentation/presentationOwnership'
import type { Player } from '../src/types'

const nominees = [
  { id: 'a', name: 'Alex', avatar: '🧑', status: 'nominated' },
  { id: 'b', name: 'Lia', avatar: '🧑', status: 'nominated' },
] as Player[]
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(SoundManager, 'play').mockResolvedValue()
})
afterEach(async () => {
  cleanup()
  await Promise.resolve()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('covered presentation work', () => {
  it('pauses the lights-out stage and releases its pending work on unmount', async () => {
    const complete = vi.fn()
    const { container, unmount } = render(<FinalLightsOutSequence onComplete={complete} />)
    act(() => vi.advanceTimersByTime(400))
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      act(() => vi.advanceTimersByTime(30_000))
      expect(container.querySelector('.flo-overlay')).toHaveClass('flo-stage-0')
      expect(container.querySelector('.flo-overlay')).toHaveAttribute('inert')
      expect(complete).not.toHaveBeenCalled()
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(399))
      expect(container.querySelector('.flo-overlay')).toHaveClass('flo-stage-0')
      act(() => vi.advanceTimersByTime(1))
      expect(container.querySelector('.flo-overlay')).toHaveClass('flo-stage-1')
      unmount()
      act(() => vi.advanceTimersByTime(30_000))
      expect(complete).not.toHaveBeenCalled()
    } finally {
      release()
    }
  })

  it('preserves a finalist slide during coverage and cancels its timer before Skip completes', async () => {
    const complete = vi.fn()
    const { container } = render(
      <VoxFinalistShowcase
        finalists={[{ player: nominees[0], powerMoves: ['Won safety'] }]}
        onComplete={complete}
      />
    )
    act(() => vi.advanceTimersByTime(1000))
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
      })
      act(() => vi.advanceTimersByTime(30_000))
      expect(container.querySelector('.vox-finalist-showcase')).toHaveAttribute('inert')
      expect(complete).not.toHaveBeenCalled()
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(2199))
      expect(container.querySelector('.vox-finalist-showcase__slide')).toHaveClass(
        'vox-finalist-showcase__slide--story'
      )
      fireEvent.click(screen.getByRole('button', { name: 'Skip presentation' }))
      act(() => vi.advanceTimersByTime(30_000))
      expect(complete).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
  })

  it.each(['ceremony', 'public-save-reveal', 'audience-verdict'] as const)(
    'pauses %s and completes only after its remaining visible time',
    async (family) => {
      const complete = vi.fn()
      const duration = family === 'ceremony' ? 3150 : family === 'public-save-reveal' ? 10000 : 6200
      render(
        family === 'ceremony' ? (
          <CeremonyOverlay
            tiles={[{ rect: new DOMRect(20, 30, 80, 80), badge: '👑' }]}
            caption="Result"
            onDone={complete}
          />
        ) : family === 'public-save-reveal' ? (
          <PublicSaveReveal
            nominees={nominees}
            approvals={{ a: 60, b: 40 }}
            savedId="a"
            onDone={complete}
          />
        ) : (
          <AudienceVerdictReveal
            nominees={nominees}
            voteShares={{ a: 60, b: 40 }}
            savedId="a"
            onDone={complete}
          />
        )
      )
      act(() => vi.advanceTimersByTime(500))
      const root = document.querySelector(`[data-presentation-root="${family}"]`)
      expect(root).not.toBeNull()
      let release = () => {}
      try {
        act(() => {
          release = acquirePresentationOwnership(
            createPresentationOwnerToken(),
            'timed-gameplay',
            200
          )
        })
        expect(root).toHaveAttribute('data-presentation-suspended', 'true')
        expect(root).toHaveAttribute('inert')
        act(() => vi.advanceTimersByTime(30_000))
        expect(complete).not.toHaveBeenCalled()
        await act(async () => {
          release()
          await Promise.resolve()
        })
        expect(root).not.toHaveAttribute('data-presentation-suspended')
        act(() => vi.advanceTimersByTime(duration - 501))
        expect(complete).not.toHaveBeenCalled()
        act(() => vi.advanceTimersByTime(1))
        expect(complete).toHaveBeenCalledTimes(1)
      } finally {
        release()
      }
    }
  )

  it('shares the fullscreen shock owner with its card and never repeats its audio cue or OK action', async () => {
    const complete = vi.fn()
    render(<ShockIntroOverlay active shockKey="double_eviction" onComplete={complete} />)
    act(() => vi.advanceTimersByTime(0))
    expect(getPresentationOwner()?.groupId).toBe('broadcast-shock')
    expect(screen.getByRole('dialog', { name: 'Announcement: Double Elimination!' })).toBeVisible()
    expect(SoundManager.play).toHaveBeenCalledTimes(1)
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(createPresentationOwnerToken(), 'finale', 100)
      })
      expect(screen.getByTestId('shock-intro-overlay')).toHaveAttribute('inert')
      act(() => vi.advanceTimersByTime(20_000))
      expect(complete).not.toHaveBeenCalled()
      await act(async () => {
        release()
        await Promise.resolve()
      })
      act(() => vi.advanceTimersByTime(0))
      expect(SoundManager.play).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      expect(complete).toHaveBeenCalledTimes(1)
    } finally {
      release()
    }
  })

  it('keeps one TV frame callback and freezes its dismiss clock when covered', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => {
      frames.delete(handle)
    })
    const dismiss = vi.fn()
    render(
      <TvAnnouncementOverlay
        announcement={{
          key: 'ordinary',
          title: 'Result',
          subtitle: '',
          isLive: false,
          autoDismissMs: 2000,
        }}
        onDismiss={dismiss}
      />
    )
    function tick(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms)
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback(performance.now()))
      })
    }
    expect(frames.size).toBe(1)
    tick(500)
    let release = () => {}
    try {
      act(() => {
        release = acquirePresentationOwnership(
          createPresentationOwnerToken(),
          'timed-gameplay',
          200
        )
      })
      expect(frames.size).toBe(0)
      tick(20_000)
      expect(dismiss).not.toHaveBeenCalled()
      await act(async () => {
        release()
        await Promise.resolve()
      })
      expect(frames.size).toBe(1)
      tick(1499)
      expect(dismiss).not.toHaveBeenCalled()
      tick(1)
      expect(dismiss).toHaveBeenCalledTimes(1)
      expect(frames.size).toBe(0)
    } finally {
      release()
    }
  })
})
