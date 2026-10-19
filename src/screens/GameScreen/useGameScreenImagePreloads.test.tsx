import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  useGameScreenImagePreloads,
  type GameScreenImagePreloadState,
} from './useGameScreenImagePreloads'

function getPreloadedImageUrls(): string[] {
  return Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="preload"][as="image"][data-game-image-preload]'
    ),
    (link) => link.href
  )
}

function renderPreloader(overrides: Partial<GameScreenImagePreloadState> = {}) {
  const state: GameScreenImagePreloadState = {
    activeConfessionalDecisionKey: null,
    activeConfessionalDecisionType: undefined,
    finaleWeekendActive: false,
    phase: 'week_start',
    ...overrides,
  }
  return renderHook(() => useGameScreenImagePreloads(state))
}

describe('useGameScreenImagePreloads', () => {
  afterEach(() => {
    cleanup()
    document.head.querySelectorAll('[data-game-image-preload]').forEach((link) => link.remove())
  })

  it('warms Confessional and eviction reveal images before a pending vote is entered', () => {
    renderPreloader({
      activeConfessionalDecisionKey: 'eviction_vote:9:live_vote',
      activeConfessionalDecisionType: 'eviction_vote',
    })

    const urls = getPreloadedImageUrls()
    expect(urls.some((url) => url.includes('confessional-painting.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('confessional-locked-door.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('elimination-living-room.webp'))).toBe(true)
  })

  it('warms the Confessional and full finale sequence when Final 4 eviction begins', () => {
    renderPreloader({ phase: 'final4_eviction' })

    const urls = getPreloadedImageUrls()
    expect(urls.some((url) => url.includes('confessional-painting.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('confessional-locked-door.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('final-power-battle-backyard.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('final-power-battle-duel.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('final-power-battle-spectator.webp'))).toBe(true)
    expect(urls.some((url) => url.includes('final-two-hub-living-room.webp'))).toBe(true)
  })

  it('warms the Tribunal backdrop when a finale weekend begins', () => {
    renderPreloader({ finaleWeekendActive: true })

    expect(getPreloadedImageUrls().some((url) => url.includes('tribunal-sequester.webp'))).toBe(
      true
    )
  })
})
