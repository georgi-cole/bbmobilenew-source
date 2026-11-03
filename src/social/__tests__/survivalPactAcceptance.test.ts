import { describe, expect, it } from 'vitest'
import { allianceManagementContext } from '../allianceManagementActions'
import { manageAlliance, type AllianceManagementContext } from '../reality/allianceManagement'
import { createDirectedRelationship, createInitialRealityDomainState, ensureRealityActors } from '../reality/state'
import type { RealityAllianceRequest, RealityDomainState } from '../reality/types'

function setup() {
  const state = createInitialRealityDomainState()
  ensureRealityActors(state, ['you', 'blue', 'lia'])
  state.relationships.blue = {
    you: createDirectedRelationship('blue', 'you', 0),
  }
  Object.assign(state.relationships.blue.you, {
    trust: -45,
    resentment: 62,
    suspicion: 66,
    warmth: -30,
    strategicValue: 35,
  })
  return state
}

function context(seed: number, overrides: Partial<AllianceManagementContext> = {}): AllianceManagementContext {
  return {
    at: { day: 3, phase: 'social_1' },
    activeActorIds: ['you', 'blue', 'lia'],
    humanActorIds: ['you'],
    viewerActorId: 'you',
    displayNames: { you: 'You', blue: 'Blue' },
    classicGame: true,
    powerHolderIds: ['you'],
    protectionAppealsByActorId: {
      blue: { recipientId: 'you', day: 3, scenarioKey: 'nominee_hoh_plea' },
    },
    identityByActorId: {
      blue: {
        archetype: 'opportunist',
        temperament: 'adaptable',
        competitionDrive: 0.5,
        emotionalVolatility: 0.5,
        audienceFocus: 0.3,
        survivalFocus: 0.9,
      },
    },
    seed,
    ...overrides,
  }
}

function offer(seed: number, overrides?: Partial<AllianceManagementContext>): {
  state: RealityDomainState
  request: RealityAllianceRequest
} {
  const state = setup()
  const result = manageAlliance(
    state,
    { type: 'PROPOSE', kind: 'PACT', actorId: 'you', candidateId: 'blue' },
    context(seed, overrides)
  )
  expect(result.status).toBe('APPLIED')
  return { state, request: state.allianceManagement.requests[result.requestId!] }
}

describe('Classic survival-driven pact consent', () => {
  it('usually accepts an offer from the power holder it actually asked for help', () => {
    let accepted = 0
    let ordinary = 0
    for (let seed = 1; seed <= 160; seed += 1) {
      const survival = offer(seed).request
      const baseline = offer(seed, { classicGame: false }).request
      if (survival.status === 'ACCEPTED') accepted += 1
      if (baseline.status === 'ACCEPTED') ordinary += 1
    }
    // Not a forced yes, but materially stronger than the ordinary trust roll.
    expect(accepted).toBeGreaterThanOrEqual(112)
    expect(accepted).toBeLessThan(160)
    expect(accepted).toBeGreaterThan(ordinary + 40)
  })

  it('records reluctant, tactical consent without inventing genuine loyalty', () => {
    const accepted = Array.from({ length: 200 }, (_, index) => offer(index + 1)).find(
      ({ request }) => request.status === 'ACCEPTED'
    )!
    expect(accepted).toBeDefined()
    const { request, state } = accepted
    expect(request.responsesByActorId?.blue).toMatchObject({
      strategic: true,
      style: 'LIMITED',
    })
    const pact = state.alliances[request.resultAllianceId!]
    expect(pact.memberIds).toContain('blue')
    expect(pact.genuine).toBe(false)
    expect(pact.infiltratorIds).toContain('blue')
    expect(pact.memberCommitment.blue).toBeLessThanOrEqual(0.18)
    // Signing a survival deal must not erase pre-existing private hostility.
    expect(state.relationships.blue.you.trust).toBeLessThan(0)
  })

  it('does not invent a survival deal without the correct request, recipient, day and power', () => {
    const baseline = offer(18, { classicGame: false }).request
    const scenarios: Partial<AllianceManagementContext>[] = [
      { protectionAppealsByActorId: {} },
      {
        protectionAppealsByActorId: {
          blue: { recipientId: 'lia', day: 3, scenarioKey: 'nominee_hoh_plea' },
        },
      },
      {
        protectionAppealsByActorId: {
          blue: { recipientId: 'you', day: 2, scenarioKey: 'nominee_hoh_plea' },
        },
      },
      { powerHolderIds: ['lia'] },
      { classicGame: false },
    ]
    for (const overrides of scenarios) {
      const candidate = offer(18, overrides).request
      expect(candidate.status).toBe(baseline.status)
      expect(candidate.responsesByActorId?.blue).toEqual(baseline.responsesByActorId?.blue)
    }
  })

  it('allows a rare principled refusal with a real grievance rather than a fixed rule', () => {
    let principled = 0
    let accepted = 0
    for (let seed = 1; seed <= 200; seed += 1) {
      const state = setup()
      state.relationships.blue.you.trust = -75
      state.relationships.blue.you.resentment = 90
      const input = context(seed)
      input.identityByActorId = {
        blue: {
          archetype: 'lone_wolf',
          temperament: 'calm',
          competitionDrive: 0.4,
          emotionalVolatility: 0.3,
          audienceFocus: 0.1,
          survivalFocus: 0.2,
        },
      }
      const result = manageAlliance(
        state,
        { type: 'PROPOSE', kind: 'PACT', actorId: 'you', candidateId: 'blue' },
        input
      )
      const request = state.allianceManagement.requests[result.requestId!]
      if (request.status === 'ACCEPTED') accepted += 1
      if (request.responsesByActorId?.blue?.reason.includes('take my chances')) principled += 1
    }
    expect(principled).toBeGreaterThan(0)
    expect(principled).toBeLessThan(45)
    expect(accepted).toBeGreaterThan(100)
  })

  it('separates active Vox Populi from Classic, even though both use classic game.mode', () => {
    const game = (status: 'active' | 'inactive' | 'scheduled') =>
      ({
        game: {
          mode: 'classic',
          week: 3,
          phase: 'social_1',
          seed: 33,
          lohId: 'you',
          posWinnerId: null,
          voxPopuli: { status },
          nomineeIds: [],
          players: [
            { id: 'you', isUser: true, name: 'You', status: 'active' },
            { id: 'blue', isUser: false, name: 'Blue', status: 'active' },
          ],
        },
        social: {
          incomingInteractions: [
            {
              id: 'real-request',
              fromId: 'blue',
              createdDay: 3,
              resolved: true,
              resolvedWith: 'neutral',
              payload: { scenarioKey: 'hoh_safety_request' },
            },
          ],
        },
      }) as unknown as Parameters<typeof allianceManagementContext>[0]

    const classic = allianceManagementContext(game('inactive'))
    const vox = allianceManagementContext(game('active'))
    expect(classic.classicGame).toBe(true)
    expect(classic.protectionAppealsByActorId?.blue?.recipientId).toBe('you')
    expect(vox.classicGame).toBe(false)
    expect(allianceManagementContext(game('scheduled')).classicGame).toBe(true)
  })
})
