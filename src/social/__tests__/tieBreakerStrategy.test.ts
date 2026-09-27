import { describe, expect, it } from 'vitest'
import {
  buildTieBreakerCampaignPitch,
  getTieBreakerAllianceAdvice,
  getTieBreakerRecommendation,
} from '../tieBreakerStrategy'

const players = [
  { id: 'user', name: 'You', status: 'active' },
  { id: 'ally', name: 'Ally', status: 'active' },
  { id: 'nominee-a', name: 'Ari', status: 'active' },
  { id: 'nominee-b', name: 'Bea', status: 'active' },
] as const

describe('tie-break QA decision model', () => {
  it('recommends the nominee with a broken-trust history and exposes alliance reads', () => {
    const input = {
      decisionMakerId: 'user',
      tiedNominees: [
        { id: 'nominee-a', name: 'Ari' },
        { id: 'nominee-b', name: 'Bea' },
      ],
      players,
      relationships: {
        user: {
          ally: { affinity: 40, tags: ['alliance'] },
          'nominee-a': { affinity: 0, tags: ['broken_promise'] },
          'nominee-b': { affinity: -20, tags: [] },
        },
        ally: {
          'nominee-a': { affinity: 0, tags: ['target'] },
          'nominee-b': { affinity: 0, tags: [] },
        },
      },
      week: 2,
    }

    expect(getTieBreakerRecommendation(input)?.nomineeId).toBe('nominee-a')
    expect(getTieBreakerAllianceAdvice(input)).toMatchObject([
      { advisorId: 'ally', nomineeId: 'nominee-a' },
    ])
  })

  it('tailors the nominee pitch to a known alliance relationship', () => {
    const pitch = buildTieBreakerCampaignPitch({
      decisionMakerId: 'user',
      nominee: { id: 'nominee-a', name: 'Ari' },
      relationships: {
        user: { 'nominee-a': { affinity: 35, tags: ['alliance'] } },
      },
      week: 2,
    })

    expect(pitch.offer).toBe('alliance')
    expect(pitch.text).toMatch(/alliance/i)
    expect(pitch.text).toMatch(/deciding vote/i)
  })
})
