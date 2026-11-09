import { describe, expect, it } from 'vitest'
import { getRealityRelationshipLabel } from '../../components/SocialPanelV2/relationshipUtils'
import { createInitialRealityDomainState, createRealityAlliance } from '../reality'
import { recordRealityCeremonyOutcome } from '../reality/ceremonies'
import { upsertRealityFacadeAgreement } from '../reality/facadeAgreements'
import { recordRealityAllianceBetrayal } from '../reality/relationshipForms'
import { selectCanonicalRelationshipView } from '../relationshipSemantics'
import { advanceNemesisNarrative } from '../reality/nemesisNarrative'
import { getUpdatedProvocateurSeason, registerProvocateurConflict } from '../seasonProvocateurs'

describe('season provocateur conflict relationships', () => {
  it.each([true, false])(
    'uses a nomination as a grievance only without consent (%s)',
    (consent) => {
      const reality = createInitialRealityDomainState()
      const players = [
        { id: 'human', isUser: true, status: 'loh' },
        { id: 'lia', isUser: false, status: 'active' },
      ]
      const context = { players, targetId: 'human', seed: 7, day: 4 }
      reality.relationshipAutonomy.provocateurSeason = getUpdatedProvocateurSeason(reality, context)
      if (consent) {
        upsertRealityFacadeAgreement(reality, {
          id: 'pawn-offer',
          day: 4,
          lohId: 'human',
          facadeId: 'lia',
          stage: 'INITIAL_NOMINATION',
          status: 'ACCEPTED',
          voluntary: true,
        })
      }
      recordRealityCeremonyOutcome(reality, {
        kind: 'NOMINATIONS_LOCKED',
        day: 4,
        phase: 'nomination_results',
        actorId: 'human',
        targetIds: ['lia'],
        witnessIds: ['human', 'lia'],
        publicEligible: false,
      })
      const update = getUpdatedProvocateurSeason(reality, context)
      if (consent) {
        expect(update).toBeNull()
      } else {
        expect(update?.roles[0]).toMatchObject({ actorId: 'lia', cause: 'NOMINATION' })
      }
    }
  )

  it('records a nemesis and displays it from the targeted player’s relationship read', () => {
    const reality = createInitialRealityDomainState()

    const registration = registerProvocateurConflict(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      at: { day: 3, phase: 'social_1' },
      cause: 'PERSONALITY_CLASH',
    })
    const view = selectCanonicalRelationshipView({
      reality,
      actorId: 'human',
      targetId: 'provocateur',
    })

    expect(registration?.nemesis).toMatchObject({
      ownerId: 'provocateur',
      targetId: 'human',
      status: 'ACTIVE',
    })
    expect(view.isNemesis).toBe(false)
    expect(view.visibleTags.has('rivalry')).toBe(true)
    expect(reality.relationships.provocateur?.human?.perceivedLabel).toBe('RIVAL')
    expect(reality.relationships.human?.provocateur?.perceivedLabel).toBe('RIVAL')
    expect(
      getRealityRelationshipLabel(
        reality.relationships.human?.provocateur,
        view.alliance?.operational,
        3,
        view.isNemesis
      )
    ).toEqual({ label: 'Rival', key: 'enemies' })
    const reveal = advanceNemesisNarrative(reality, {
      humanId: 'human',
      playerNames: { human: 'You', provocateur: 'Echo' },
      activePlayerIds: new Set(['human', 'provocateur']),
      day: 3,
      phase: 'social_2',
    })
    expect(reveal[0]?.kind).toBe('reveal')
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'provocateur',
      }).isNemesis
    ).toBe(true)
  })

  it('strains a genuine pact on a first confrontation without inventing a Nemesis', () => {
    const reality = createInitialRealityDomainState()
    const pact = createRealityAlliance(reality, {
      id: 'first-conflict-pact',
      founderIds: ['human', 'provocateur'],
      memberIds: [],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    pact.status = 'ACTIVE'
    const loyaltyBefore = pact.memberCommitment.provocateur
    const registration = registerProvocateurConflict(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      at: { day: 3, phase: 'social_1' },
      cause: 'PERSONALITY_CLASH',
    })
    expect(registration?.nemesis).toBeNull()
    expect(pact.status).toBe('FRACTURED')
    expect(pact.memberCommitment.provocateur).toBeLessThan(loyaltyBefore)
    expect(pact.genuine).toBe(true)
    expect(
      selectCanonicalRelationshipView({
        reality,
        actorId: 'human',
        targetId: 'provocateur',
      }).isNemesis
    ).toBe(false)
  })

  it('does not reuse a betrayal from a dissolved pact to escalate a new pact', () => {
    const reality = createInitialRealityDomainState()
    const oldPact = createRealityAlliance(reality, {
      id: 'old-pact',
      founderIds: ['human', 'provocateur'],
      memberIds: [],
      purpose: 'Old protection pact',
      at: { day: 1, phase: 'social_1' },
    })
    oldPact.status = 'ACTIVE'
    recordRealityAllianceBetrayal(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      kind: 'SOCIAL_BETRAYAL',
      at: { day: 2, phase: 'social_1' },
      sourceEventId: 'old-pact-breach',
      allianceId: oldPact.id,
    })
    oldPact.status = 'DISSOLVED'

    const newPact = createRealityAlliance(reality, {
      id: 'new-pact',
      founderIds: ['human', 'provocateur'],
      memberIds: [],
      purpose: 'Renewed protection pact',
      at: { day: 5, phase: 'social_1' },
    })
    newPact.status = 'ACTIVE'

    const result = registerProvocateurConflict(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      at: { day: 6, phase: 'social_1' },
      cause: 'PERSONALITY_CLASH',
    })

    expect(result?.nemesis).toBeNull()
    expect(newPact.status).toBe('FRACTURED')
  })

  it('records a rival label for another AI target without replacing their existing nemesis', () => {
    const reality = createInitialRealityDomainState()
    registerProvocateurConflict(reality, {
      actorId: 'first-provocateur',
      targetId: 'target-ai',
      at: { day: 3, phase: 'social_1' },
    })

    const registration = registerProvocateurConflict(reality, {
      actorId: 'successor-provocateur',
      targetId: 'target-ai',
      at: { day: 5, phase: 'social_1' },
      cause: 'SUCCESSOR',
    })
    const view = selectCanonicalRelationshipView({
      reality,
      actorId: 'target-ai',
      targetId: 'successor-provocateur',
    })

    expect(registration?.nemesis).toBeNull()
    expect(view.isNemesis).toBe(false)
    expect(view.visibleTags.has('rivalry')).toBe(true)
    expect(
      getRealityRelationshipLabel(
        reality.relationships['target-ai']?.['successor-provocateur'],
        false,
        5,
        view.isNemesis
      ).label
    ).toBe('Rival')
  })

  it('does not repeat the durable start event for the same provocateur pair', () => {
    const reality = createInitialRealityDomainState()
    registerProvocateurConflict(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      at: { day: 3, phase: 'social_1' },
    })
    const eventCount = reality.events.length

    const repeated = registerProvocateurConflict(reality, {
      actorId: 'provocateur',
      targetId: 'human',
      at: { day: 5, phase: 'social_1' },
    })

    expect(repeated).toBeNull()
    expect(reality.events).toHaveLength(eventCount)
  })
})
