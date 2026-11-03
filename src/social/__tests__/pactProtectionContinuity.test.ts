import { describe, expect, it } from 'vitest'
import {
  explainProtectionNeed,
  explainProtectionWithoutPact,
  getSameDayPactRefusal,
  isProtectionClarification,
} from '../pactProtectionContinuity'
import { getIncomingDialogueBeat } from '../incomingDialogueOutcomeBank'
import { getContextualIncomingChoices } from '../incomingInteractionResolution'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { createRealityAlliance } from '../reality/relationshipForms'
import type { RealityAllianceRequest } from '../reality/types'
import type { IncomingInteraction } from '../types'

function rejectedPact(respondentId = 'blue', day = 3): RealityAllianceRequest {
  return {
    id: `declined:${respondentId}:${day}`,
    kind: 'PACT',
    status: 'DECLINED',
    proposerId: 'you',
    memberIds: ['you', respondentId],
    electorateIds: [],
    officerIds: [],
    votes: {},
    consents: { you: true, [respondentId]: false },
    responsesByActorId: {
      [respondentId]: {
        style: 'DECLINED',
        reason: 'I already have people I am committed to protecting.',
      },
    },
    purpose: 'Mutual protection',
    createdAt: { day, phase: 'social_1' },
    settledAt: { day, phase: 'social_1' },
    deadline: { day, phase: 'social_2' },
  }
}

describe('protection conversations preserve the actual pact decision', () => {
  it('recognizes a factual clarification only in relevant scenes', () => {
    expect(isProtectionClarification('nominee_campaign', 'Ask what they need')).toBe(true)
    expect(isProtectionClarification('nominee_hoh_plea', 'Ask for their case')).toBe(true)
    expect(isProtectionClarification('nominee_veto_pitch', 'Hear their plan')).toBe(true)
    expect(isProtectionClarification('nominee_campaign', 'Keep your options open')).toBe(false)
    expect(isProtectionClarification('generic_check_in', 'Ask what they need')).toBe(false)
  })

  it('does not treat a neutral question as a promise even in the first choice slot', () => {
    const interaction: IncomingInteraction = {
      id: 'blue-campaign-clarification',
      fromId: 'blue',
      type: 'nomination_plea',
      text: 'I need your vote to stay.',
      payload: { scenarioKey: 'nominee_campaign' },
      createdAt: 1,
      createdWeek: 3,
      expiresAtWeek: 3,
      read: true,
      requiresResponse: true,
      resolved: false,
    }
    // The seeded scene chooses between distinct button orders. A real
    // clarification is neutral regardless of the category slot it occupies.
    let found = false
    for (let index = 0; index < 40; index += 1) {
      const choices = getContextualIncomingChoices({ ...interaction, id: `campaign:${index}` })
      const clarification = choices?.find((choice) =>
        isProtectionClarification('nominee_campaign', choice.label)
      )
      if (!clarification) continue
      found = true
      expect(clarification.responseType).toBe('neutral')
    }
    expect(found).toBe(true)
  })

  it('uses only a same-day, same-pair confirmed refusal', () => {
    const domain = createInitialRealityDomainState()
    ensureRealityActors(domain, ['you', 'blue', 'lia'])
    domain.allianceManagement.requests['blue-refusal'] = rejectedPact()
    expect(getSameDayPactRefusal(domain, 'you', 'blue', 3)).toContain('committed')
    expect(getSameDayPactRefusal(domain, 'you', 'lia', 3)).toBeNull()
    expect(getSameDayPactRefusal(domain, 'you', 'blue', 4)).toBeNull()
    expect(getSameDayPactRefusal(domain, 'blue', 'you', 3)).toBeNull()
    // A newer accepted pact must override outdated refusal history.
    createRealityAlliance(domain, {
      id: 'newly-agreed',
      founderIds: ['you'],
      memberIds: ['blue'],
      purpose: 'Mutual protection',
      at: { day: 3, phase: 'social_2' },
    })
    expect(getSameDayPactRefusal(domain, 'you', 'blue', 3)).toBeNull()
  })

  it('never reverses who declined the pact or makes up a promise', () => {
    const line = getIncomingDialogueBeat({
      scenarioKey: 'nominee_campaign',
      responseType: 'neutral',
      responseLabel: 'Ask what they need',
      fromName: 'Blue',
      recentPactRefusal: 'I already have people I am committed to protecting.',
      seed: 12,
    })
    expect(line).toContain('already owe commitments')
    expect(line).toContain('cannot sign a personal pact')
    expect(line).not.toMatch(/you (?:rejected|declined|kept your options)/i)
    expect(explainProtectionWithoutPact('reason not categorized', 'nominee_campaign')).toContain(
      'have not agreed'
    )
  })

  it('answers the real immediate decision when no refusal occurred', () => {
    expect(explainProtectionNeed('nominee_veto_pitch')).toContain('using Safety')
    expect(explainProtectionNeed('live_vote_pitch')).toContain('votes to stay')
    expect(explainProtectionNeed('generic_check_in')).toBeNull()
    expect(
      getIncomingDialogueBeat({
        scenarioKey: 'hoh_safety_request',
        responseType: 'neutral',
        responseLabel: 'Ask what they are offering',
        fromName: 'Blue',
        seed: 3,
      })
    ).toContain('nomination decision')
  })
})
