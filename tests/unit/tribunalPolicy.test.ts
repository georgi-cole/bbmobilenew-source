import { describe, expect, it } from 'vitest'
import {
  defaultTribunalSizeForCast,
  preTribunalExitCount,
  resolveTribunalSize,
  shouldJoinTribunal,
} from '../../src/rules/tribunalPolicy'

describe('Tribunal policy', () => {
  it.each([
    [4, 1],
    [5, 3],
    [7, 3],
    [8, 5],
    [9, 5],
    [10, 7],
    [13, 7],
    [14, 9],
    [16, 9],
  ])('scales a %i-player starting cast to %i Tribunal members', (castSize, tribunalSize) => {
    expect(defaultTribunalSizeForCast(castSize)).toBe(tribunalSize)
  })

  it('leaves five pre-Tribunal exits in the standard 16-player Classic season', () => {
    const tribunalSize = resolveTribunalSize(16, { tribunalSize: 9 })
    expect(preTribunalExitCount(16, tribunalSize)).toBe(5)
    expect(shouldJoinTribunal(4, 16, tribunalSize)).toBe(false)
    expect(shouldJoinTribunal(5, 16, tribunalSize)).toBe(true)
  })

  it('honours old jurySize saves while normalizing an even Tribunal down to odd', () => {
    expect(resolveTribunalSize(12, { jurySize: 7 })).toBe(7)
    expect(resolveTribunalSize(12, { jurySize: 8 })).toBe(7)
  })

  it('supports modes that explicitly disable the Tribunal', () => {
    expect(resolveTribunalSize(16, { tribunalSize: 0 })).toBe(0)
  })
})
