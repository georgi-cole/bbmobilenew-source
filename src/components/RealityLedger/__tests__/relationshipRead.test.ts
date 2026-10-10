import { describe, expect, it } from 'vitest'
import {
  applyRealityRelationshipChange,
  createDirectedRelationship,
  createInitialRealityDomainState,
} from '../../../social/reality'
import { liveRelationshipMetrics } from '../relationshipRead'

describe('relationship profile metrics', () => {
  it('shows each directed relationship dimension without blending in overall affinity', () => {
    const reality = createInitialRealityDomainState()
    const relationship = createDirectedRelationship('human', 'lia')
    reality.relationships.human = { lia: relationship }
    relationship.trust = 72
    relationship.warmth = -18
    relationship.loyalty = 34
    relationship.respect = 51
    const metrics = Object.fromEntries(liveRelationshipMetrics(relationship, 4))

    expect(metrics).toMatchObject({ Trust: 72, Warmth: -18, Loyalty: 34, Respect: 51 })
  })

  it('shows recent conflict tension, then lets it fade while lingering resentment remains', () => {
    const reality = createInitialRealityDomainState()
    applyRealityRelationshipChange(reality, {
      sourceId: 'human',
      targetId: 'lia',
      day: 3,
      phase: 'social_1',
      eventId: 'argument-1',
      deltas: { warmth: -6, trust: -6, resentment: 10, suspicion: 3 },
    })
    const edge = reality.relationships.human.lia
    const immediate = Object.fromEntries(liveRelationshipMetrics(edge, 3))
    const later = Object.fromEntries(liveRelationshipMetrics(edge, 6))

    expect(immediate.Tension).toBeGreaterThan(10)
    expect(later.Tension).toBeLessThan(immediate.Tension)
    expect(later.Tension).toBeGreaterThan(0)
  })
})
