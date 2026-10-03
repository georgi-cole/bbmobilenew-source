import { describe, expect, it } from 'vitest'
import {
  applyRealityRelationshipChange,
  createInitialRealityDomainState,
  createRealityAlliance,
  createRealityGrievance,
  recordRealityAllianceBetrayal,
} from '../reality'
import {
  hasCanonicalLiveAlliance,
  selectCanonicalRelationshipView,
  selectCanonicalAlliance,
} from '../relationshipSemantics'

function addAlliance(
  reality: ReturnType<typeof createInitialRealityDomainState>,
  id: string,
  status: 'ACTIVE' | 'PROBATIONARY' | 'FRACTURED' | 'DISSOLVED'
) {
  const alliance = createRealityAlliance(reality, {
    id,
    founderIds: ['human', 'rune'],
    memberIds: [],
    purpose: id,
    at: { day: 1, phase: 'social_1' },
  })
  alliance.status = status
  return alliance
}

function pairView(reality: ReturnType<typeof createInitialRealityDomainState>) {
  return selectCanonicalRelationshipView({
    relationships: { human: {}, rune: {} },
    reality,
    actorId: 'human',
    targetId: 'rune',
  })
}

describe('canonical relationship presentation', () => {
  it('keeps a formal alliance visible without a projected relationship edge', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'formal-pact',
      founderIds: ['human', 'rune'],
      memberIds: [],
      purpose: 'Protect each other',
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'

    const view = selectCanonicalRelationshipView({
      relationships: { human: {}, rune: {} },
      reality,
      actorId: 'human',
      targetId: 'rune',
    })

    expect(view.alliance).toMatchObject({ id: 'formal-pact', status: 'ACTIVE', operational: true })
    expect(view.visibleTags.has('alliance')).toBe(true)

    alliance.status = 'FRACTURED'
    const fractured = selectCanonicalRelationshipView({
      relationships: { human: {}, rune: {} },
      reality,
      actorId: 'human',
      targetId: 'rune',
    })
    expect(fractured.visibleTags.has('alliance')).toBe(false)
    expect(fractured.visibleTags.has('broken_alliance')).toBe(true)
  })

  it('prefers an operational alliance over a fractured historical overlap', () => {
    const reality = createInitialRealityDomainState()
    addAlliance(reality, 'fractured-history', 'FRACTURED')
    addAlliance(reality, 'current-pact', 'ACTIVE')

    const view = pairView(reality)
    expect(view.alliance).toMatchObject({ id: 'current-pact', status: 'ACTIVE', operational: true })
    expect(view.visibleTags.has('alliance')).toBe(true)
    expect(view.visibleTags.has('broken_alliance')).toBe(false)
    expect(hasCanonicalLiveAlliance(reality, 'human', 'rune')).toBe(true)
  })

  it('displays a probationary overlap as strained rather than dissolved', () => {
    const reality = createInitialRealityDomainState()
    addAlliance(reality, 'dissolved-history', 'DISSOLVED')
    addAlliance(reality, 'probationary-pact', 'PROBATIONARY')

    const view = pairView(reality)
    expect(view.alliance).toMatchObject({
      id: 'probationary-pact',
      status: 'PROBATIONARY',
      operational: true,
    })
    expect(view.visibleTags.has('alliance')).toBe(true)
    expect(view.visibleTags.has('strained_alliance')).toBe(true)
    expect(view.visibleTags.has('broken_alliance')).toBe(false)
  })

  it.each(['FRACTURED', 'DISSOLVED'] as const)(
    'keeps a %s-only overlap visibly broken',
    (status) => {
      const reality = createInitialRealityDomainState()
      addAlliance(reality, `${status.toLowerCase()}-only`, status)

      const view = pairView(reality)
      expect(view.alliance?.status).toBe(status)
      expect(view.alliance?.operational).toBe(false)
      expect(view.visibleTags.has('alliance')).toBe(false)
      expect(view.visibleTags.has('broken_alliance')).toBe(true)
      expect(hasCanonicalLiveAlliance(reality, 'human', 'rune')).toBe(false)
    }
  )

  it('chooses the same active record regardless of alliance object insertion order', () => {
    const firstOrder = createInitialRealityDomainState()
    addAlliance(firstOrder, 'zeta-active', 'ACTIVE')
    addAlliance(firstOrder, 'alpha-active', 'ACTIVE')

    const secondOrder = createInitialRealityDomainState()
    addAlliance(secondOrder, 'alpha-active', 'ACTIVE')
    addAlliance(secondOrder, 'zeta-active', 'ACTIVE')

    expect(selectCanonicalAlliance(firstOrder, 'human', 'rune')?.id).toBe('alpha-active')
    expect(selectCanonicalAlliance(secondOrder, 'human', 'rune')?.id).toBe('alpha-active')
    expect(pairView(firstOrder).alliance).toEqual(pairView(secondOrder).alliance)
  })

  it('shows a fight-created enemy and grievance as rivalry rather than betrayal', () => {
    const reality = createInitialRealityDomainState()
    applyRealityRelationshipChange(reality, {
      sourceId: 'human',
      targetId: 'rune',
      deltas: {
        trust: -70,
        resentment: 85,
        suspicion: 60,
        perceivedThreat: 55,
      },
      day: 2,
      phase: 'social_1',
      eventId: 'fight:human:rune',
      anchor: 'negative',
    })
    createRealityGrievance(reality, {
      id: 'grievance:fight:human:rune',
      holderId: 'rune',
      againstId: 'human',
      causeEventId: 'fight:human:rune',
      severity: 75,
      at: { day: 2, phase: 'social_1' },
    })

    const view = pairView(reality)
    expect(view.visibleTags.has('rivalry')).toBe(true)
    expect(view.visibleTags.has('betrayal')).toBe(false)
  })

  it('still exposes a real alliance betrayal from the Reality event record', () => {
    const reality = createInitialRealityDomainState()
    addAlliance(reality, 'trusted-pact', 'ACTIVE')
    recordRealityAllianceBetrayal(reality, {
      actorId: 'human',
      targetId: 'rune',
      kind: 'SOCIAL_BETRAYAL',
      at: { day: 3, phase: 'social_2' },
      sourceEventId: 'social-betrayal:human:rune',
    })

    const view = pairView(reality)
    expect(view.visibleTags.has('betrayal')).toBe(true)
  })
})
