import { describe, expect, it } from 'vitest'
import { buildKnownRomanticRivalEvidence } from '../reality/knownRomanticRivalEvidence'
import {
  createInitialRealityDomainState,
  recordGroundedJealousy,
  signalRealityRomance,
} from '../reality'

function establishRomance(domain: ReturnType<typeof createInitialRealityDomainState>) {
  signalRealityRomance(domain, {
    actorId: 'rae',
    targetId: 'user',
    at: { day: 2, phase: 'social_1' },
    acceptedByTarget: true,
    settings: { enabled: true },
  })
}

describe('known romantic rival evidence', () => {
  it('does not turn a private parallel relationship into jealousy evidence', () => {
    const domain = createInitialRealityDomainState()
    establishRomance(domain)
    signalRealityRomance(domain, {
      actorId: 'user',
      targetId: 'ali',
      at: { day: 4, phase: 'social_1' },
      acceptedByTarget: true,
      settings: { enabled: true },
    })

    expect(buildKnownRomanticRivalEvidence(domain)).toEqual({})
  })

  it('records the rival only after the bonded observer witnesses the relationship', () => {
    const domain = createInitialRealityDomainState()
    establishRomance(domain)
    signalRealityRomance(domain, {
      actorId: 'user',
      targetId: 'ali',
      at: { day: 4, phase: 'social_1' },
      acceptedByTarget: true,
      settings: { enabled: true },
    })
    recordGroundedJealousy(domain, {
      actorId: 'user',
      targetId: 'ali',
      eventId: 'rae-witnessed-the-pair',
      at: { day: 4, phase: 'social_1' },
      witnessIds: ['rae'],
      publicEligible: false,
    })

    expect(buildKnownRomanticRivalEvidence(domain)).toMatchObject({
      rae: {
        ali: {
          partnerId: 'user',
          evidenceDay: 4,
          confidence: 0.72,
          source: 'witnessed',
        },
      },
    })
  })

  it('does not treat a belief without supporting evidence as knowledge', () => {
    const domain = createInitialRealityDomainState()
    establishRomance(domain)
    domain.beliefsByOwner.rae = {
      'unsupported-romance-belief': {
        id: 'unsupported-romance-belief',
        ownerId: 'rae',
        propositionType: 'ROMANTIC_RELATIONSHIP',
        subjectIds: ['user', 'ali'],
        value: true,
        confidence: 0.9,
        supportingMemoryIds: [],
        contradictingBeliefIds: [],
        sourceChain: [],
        lastUpdatedDay: 5,
        status: 'ACTIVE',
      },
    }

    expect(buildKnownRomanticRivalEvidence(domain)).toEqual({})
  })
})
