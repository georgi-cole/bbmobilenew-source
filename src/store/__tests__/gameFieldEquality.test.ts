import { describe, expect, it } from 'vitest'
import { createGameFieldEquality } from '../gameFieldEquality'
import { createInitialGameState } from '../gameSlice'

describe('game field equality', () => {
  it('ignores changes to fields a screen does not read', () => {
    const equals = createGameFieldEquality(['phase', 'players'])
    const previous = createInitialGameState()
    const next = { ...previous, week: previous.week + 1 }

    expect(equals(previous, next)).toBe(true)
  })

  it('updates when a selected field changes', () => {
    const equals = createGameFieldEquality(['phase', 'players'])
    const previous = createInitialGameState()
    const next = { ...previous, phase: 'social_2' as const }

    expect(equals(previous, next)).toBe(false)
  })
})
