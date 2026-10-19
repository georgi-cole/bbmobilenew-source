import { describe, expect, it } from 'vitest'
import { createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import { evaluateAllianceAutonomy } from '../reality/allianceAutonomy'
import { createRealityAlliance } from '../reality/relationshipForms'
import { getRealityRelationship } from '../reality/relationships'
import type { AllianceManagementContext } from '../reality/allianceManagement'

const actorIds = ['human', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5', 'ai-6', 'ai-7']

function setup() {
  const domain = createInitialRealityDomainState()
  ensureRealityActors(domain, actorIds)
  const context: AllianceManagementContext = {
    at: { day: 4, phase: 'social_1' },
    activeActorIds: actorIds,
    humanActorIds: ['human'],
    atRiskActorIds: [],
    displayNames: Object.fromEntries(actorIds.map((id) => [id, id.toUpperCase()])),
    seed: 37,
  }
  return { domain, context }
}

function group(
  domain: ReturnType<typeof createInitialRealityDomainState>,
  id: string,
  members: string[]
) {
  return createRealityAlliance(domain, {
    id,
    kind: 'GROUP',
    founderIds: members,
    memberIds: [],
    purpose: 'Stay safe and make the vote together',
    at: { day: 1, phase: 'social_1' },
    leaderId: members[0],
  })
}

describe('autonomous alliance strategy', () => {
  it('creates separate agendas from each faction’s own threat reads', () => {
    const { domain, context } = setup()
    const first = group(domain, 'north', ['ai-1', 'ai-2', 'ai-3'])
    const second = group(domain, 'south', ['ai-4', 'ai-5', 'ai-7'])
    getRealityRelationship(domain, 'ai-1', 'ai-6').perceivedThreat = 95
    getRealityRelationship(domain, 'ai-4', 'ai-3').perceivedThreat = 95

    evaluateAllianceAutonomy(domain, context)

    expect(first.currentTargetIds).toEqual(['ai-6'])
    expect(second.currentTargetIds).toEqual(['ai-3'])
    expect(
      domain.events.filter((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
    ).toHaveLength(2)
    expect(
      domain.events.find(
        (event) => event.type === 'ALLIANCE_STRATEGY_MEETING' && event.allianceId === 'north'
      )?.allianceConsultationSummary
    ).toContain('current vote')
  })

  it('changes the agenda when the active block changes and keeps an alternative', () => {
    const { domain, context } = setup()
    const alliance = group(domain, 'north', ['ai-1', 'ai-2', 'ai-3'])
    alliance.currentTargetIds = ['ai-6']
    alliance.fallbackTargetIds = ['ai-5']
    const updatedContext = {
      ...context,
      at: { day: 4, phase: 'social_2' },
      atRiskActorIds: ['ai-4', 'ai-5'],
    }
    getRealityRelationship(domain, 'ai-1', 'ai-5').perceivedThreat = 90

    evaluateAllianceAutonomy(domain, updatedContext)

    expect(alliance.currentTargetIds).toEqual(['ai-5'])
    expect(alliance.fallbackTargetIds).toContain('ai-4')
    expect(domain.events.at(-1)?.allianceConsultationSummary).toContain('AI-5')
    expect(domain.events.at(-1)?.reason).toContain('VOTE_REALIGNMENT')
  })

  it('recognizes public competition performance as another reason to target someone', () => {
    const { domain, context } = setup()
    const alliance = group(domain, 'north', ['ai-1', 'ai-2', 'ai-3'])

    evaluateAllianceAutonomy(domain, {
      ...context,
      competitionThreatByActorId: { 'ai-6': 3.4 },
    })

    expect(alliance.currentTargetIds).toEqual(['ai-6'])
    expect(
      domain.events.find((event) => event.type === 'ALLIANCE_STRATEGY_MEETING')
        ?.allianceConsultationSummary
    ).toContain('recent competitions')
  })

  it('records a member’s competing personal priority without forcing agreement', () => {
    const { domain, context } = setup()
    const alliance = group(domain, 'north', ['ai-1', 'ai-2', 'ai-3'])
    const personalTie = getRealityRelationship(domain, 'ai-1', 'ai-6')
    personalTie.perceivedThreat = 95
    personalTie.warmth = 80

    evaluateAllianceAutonomy(domain, context)

    expect(alliance.currentTargetIds).toEqual(['ai-6'])
    expect(alliance.memberPlanBeliefs['ai-1']?.[0]).toMatch(/^fallback:/)
    expect(alliance.memberPlanBeliefs['ai-2']).toContain('target:ai-6')
  })

  it('recruits a useful partner through the existing group admission request', () => {
    const { domain, context } = setup()
    group(domain, 'north', ['ai-1', 'ai-2', 'ai-3'])
    const reliableProspect = getRealityRelationship(domain, 'ai-1', 'ai-5')
    reliableProspect.trust = 50
    reliableProspect.loyalty = 35
    reliableProspect.reliability = 45
    reliableProspect.strategicValue = 40
    getRealityRelationship(domain, 'ai-1', 'ai-4').perceivedThreat = 95

    evaluateAllianceAutonomy(domain, context)

    expect(
      Object.values(domain.allianceManagement.requests).some(
        (request) =>
          request.kind === 'ADMIT' &&
          request.allianceId === 'north' &&
          request.candidateId === 'ai-5'
      )
    ).toBe(true)
  })
})
