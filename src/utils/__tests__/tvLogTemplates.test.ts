import { describe, expect, it } from 'vitest'
import { normalizeGameCopy, tease } from '../tvLogTemplates'

describe('normalizeGameCopy', () => {
  it('updates sentence-initial Housemates while preserving capitalization', () => {
    expect(normalizeGameCopy('Housemates congratulate Mimi. Alliances are already forming…')).toBe(
      'Hubmates congratulate Mimi. Alliances are already forming…'
    )
  })

  it('updates house terminology in existing saved log messages', () => {
    expect(normalizeGameCopy('The house will vote to eliminate.')).toBe(
      'The Hub will vote to eliminate.'
    )
  })

  it('keeps lowercase replacements lowercase when they are mid-sentence', () => {
    expect(normalizeGameCopy('Several housemates are talking.')).toBe(
      'Several hubmates are talking.'
    )
  })

  it('normalizes before truncating teaser copy', () => {
    expect(tease('Housemates make their final pitches before the live vote. 🤝', 80)).toBe(
      'Hubmates make their final pitches before the live vote. 🤝'
    )
  })

  it('replaces format terms in legacy copy while preserving the game glossary', () => {
    expect(
      normalizeGameCopy(
        'The Big Brother house chose to evict the backdoor target. The Leader of the House used the Power of Veto.'
      )
    ).toBe(
      'The Hub chose to eliminate the replacement target. The Leader of the Hub used the Power of Safety.'
    )
  })

  it('leaves the approved full role names unchanged', () => {
    expect(normalizeGameCopy('The Leader of the Hub won the Power of Safety.')).toBe(
      'The Leader of the Hub won the Power of Safety.'
    )
  })

  it('normalizes older house, Veto, and self-eviction phrasing without changing capitalization', () => {
    expect(
      normalizeGameCopy('The Big Brother house has housemates discussing a BACKDOOR TARGET.')
    ).toBe('The Hub has hubmates discussing a REPLACEMENT TARGET.')
    expect(normalizeGameCopy('The player requested a self-eviction.')).toBe(
      'The player requested a voluntary exit.'
    )
    expect(normalizeGameCopy('The veto is still available.')).toBe('The safety is still available.')
  })
})
