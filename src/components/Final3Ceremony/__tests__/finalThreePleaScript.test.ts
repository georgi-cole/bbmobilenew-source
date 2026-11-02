import { describe, expect, it } from 'vitest'
import type { Player } from '../../../types'
import { readFinalThreeDecision } from '../../../social/finalThreeDecision'
import { buildFinalThreePleaExchanges } from '../finalThreePleaScript'

const nominee = (id: string, wins = 0, nominations = 0): Player => ({
  id,
  name: id,
  avatar: '',
  status: 'nominated',
  stats: { lohWins: wins, posWins: 0, timesNominated: nominations },
})

function scriptsFor(
  nominees: Player[],
  relationships: Record<string, { affinity: number; tags: string[] }> = {}
) {
  const reads = Object.fromEntries(
    nominees.map((player) => [
      player.id,
      readFinalThreeDecision(
        {
          holderId: 'holder',
          relationships: {
            holder: {
              [player.id]: relationships[player.id] ?? { affinity: 0, tags: [] },
            },
          },
        },
        player
      ),
    ])
  )
  return buildFinalThreePleaExchanges(nominees, reads)
}

function sharedFourWordPhrases(left: string, right: string): number {
  const words = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
  const phrases = (text: string) => {
    const tokens = words(text)
    return new Set(tokens.slice(0, -3).map((_, i) => tokens.slice(i, i + 4).join(' ')))
  }
  const first = phrases(left)
  const second = phrases(right)
  return [...first].filter((phrase) => second.has(phrase)).length
}

describe('Classic Final Three pair-authored pleas', () => {
  it('gives equally unrecorded nominees distinct, non-robotic speeches and holder responses', () => {
    const scripts = scriptsFor([nominee('ash'), nominee('bea')])
    expect(scripts.ash.plea).not.toBe(scripts.bea.plea)
    expect(scripts.ash.response).not.toBe(scripts.bea.response)
    expect(sharedFourWordPhrases(scripts.ash.plea, scripts.bea.plea)).toBe(0)
    expect(sharedFourWordPhrases(scripts.ash.response, scripts.bea.response)).toBe(0)
    for (const { plea } of Object.values(scripts)) {
      expect(plea).not.toMatch(/competition wins|faced the block|alliance|trusted each other/i)
    }
  })

  it('does not repeat the same achievement speech when both nominees have identical wins', () => {
    const scripts = scriptsFor([nominee('ash', 2), nominee('bea', 2)])
    const pleas = Object.values(scripts).map(({ plea }) => plea)
    expect(pleas.filter((plea) => plea.includes('2 competition wins'))).toHaveLength(1)
    expect(pleas[0]).not.toBe(pleas[1])
    expect(scripts.ash.response).not.toBe(scripts.bea.response)
  })

  it('does not repeat the same bond speech when both have identical relationship evidence', () => {
    const scripts = scriptsFor([nominee('ash'), nominee('bea')], {
      ash: { affinity: 60, tags: ['alliance'] },
      bea: { affinity: 60, tags: ['alliance'] },
    })
    expect(scripts.ash.plea).not.toBe(scripts.bea.plea)
    expect(scripts.ash.response).not.toBe(scripts.bea.response)
    expect(Object.values(scripts).some(({ plea }) => plea.includes('trusted each other'))).toBe(
      true
    )
  })

  it('recognizes distinct actual season records, without mixing the two finalists up', () => {
    const scripts = scriptsFor([nominee('ash', 3), nominee('bea', 0, 4)])
    expect(scripts.ash.plea).toContain('3 competition wins')
    expect(scripts.bea.plea).toContain('block 4 times')
    expect(scripts.ash.response).not.toBe(scripts.bea.response)
  })

  it('is stable for each identity when nominee display order changes', () => {
    const ash = nominee('ash', 2)
    const bea = nominee('bea', 2)
    const original = scriptsFor([ash, bea])
    const reversed = scriptsFor([bea, ash])
    expect(reversed.ash).toEqual(original.ash)
    expect(reversed.bea).toEqual(original.bea)
    expect(Object.keys(reversed)).toEqual(['bea', 'ash'])
  })
})
