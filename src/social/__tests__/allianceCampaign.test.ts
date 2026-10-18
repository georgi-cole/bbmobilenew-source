import { describe, expect, it } from 'vitest'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { createRealityAlliance } from '../reality/relationshipForms'
import { getAllianceCampaignMove } from '../reality/allianceCampaign'
import { getRealityRelationship } from '../reality/relationships'

const actorIds = ['human', 'ai-1', 'ai-2', 'ai-3', 'ai-4']

function setup() {
  const reality = createInitialRealityDomainState()
  ensureRealityActors(reality, actorIds)
  const alliance = createRealityAlliance(reality, {
    id: 'the-bloc',
    kind: 'GROUP',
    founderIds: ['ai-1', 'ai-2', 'ai-3'],
    memberIds: [],
    purpose: 'Protect one another and control the vote',
    at: { day: 1, phase: 'social_1' },
    leaderId: 'ai-1',
  })
  alliance.currentTargetIds = ['ai-4']
  alliance.memberPlanBeliefs = {
    'ai-1': ['target:ai-4'],
    'ai-2': ['target:ai-4'],
    'ai-3': [],
  }
  alliance.memberCommitment['ai-1'] = 0.8
  alliance.memberCommitment['ai-2'] = 0.7
  alliance.memberCommitment['ai-3'] = 0.2
  getRealityRelationship(reality, 'ai-1', 'ai-2').trust = 30
  return reality
}

describe('alliance campaign moves', () => {
  it('takes the faction target to the current Head of Household', () => {
    const reality = setup()

    expect(
      getAllianceCampaignMove({
        reality,
        actorId: 'ai-1',
        activeActorIds: actorIds,
        phase: 'social_1',
        lohId: 'human',
        atRiskActorIds: [],
      })
    ).toEqual({
      actionId: 'pitch_target',
      targetIds: ['human'],
      subjectId: 'ai-4',
      reason:
        'their alliance has identified ai-4 as a threat and wants the Head of Household to act',
    })
  })

  it('organizes votes on a faction target who is on the block', () => {
    const reality = setup()

    expect(
      getAllianceCampaignMove({
        reality,
        actorId: 'ai-1',
        activeActorIds: actorIds,
        eligibleVoterIds: ['ai-3'],
        phase: 'social_2',
        atRiskActorIds: ['ai-4'],
      })
    ).toMatchObject({
      actionId: 'rally_votes_against',
      targetIds: ['ai-3'],
      subjectId: 'ai-4',
    })
  })

  it('takes a replacement target to the Safety holder after the block changes', () => {
    const reality = setup()

    expect(
      getAllianceCampaignMove({
        reality,
        actorId: 'ai-1',
        activeActorIds: actorIds,
        phase: 'pos_results',
        posWinnerId: 'human',
        atRiskActorIds: ['ai-2', 'ai-3'],
      })
    ).toMatchObject({
      actionId: 'suggest_replacement',
      targetIds: ['human'],
      subjectId: 'ai-4',
    })
  })

  it('lets a member with a competing personal plan sit out the campaign', () => {
    const reality = setup()

    expect(
      getAllianceCampaignMove({
        reality,
        actorId: 'ai-3',
        activeActorIds: actorIds,
        phase: 'social_1',
        lohId: 'human',
        atRiskActorIds: [],
      })
    ).toBeNull()
  })
})
