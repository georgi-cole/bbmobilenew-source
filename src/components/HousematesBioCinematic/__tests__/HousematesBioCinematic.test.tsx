import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HousematesBioCinematic from '../HousematesBioCinematic'

const cinematicAudio = {
  play: vi.fn(),
  fadeOutAndStop: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const motion = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({
          children,
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          whileTap: _whileTap,
          ...props
        }: React.HTMLAttributes<HTMLElement> & Record<string, unknown>) =>
          React.createElement(tag, props, children),
    }
  )
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => true,
  }
})

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    panicStopAllMusic: vi.fn(),
    syncMusic: vi.fn(),
  },
}))

vi.mock('../../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: vi.fn(() => cinematicAudio),
}))

describe('Housemates archive', () => {
  afterEach(() => {
    document.head.querySelectorAll('[data-game-image-preload]').forEach((link) => link.remove())
  })

  it('preloads the optimized room backdrops during the intro before the carousel opens', () => {
    render(<HousematesBioCinematic onComplete={vi.fn()} />)

    const backdrops = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="preload"][as="image"][href*="housemate-bio-backgrounds/"]'
    )
    expect(backdrops).toHaveLength(10)
    expect(Array.from(backdrops).every((link) => link.href.endsWith('.webp'))).toBe(true)
    const highPriority = Array.from(backdrops).filter(
      (link) => link.getAttribute('fetchpriority') === 'high'
    )
    expect(highPriority).toHaveLength(2)
    expect(highPriority.every((link) => /music-archive|outback-camp/.test(link.href))).toBe(true)
    expect(
      Array.from(backdrops).filter((link) => link.getAttribute('fetchpriority') === 'low')
    ).toHaveLength(8)
  })

  it('changes from an intro segment into a browseable map and side-by-side profile', async () => {
    render(<HousematesBioCinematic onComplete={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /aria/i })).toBeInTheDocument())
    const ariaNode = screen.getByRole('button', { name: /aria/i })
    fireEvent.click(ariaNode)

    expect(screen.getByRole('heading', { name: 'Aria' })).toBeTruthy()
    expect(screen.getByText(/i.m aria from/i)).toBeTruthy()
    expect(document.querySelector('.hbc-profile__portrait')).toHaveAttribute('alt', 'Aria Colombo')

    fireEvent.click(screen.getByRole('button', { name: /^next/i }))
    expect(screen.getByRole('heading', { name: 'Ash' })).toBeTruthy()
  })

  it('loops the housemates music and provides an exit at every point', async () => {
    const onComplete = vi.fn()
    render(<HousematesBioCinematic onComplete={onComplete} />)

    const { createCinematicAudio } = await import('../../../services/sound/cinematicAudio')
    expect(createCinematicAudio).toHaveBeenCalledWith(
      expect.stringContaining('/assets/sounds/cinematic/HousematesBio.mp4'),
      0.78,
      { loop: true }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Exit Hubmates' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
