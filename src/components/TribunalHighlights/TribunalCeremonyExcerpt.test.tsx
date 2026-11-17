import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTribunalScenario } from '../../experiments/tribunalHighlights/fixtures'
import TribunalCeremonyExcerpt from './TribunalCeremonyExcerpt'

const clip = vi.hoisted(() => ({
  prepare: vi.fn(),
  mount: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}))
vi.mock('../../cinematic/ceremonies/renderer.js', () => ({ createClip: () => clip }))

beforeEach(() => {
  vi.clearAllMocks()
  clip.prepare.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('existing ceremony recap excerpts', () => {
  it.each(['loh', 'safety'] as const)(
    'reuses the actual %s film for the recorded actor',
    async (scene) => {
      const player = createTribunalScenario().players.find((entry) => entry.name === 'Lia')!
      const onReady = vi.fn()
      const { unmount } = render(
        <TribunalCeremonyExcerpt scene={scene} players={[player]} onReady={onReady} />
      )
      await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
      expect(clip.prepare).toHaveBeenCalledWith(
        scene,
        expect.objectContaining({
          a: expect.objectContaining({ playerId: player.id, name: 'Lia' }),
        }),
        'generic',
        { nomineeCount: 1 }
      )
      expect(clip.mount).toHaveBeenCalledWith(
        screen.getByTestId('tribunal-ceremony-excerpt'),
        expect.any(Function),
        expect.any(Function),
        'generic',
        {
          excerpt: {
            fromMs: scene === 'loh' ? 2100 : 2350,
            toMs: scene === 'loh' ? 2600 : 3100,
            durationMs: 3000,
          },
        }
      )
      expect(screen.getByTestId('tribunal-ceremony-excerpt')).toHaveClass('is-ready')
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      fireEvent(document, new Event('visibilitychange'))
      expect(clip.pause).toHaveBeenCalledOnce()
      hidden.mockReturnValue(false)
      fireEvent(document, new Event('visibilitychange'))
      expect(clip.resume).toHaveBeenCalled()
      unmount()
      expect(clip.stop).toHaveBeenCalledOnce()
    }
  )

  it('casts every recorded nominee without pulling in the next cycle’s power holders', async () => {
    const game = createTribunalScenario('double')
    const players = game.nomineeIds.map((id) => game.players.find((player) => player.id === id)!)
    const onReady = vi.fn()
    render(<TribunalCeremonyExcerpt scene="nominations" players={players} onReady={onReady} />)
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    const [scene, cast, , details] = clip.prepare.mock.calls[0]
    expect(scene).toBe('nominations')
    expect([cast.a.playerId, cast.b.playerId, cast.c.playerId]).toEqual(game.nomineeIds)
    expect(details).toEqual({ nomineeCount: 3 })
    expect(clip.mount.mock.calls[0][4].excerpt).toEqual({
      fromMs: 3500,
      toMs: 3750,
      durationMs: 3000,
    })
  })

  it('falls back without substituting a different identity when the human has a custom photo', async () => {
    const player = {
      ...createTribunalScenario().players[0],
      isUser: true,
      avatar: 'data:image/png;base64,photo',
      appearance: undefined,
    }
    const onReady = vi.fn()
    render(<TribunalCeremonyExcerpt scene="loh" players={[player]} onReady={onReady} />)
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(clip.prepare).not.toHaveBeenCalled()
    expect(clip.mount).not.toHaveBeenCalled()
    expect(screen.getByTestId('tribunal-ceremony-excerpt')).not.toHaveClass('is-ready')
  })

  it('releases a stuck load and prevents a late film from covering the next result', async () => {
    vi.useFakeTimers()
    let resolvePreparation!: (value: object) => void
    clip.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreparation = resolve
        })
    )
    const player = createTribunalScenario().players.find((entry) => entry.name === 'Lia')!
    const onReady = vi.fn()
    const { unmount } = render(
      <TribunalCeremonyExcerpt scene="loh" players={[player]} onReady={onReady} />
    )
    await act(async () => {
      await vi.dynamicImportSettled()
    })
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(onReady).toHaveBeenCalledOnce()
    expect(clip.stop).toHaveBeenCalledOnce()
    unmount()
    await act(async () => {
      resolvePreparation({})
    })
    expect(clip.mount).not.toHaveBeenCalled()
    expect(onReady).toHaveBeenCalledOnce()
  })
})
