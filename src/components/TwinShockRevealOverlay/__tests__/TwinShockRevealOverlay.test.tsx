import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TwinShockRevealAnimation } from '../../../types'
import { preloadImages, type ImagePreloadResult } from '../../../utils/preload'
import TwinShockRevealOverlay from '../TwinShockRevealOverlay'
import {
  acquirePresentationOwnership,
  createPresentationOwnerToken,
} from '../../../services/presentation/presentationOwnership'

vi.mock('../../../utils/preload', () => ({ preloadImages: vi.fn() }))

const combined: TwinShockRevealAnimation = {
  type: 'combined',
  playerId: 'lia',
  fromName: 'Lia',
  fromAvatar: '/lia.webp',
  toName: 'Lia & Ali',
  toAvatar: '/lia-ali-full.webp',
}
const separate: TwinShockRevealAnimation = {
  type: 'ali_enters',
  replacedPlayerId: 'finn',
  replacedPlayerName: 'Finn',
  replacedPlayerAvatar: '/finn.webp',
  incomingPlayerId: 'ali',
  incomingName: 'Ali',
  incomingAvatar: '/ali.webp',
}

function addLiveTile(src: string, name: string) {
  const tile = document.createElement('div')
  const image = document.createElement('img')
  image.src = src
  image.alt = name
  tile.append(image)
  document.body.append(tile)
  return { tile, image }
}

describe('TwinShockRevealOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.mocked(preloadImages).mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.classList.remove('no-animations')
    document.body.innerHTML = ''
  })

  it.each([
    {
      reveal: combined,
      target: 'lia',
      before: '/lia.webp',
      after: '/lia-ali-512.webp',
      name: 'Lia & Ali',
    },
    { reveal: separate, target: 'ali', before: '/finn.webp', after: '/ali.webp', name: 'Ali' },
  ])(
    'reveals the actual roster image for $target',
    async ({ reveal, target, before, after, name }) => {
      const { tile, image } = addLiveTile(after, name)
      const onDone = vi.fn()
      const getTile = vi.fn(() => tile)
      const { unmount } = render(
        <TwinShockRevealOverlay reveal={reveal} getTile={getTile} onDone={onDone} />
      )
      const cover = tile.querySelector('.twin-shock-reveal')
      const outgoing = cover?.querySelector('img')
      expect(getTile).toHaveBeenCalledWith(target)
      expect(outgoing).toHaveAttribute('src', before)
      expect(preloadImages).toHaveBeenCalledWith([before, image.src], undefined, 1400)

      await act(async () => vi.advanceTimersByTimeAsync(650))
      expect(cover).toHaveClass('twin-shock-reveal--revealing')
      expect(cover).toHaveAccessibleName(name)
      expect(tile.firstElementChild).toBe(image)
      expect(tile.style.visibility).toBe('')
      expect(onDone).not.toHaveBeenCalled()

      await act(async () => vi.advanceTimersByTimeAsync(1270))
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(cover).not.toBeInTheDocument()
      unmount()
      expect(image).toBeInTheDocument()
    }
  )

  it('holds the outgoing portrait until the live art has had time to decode', async () => {
    let finishPreload!: (value: ImagePreloadResult[]) => void
    vi.mocked(preloadImages).mockReturnValueOnce(
      new Promise((resolve) => {
        finishPreload = resolve
      })
    )
    const { tile } = addLiveTile('/lia-ali-512.webp', 'Lia & Ali')
    const onDone = vi.fn()
    render(<TwinShockRevealOverlay reveal={combined} getTile={() => tile} onDone={onDone} />)

    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(tile.querySelector('.twin-shock-reveal')).not.toHaveClass('twin-shock-reveal--revealing')
    expect(onDone).not.toHaveBeenCalled()

    await act(async () => {
      finishPreload([])
      await vi.advanceTimersByTimeAsync(1920)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('suspends the wipe while a higher-priority presentation owns the screen', async () => {
    const { tile, image } = addLiveTile('/lia-ali-512.webp', 'Lia & Ali')
    const onDone = vi.fn()
    render(<TwinShockRevealOverlay reveal={combined} getTile={() => tile} onDone={onDone} />)

    let release = () => {}
    act(() => {
      release = acquirePresentationOwnership(createPresentationOwnerToken(), 'gameplay', 200)
    })
    await act(async () => vi.advanceTimersByTimeAsync(3000))
    expect(onDone).not.toHaveBeenCalled()
    expect(tile.querySelector('.twin-shock-reveal')).toBeNull()
    expect(image).toBeInTheDocument()

    await act(async () => {
      release()
    })
    await act(async () => vi.advanceTimersByTimeAsync(1920))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('hands back to the roster immediately with reduced motion', async () => {
    document.body.classList.add('no-animations')
    const { tile, image } = addLiveTile('/ali.webp', 'Ali')
    const onDone = vi.fn()
    render(<TwinShockRevealOverlay reveal={separate} getTile={() => tile} onDone={onDone} />)
    await act(async () => vi.advanceTimersByTimeAsync(0))
    expect(tile.querySelector('.twin-shock-reveal')).toBeNull()
    expect(image).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
