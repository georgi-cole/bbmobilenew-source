import { describe, expect, it } from 'vitest'
import { getRealityRelationshipLabel } from '../../components/SocialPanelV2/relationshipUtils'
import { createInitialRealityDomainState } from '../reality'
import { selectCanonicalRelationshipView } from '../relationshipSemantics'
import { registerProvocateurConflict } from '../seasonProvocateurs'

describe('season provocateur conflict relationships', () => {
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
    expect(view.isNemesis).toBe(true)
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
    ).toEqual({ label: 'Nemesis', key: 'enemies' })
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
