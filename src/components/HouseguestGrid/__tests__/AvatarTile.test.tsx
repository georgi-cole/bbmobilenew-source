import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AvatarTile, { EVICTION_MARK_ANIMATION_FALLBACK_MS } from '../AvatarTile'
import { setDepressionShockVisualPhase } from '../../../features/twists/depressionShock'
import { STATUS_BADGE_EMOJI } from '../../../utils/statusBadges'

afterEach(() => {
  setDepressionShockVisualPhase('inactive')
  sessionStorage.clear()
  vi.useRealTimers()
})

describe('AvatarTile', () => {
  it('exposes interaction guidance without an unrelated visual indicator', () => {
    const { container } = render(
      <AvatarTile name="Taylor" onClick={vi.fn()} descriptionId="roster-help" />
    )
    const tile = screen.getByRole('button', { name: 'Taylor' })
    expect(tile).toHaveAttribute('aria-describedby', 'roster-help')
    expect(tile.className).toContain('interactive')
    expect(container.querySelector('[class*="interactionCue"]')).toBeNull()
  })
  it('renders the nomination badge asset for nominated players', () => {
    render(<AvatarTile name="Taylor" avatarUrl="/avatars/Taylor.png" statuses="nominated" />)

    const badge = screen.getByLabelText('Nominated')
    const badgeImage = badge.querySelector('img')

    expect(badge).not.toHaveTextContent('❓')
    expect(badgeImage).not.toBeNull()
    expect(badgeImage?.getAttribute('src')).toContain('/assets/avatar_badges/nomination_badge.png')
  })

  it('renders the custom Tribunal crest instead of the generic scales emoji', () => {
    render(<AvatarTile name="Taylor" avatarUrl="/avatars/Taylor.png" statuses="jury" />)

    const badge = screen.getByLabelText('Tribunal Member')
    const badgeImage = badge.querySelector('img')

    expect(badge).not.toHaveTextContent('⚖️')
    expect(badgeImage?.getAttribute('src')).toContain('/assets/avatar_badges/tribunal_badge.svg')
    expect(STATUS_BADGE_EMOJI.jury).toBe('⚖️')
  })

  it('uses the generated sad portrait while Depression Shock is active', () => {
    setDepressionShockVisualPhase('day1')
    render(<AvatarTile name="Lia" avatarUrl="/bbmobilenew/assets/skins/Lia_avatar.webp" />)

    expect(screen.getByRole('img', { name: 'Lia' })).toHaveAttribute(
      'src',
      '/assets/skins/Lia_sad_avatar.webp'
    )
  })

  it('keeps the permanent eviction strike after its one-time entrance finishes', () => {
    vi.useFakeTimers()
    const evictionMarkKey = 'test:eviction-mark:taylor'
    const { container } = render(
      <AvatarTile
        name="Taylor"
        avatarUrl="/avatars/Taylor.png"
        isEvicted
        evictionMarkKey={evictionMarkKey}
      />
    )

    const mark = container.querySelector('[style*="--eviction-mark-mask"]')
    expect(mark).not.toBeNull()
    expect(mark?.className).toContain('crossAnimated')
    expect(sessionStorage.getItem(evictionMarkKey)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(EVICTION_MARK_ANIMATION_FALLBACK_MS)
    })

    const permanentMark = container.querySelector('[style*="--eviction-mark-mask"]')
    expect(permanentMark).not.toBeNull()
    expect(permanentMark?.className).not.toContain('crossAnimated')
    expect(sessionStorage.getItem(evictionMarkKey)).toBe('shown')
  })

  it('shows a CSS eviction strike if the bundled strike image cannot load', () => {
    const { container } = render(<AvatarTile name="Taylor" isEvicted />)
    const mark = container.querySelector('img[src*="/evictionmark/evictionmark.png"]')

    expect(mark).not.toBeNull()
    fireEvent.error(mark!)

    expect(container.querySelector('img[src*="/evictionmark/evictionmark.png"]')).toBeNull()
    expect(container.querySelector('[class*="crossFallback"]')).not.toBeNull()
  })

  it('does not consume the eviction-strike entrance when the tile is torn down early', () => {
    vi.useFakeTimers()
    const evictionMarkKey = 'test:eviction-mark:echo'
    const first = render(
      <AvatarTile
        name="Echo"
        avatarUrl="/avatars/Echo.png"
        isEvicted
        evictionMarkKey={evictionMarkKey}
      />
    )

    expect(sessionStorage.getItem(evictionMarkKey)).toBeNull()
    first.unmount()

    expect(sessionStorage.getItem(evictionMarkKey)).toBeNull()

    const second = render(
      <AvatarTile
        name="Echo"
        avatarUrl="/avatars/Echo.png"
        isEvicted
        evictionMarkKey={evictionMarkKey}
      />
    )
    const retriedMark = second.container.querySelector('[style*="--eviction-mark-mask"]')
    expect(retriedMark).not.toBeNull()
    expect(retriedMark?.className).toContain('crossAnimated')

    act(() => {
      vi.advanceTimersByTime(EVICTION_MARK_ANIMATION_FALLBACK_MS)
    })

    expect(sessionStorage.getItem(evictionMarkKey)).toBe('shown')
    expect(
      second.container.querySelector('[style*="--eviction-mark-mask"]')?.className
    ).not.toContain('crossAnimated')
  })

  it('keeps a revealed name visible without replaying its entrance animation', () => {
    const { container } = render(<AvatarTile name="Taylor" showName animateNameReveal={false} />)

    const name = container.querySelector('[class*="nameOverlay"]')
    expect(name).not.toBeNull()
    expect(name?.className).not.toContain('nameRevealed')
  })
})
