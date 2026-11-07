import { describe, expect, it } from 'vitest'
import { getMinigamePixelRatio } from '../canvasQuality'

describe('minigame canvas pixel budget', () => {
  it('reduces high-density phone buffers without changing logical dimensions', () => {
    const ratio = getMinigamePixelRatio(390, 700, 3)
    expect(ratio).toBe(2)
    expect(390 * 700 * ratio ** 2).toBeLessThan(390 * 700 * 3 ** 2)
  })

  it('also budgets large canvases and keeps ordinary displays at their native ratio', () => {
    const ratio = getMinigamePixelRatio(1200, 800, 2)
    expect(1200 * 800 * ratio ** 2).toBeCloseTo(2_000_000)
    expect(getMinigamePixelRatio(390, 700, 1)).toBe(1)
  })

  it.each([NaN, Infinity, 0, -1])('handles invalid device ratios (%s)', (ratio) => {
    expect(getMinigamePixelRatio(390, 700, ratio)).toBe(1)
  })
})
