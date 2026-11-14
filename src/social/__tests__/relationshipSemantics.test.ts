import { describe, expect, it } from 'vitest'
import {
  createDirectedRelationship,
  applyRealityRelationshipChange,
  createInitialRealityDomainState,
  createRealityAlliance,
  createRealityNemesisObjective,
  normalizeRealityDomainState,
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
import { appendRealityEvent } from '../reality/events'
import { advanceNemesisNarrative } from '../reality/nemesisNarrative'

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
      expect(view.visibleTags.has('former_group')).toBe(status === 'DISSOLVED')
      expect(view.visibleTags.has('broken_alliance')).toBe(false)
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

  it('does not expose a secret Nemesis inside an official alliance until a witnessed conflict', () => {
    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'echo-pact',
      founderIds: ['human', 'echo'],
      memberIds: [],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    createRealityNemesisObjective(reality, {
      ownerId: 'echo',
      targetId: 'human',
      sourceEventId: 'private-grudge',
      at: { day: 3, phase: 'social_1' },
    })

    const hiddenView = selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    })
    expect(hiddenView.isNemesis).toBe(false)
    expect(hiddenView.visibleTags.has('rivalry')).toBe(false)
    expect(hiddenView.alliance?.id).toBe('echo-pact')
    expect(pact.genuine).toBe(false)
    expect(pact.infiltratorIds).toContain('echo')
    expect(
      getCanonicalRelationshipLabel(
        reality.relationships.human?.echo,
        hiddenView.alliance?.operational,
        3,
        hiddenView.isNemesis
      )
    ).not.toBe('Nemesis')

    appendRealityEvent(reality, {
      day: 4,
      phase: 'social_1',
      type: 'PROVOCATEUR_CONFLICT_STARTED',
      actorId: 'echo',
      targetIds: ['human'],
      participantIds: ['echo', 'human'],
      witnessIds: [],
      visibility: 'PAIR_ONLY',
      outcome: 'SYSTEM',
      reason: 'Echo publicly challenged your game',
      tags: ['CONFLICT'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    // A visible argument is evidence of rivalry, not automatic proof of a
    // privately assigned Nemesis. The named objective is disclosed only when
    // the corresponding story reveal is actually delivered.
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'echo',
      }).isNemesis
    ).toBe(false)
    const reveal = advanceNemesisNarrative(reality, {
      humanId: 'human',
      day: 4,
      phase: 'social_2',
      playerNames: { human: 'You', echo: 'Echo' },
      activePlayerIds: new Set(['human', 'echo']),
    })
    expect(reveal[0]?.kind).toBe('reveal')
    const revealedView = selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'echo',
    })
    expect(revealedView.isNemesis).toBe(true)
    expect(revealedView.visibleTags.has('rivalry')).toBe(true)
    expect(
      getCanonicalRelationshipLabel(
        reality.relationships.human?.echo,
        revealedView.alliance?.operational,
        4,
        revealedView.isNemesis
      )
    ).toBe('Nemesis')
    expect(pact.status).toBe('DISSOLVED')
    expect(pact.memberIds).toEqual([])
    expect(revealedView.alliance?.status).toBe('DISSOLVED')
    expect(revealedView.alliance?.operational).toBe(false)
    expect(revealedView.visibleTags.has('ended_pact')).toBe(true)
  })

  it('repairs older saved seasons with an active nemesis and an incorrectly genuine pact', () => {
    const oldReality = createInitialRealityDomainState()
    const pact = createRealityAlliance(oldReality, {
      id: 'old-echo-pact',
      founderIds: ['human', 'echo'],
      memberIds: [],
      purpose: 'Shared strategy',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    // Simulate a pre-fix snapshot that preserved both records without the
    // Nemesis/commitment reconciliation performed when the pact was signed.
    oldReality.relationshipAutonomy.nemeses['nemesis:echo:human'] = {
      id: 'nemesis:echo:human',
      ownerId: 'echo',
      targetId: 'human',
      sourceEventId: 'private-ambition',
      reason: 'PERSONAL_FRICTION',
      createdAt: { day: 3, phase: 'social_1' },
      status: 'ACTIVE',
    }
    expect(pact.genuine).toBe(true)
    const normalized = normalizeRealityDomainState(oldReality)
    expect(normalized.alliances['old-echo-pact'].genuine).toBe(false)
    expect(normalized.alliances['old-echo-pact'].infiltratorIds).toContain('echo')
    expect(
      normalized.relationshipAutonomy.nemeses['nemesis:echo:human'].compromisedAllianceIds
    ).toContain('old-echo-pact')
    expect(pact.genuine).toBe(true) // Recovery snapshot was not mutated.
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
    expect(view.visibleTags.has('betrayed_them')).toBe(true)
    expect(view.visibleTags.has('betrayal')).toBe(false)

    const witnessView = selectCanonicalRelationshipView({
      relationships: {},
      reality,
      actorId: 'human',
      targetId: 'witness',
    })
    expect(witnessView.visibleTags.has('betrayal')).toBe(false)

    const projected = socialReducer(undefined, replaceRealityDomain(reality))
    expect(projected.relationships.human?.witness?.tags).not.toContain('betrayal')
    expect(projected.relationships.human?.rune?.tags).toContain('betrayed_them')
    expect(projected.relationships.rune?.human?.tags).toContain('betrayal')
  })
})
