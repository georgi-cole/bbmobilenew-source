import { describe, expect, it } from 'vitest'
import {
  createDirectedRelationship,
  applyRealityRelationshipChange,
  createInitialRealityDomainState,
  createRealityAlliance,
  createRealityGrievance,
  recordRealityAllianceBetrayal,
} from '../reality'
import {
  getCanonicalRelationshipLabel,
  hasCanonicalLiveAlliance,
  selectCanonicalRelationshipView,
  selectCanonicalAlliance,
} from '../relationshipSemantics'
import socialReducer, { replaceRealityDomain } from '../socialSlice'

function addAlliance(
  reality: ReturnType<typeof createInitialRealityDomainState>,
  id: string,
  status: 'ACTIVE' | 'PROBATIONARY' | 'FRACTURED' | 'DISSOLVED'
) {
  const alliance = createRealityAlliance(reality, {
    id,
    founderIds: ['human', 'rune'],
    memberIds: [`member-${id}`],
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
  it('distinguishes an unformed relationship from a neutral affinity score', () => {
    const unknown = createDirectedRelationship('human', 'rune')
    const friendly = createDirectedRelationship('human', 'rune', 8)
    friendly.perceivedLabel = 'FRIENDLY'

    expect(getCanonicalRelationshipLabel(unknown)).toBe('Still forming')
    expect(getCanonicalRelationshipLabel(friendly)).toBe('Friendly')
    expect(getCanonicalRelationshipLabel(unknown, true)).toBe('Ally')
  })

  it('keeps unknown reads provisional through day three, then gives a signal-led first impression', () => {
    const friendly = createDirectedRelationship('human', 'rune')
    friendly.familiarity = 2
    friendly.warmth = 20
    friendly.trust = 10

    const cautious = createDirectedRelationship('human', 'lia')
    cautious.suspicion = 25
    cautious.trust = 10

    const strategic = createDirectedRelationship('human', 'kai')
    strategic.strategicValue = 40

    const romantic = createDirectedRelationship('human', 'vee')
    romantic.attraction = 36

    const familiar = createDirectedRelationship('human', 'bea')
    familiar.familiarity = 10
    familiar.perceivedLabel = 'ACQUAINTANCE'

    const friendlyRead = createDirectedRelationship('human', 'dex')
    friendlyRead.warmth = 20
    friendlyRead.perceivedLabel = 'FRIENDLY'

    expect(getCanonicalRelationshipLabel(friendly, false, 3)).toBe('Still forming')
    expect(getCanonicalRelationshipLabel(friendly, false, 4)).toBe('Good banter')
    expect(getCanonicalRelationshipLabel(cautious, false, 7)).toBe('Side-eye')
    expect(getCanonicalRelationshipLabel(strategic, false, 7)).toBe('All business')
    expect(getCanonicalRelationshipLabel(romantic, false, 7)).toBe('Uh-oh, sparks')
    expect(getCanonicalRelationshipLabel(familiar, false, 7)).toBe('No tea')
    expect(getCanonicalRelationshipLabel(friendlyRead, false, 7)).toBe('Good banter')
    expect(getCanonicalRelationshipLabel(undefined, false, 7)).toBe('No tea')
  })

  it('shows an enemy after a fight as rivalry, without inventing betrayal', () => {
    const reality = createInitialRealityDomainState()
    const edge = createDirectedRelationship('human', 'rune')
    edge.perceivedLabel = 'ENEMY'
    reality.relationships.human = { rune: edge }
    const view = selectCanonicalRelationshipView({
      relationships: { human: { rune: { affinity: -45, tags: ['betrayal'] } } },
      reality,
      actorId: 'human',
      targetId: 'rune',
    })
    expect(view.visibleTags.has('rivalry')).toBe(true)
    expect(view.visibleTags.has('betrayal')).toBe(false)
  })

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
    expect(fractured.visibleTags.has('alliance')).toBe(true)
    expect(fractured.visibleTags.has('strained_alliance')).toBe(true)
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

  it('displays a new probationary alliance without implying it is strained', () => {
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
    expect(view.visibleTags.has('new_alliance')).toBe(true)
    expect(view.visibleTags.has('strained_alliance')).toBe(false)
    expect(view.visibleTags.has('broken_alliance')).toBe(false)
  })

  it.each(['FRACTURED', 'DISSOLVED'] as const)(
    'distinguishes %s membership from operational health',
    (status) => {
      const reality = createInitialRealityDomainState()
      addAlliance(reality, `${status.toLowerCase()}-only`, status)

      const view = pairView(reality)
      expect(view.alliance?.status).toBe(status)
      expect(view.alliance?.operational).toBe(false)
      expect(view.visibleTags.has('alliance')).toBe(status === 'FRACTURED')
      expect(view.visibleTags.has('broken_alliance')).toBe(status === 'DISSOLVED')
      expect(hasCanonicalLiveAlliance(reality, 'human', 'rune')).toBe(status === 'FRACTURED')
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
    const alliance = createRealityAlliance(reality, {
      id: 'trusted-pact',
      founderIds: ['human', 'rune'],
      memberIds: ['witness'],
      purpose: 'Work together',
      at: { day: 1, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    recordRealityAllianceBetrayal(reality, {
      actorId: 'human',
      targetId: 'rune',
      kind: 'SOCIAL_BETRAYAL',
      at: { day: 3, phase: 'social_2' },
      sourceEventId: 'social-betrayal:human:rune',
    })

    const view = pairView(reality)
    expect(view.visibleTags.has('betrayal')).toBe(true)

    const witnessView = selectCanonicalRelationshipView({
      relationships: {},
      reality,
      actorId: 'human',
      targetId: 'witness',
    })
    expect(witnessView.visibleTags.has('betrayal')).toBe(false)

    const projected = socialReducer(undefined, replaceRealityDomain(reality))
    expect(projected.relationships.human?.witness?.tags).not.toContain('betrayal')
    expect(projected.relationships.human?.rune?.tags).toContain('betrayal')
  })
})
