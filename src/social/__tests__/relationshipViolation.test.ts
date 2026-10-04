import { describe, expect, it } from 'vitest'
import { evaluateRelationshipViolation } from '../relationshipViolation'

describe('evaluateRelationshipViolation', () => {
  it('does not damage an ally when no alternative nomination is legal', () => {
    const result = evaluateRelationshipViolation({
      actorId: 'loh',
      targetId: 'ally',
      actionType: 'NOMINATION',
      relationshipTags: ['alliance'],
      eligibleAlternatives: [],
      promiseBroken: true,
    })

    expect(result.classification).toBe('NONE')
    expect(result.forcedChoice).toBe(true)
  })

  it('does not formalize a forced vote between ordinary allies', () => {
    const result = evaluateRelationshipViolation({
      actorId: 'voter',
      targetId: 'echo',
      actionType: 'VOTE',
      relationshipTags: ['alliance'],
      eligibleAlternatives: [{ id: 'quinn', relationshipTags: ['alliance'] }],
    })

    expect(result.classification).toBe('RELATIONSHIP_HURT')
    expect(result.forcedChoice).toBe(true)
  })

  it('protects an accepted Facade nomination', () => {
    expect(
      evaluateRelationshipViolation({
        actorId: 'loh',
        targetId: 'echo',
        actionType: 'NOMINATION',
        relationshipTags: ['alliance'],
        facadeAgreement: {
          status: 'ACCEPTED',
          lohId: 'loh',
          facadeId: 'echo',
          stage: 'INITIAL_NOMINATION',
        },
      }).classification
    ).toBe('NONE')
  })

  it('treats bypassing a Ride-or-Die for an ordinary ally as severe betrayal', () => {
    const result = evaluateRelationshipViolation({
      actorId: 'loh',
      targetId: 'echo',
      actionType: 'NOMINATION',
      relationshipTags: ['ride_or_die'],
      eligibleAlternatives: [{ id: 'quinn', relationshipTags: ['alliance'] }],
    })

    expect(result.classification).toBe('BETRAYAL')
    expect(result.severity).toBeGreaterThan(0.7)
  })
})
