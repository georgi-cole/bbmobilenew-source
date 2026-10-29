import { describe, expect, it } from 'vitest'
import { resolveWeekendVisualTheme } from './weekendVisualTheme'

describe('resolveWeekendVisualTheme', () => {
  it('maps each active weekend and the finale weekend to its visual theme', () => {
    expect(resolveWeekendVisualTheme({ active: true, weekendNumber: 1 })).toBe('fireside')
    expect(resolveWeekendVisualTheme({ active: true, weekendNumber: 2 })).toBe('party')
    expect(resolveWeekendVisualTheme({ active: true, finaleWeekend: true })).toBe('reunion')
  })

  it('does not apply a weekend theme outside an active interlude', () => {
    expect(resolveWeekendVisualTheme({ active: false, weekendNumber: 1 })).toBeNull()
    expect(resolveWeekendVisualTheme(null)).toBeNull()
  })
})
