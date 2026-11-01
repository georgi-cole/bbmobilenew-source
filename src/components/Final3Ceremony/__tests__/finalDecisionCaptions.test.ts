import { describe, expect, it } from 'vitest'
import { paginateCeremonyCaption } from '../finalDecisionCaptions.mjs'

function paginate(text: string, capacity: number) {
  return paginateCeremonyCaption(text, (candidate) => Array.from(candidate).length <= capacity)
}

function expectPreserved(text: string, pages: string[]) {
  expect(pages.join(' ')).toBe(text.trim().replace(/\s+/gu, ' '))
}

describe('final decision caption pagination', () => {
  it('keeps each complete thought together instead of filling the monitor greedily', () => {
    const text = 'I kept showing up for this game. Give me one last chance to finish it beside you.'
    const pages = paginate(text, 34)
    expect(pages).toEqual([
      'I kept showing up for this game.',
      'Give me one last chance',
      'to finish it beside you.',
    ])
    expectPreserved(text, pages)
  })

  it('rebalances a long sentence rather than putting its final word on another screen', () => {
    const text = 'Give me one last chance to finish what I started.'
    const pages = paginate(text, 44)
    expect(pages).toEqual(['Give me one last chance', 'to finish what I started.'])
    expectPreserved(text, pages)
  })

  it('does not separate a standalone punctuation mark or closing quote from its words', () => {
    const text = 'You said “ I can trust you ” . Please keep that promise tonight !'
    const pages = paginate(text, 29)
    expect(pages.every((page) => /[\p{L}\p{N}]/u.test(page))).toBe(true)
    expect(pages.every((page) => !/^[.,!?;:”)\]}]/u.test(page))).toBe(true)
    expect(pages.every((page) => !/[“([{]$/u.test(page))).toBe(true)
    expect(pages.every((page) => page.length <= 29)).toBe(true)
    expectPreserved(text, pages)
  })

  it('joins a one-word appeal to its neighboring thought before balancing pages', () => {
    const text = 'Please. Give me a chance to finish this game beside you.'
    const pages = paginate(text, 31)
    expect(pages).not.toContain('Please.')
    expect(pages.every((page) => page.split(' ').length >= 3)).toBe(true)
    expectPreserved(text, pages)
  })

  it('attaches straight closing quotes and currency symbols to the relevant word', () => {
    const text = 'You said " I trust you " . I won $ 500 for our team.'
    const pages = paginate(text, 26)
    expect(pages.some((page) => page.endsWith('you " .'))).toBe(true)
    expect(pages.every((page) => !page.endsWith('$'))).toBe(true)
    expectPreserved(text, pages)
  })

  it('can put multiple short complete sentences on one screen', () => {
    expect(paginate('I fought. I stayed. Now let me finish this game beside you.', 24)).toEqual([
      'I fought. I stayed.',
      'Now let me finish',
      'this game beside you.',
    ])
  })

  it.each([24, 29, 34, 40, 48])(
    'avoids a one-word final screen for the actual Dex plea at capacity %s',
    (capacity) => {
      const text = 'There is no perfect choice tonight. I am asking you to let my story continue.'
      const pages = paginate(text, capacity)
      expect(pages.every((page) => page.length <= capacity)).toBe(true)
      expect(pages.every((page) => page.split(' ').length >= 3)).toBe(true)
      expectPreserved(text, pages)
    }
  )

  it('balances an unpunctuated sentence and keeps determiners with their phrase', () => {
    const text = 'I want the chance to finish our story beside you at the final tonight'
    const pages = paginate(text, 27)
    expect(pages.every((page) => page.split(' ').length >= 3)).toBe(true)
    expect(pages.every((page) => !/\b(?:the|to|our|at)$/u.test(page))).toBe(true)
    expectPreserved(text, pages)
  })

  it('keeps the production comparison labels with their own relationship and Tribunal beats', () => {
    const text =
      'Romance — this became more than a game relationship · Alliance — you worked together when it mattered · Tribunal read — hard to judge, so this estimate is uncertain'
    const pages = paginate(text, 54)
    expect(pages).toEqual([
      'Romance — this became more than a game relationship ·',
      'Alliance — you worked together when it mattered ·',
      'Tribunal read — hard to judge,',
      'so this estimate is uncertain',
    ])
    expectPreserved(text, pages)
  })

  it('does not strand a comparison modifier or its separator on a narrow monitor', () => {
    const text =
      'Romance — this became more than a game relationship · Alliance — you worked together when it mattered · Tribunal read — hard to judge, so this estimate is uncertain'
    const pages = paginate(text, 38)
    expect(pages).toEqual([
      'Romance — this became',
      'more than a game relationship ·',
      'Alliance — you worked together',
      'when it mattered ·',
      'Tribunal read — hard to judge,',
      'so this estimate is uncertain',
    ])
    expectPreserved(text, pages)
  })

  it('preserves Unicode words and quotes without splitting graphemes', () => {
    const text = 'Аз останах до края. Дай ми още един шанс да продължа с теб.'
    const pages = paginate(text, 25)
    expect(pages.every((page) => page.length <= 25)).toBe(true)
    expect(pages.every((page) => page.split(' ').length >= 3)).toBe(true)
    expectPreserved(text, pages)
  })

  it('keeps an oversized name or compound word whole for adaptive font sizing', () => {
    const name = 'Alexandria-Catherine'
    expect(paginate(name, 8)).toEqual([name])
    expect(paginate('👨‍👩‍👧‍👦', 2)).toEqual(['👨‍👩‍👧‍👦'])
  })

  it('uses word boundaries for an unspaced script without losing punctuation', () => {
    const text = '我一直坚持到最后。请再给我一次机会，让我和你一起完成这场比赛。'
    const pages = paginate(text, 12)
    expect(pages.join('')).toBe(text)
    expect(pages.every((page) => Array.from(page).length <= 12)).toBe(true)
    expect(pages.every((page) => !/^[，。！？]/u.test(page))).toBe(true)
  })

  it('handles empty text and normalizes whitespace without inventing content', () => {
    expect(paginateCeremonyCaption(undefined, () => true)).toEqual([''])
    expect(paginate('  Give\nme   one last\tchance. ', 80)).toEqual(['Give me one last chance.'])
  })
})
