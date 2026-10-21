import { describe, expect, it } from 'vitest'
import {
  allianceEventText,
  allianceForEvent,
  allianceHistory,
  appendRealityEvent,
  createInitialRealityDomainState,
  createRealityAlliance,
  ensureRealityActors,
  isFormerAllianceMember,
  manageAlliance,
  MAX_ALLIANCE_HISTORY_EVENTS,
  MAX_ALLIANCE_REQUEST_HISTORY_EVENTS,
  normalizeRealityDomainState,
  removeRealityAllianceMember,
  renameRealityAlliance,
  resolveRealityPromise,
  upsertRealityPromise,
  type AllianceManagementContext,
  type RealityAllianceRequest,
} from '../reality'

const at = { day: 1, phase: 'social_1' as const }
const context: AllianceManagementContext = {
  at,
  activeActorIds: ['u', 'k', 'j', 'lia'],
  humanActorIds: ['u', 'k', 'j', 'lia'],
  seed: 13,
}
const name = (id: string) => ({ u: 'You', k: 'Kian', j: 'Jax', lia: 'Lia' })[id] ?? id
function setup() {
  const state = createInitialRealityDomainState()
  ensureRealityActors(state, context.activeActorIds)
  const group = createRealityAlliance(state, {
    id: 'group:shield',
    kind: 'GROUP',
    founderIds: ['u', 'k', 'j'],
    memberIds: [],
    leaderId: 'u',
    name: 'The Shield',
    purpose: 'Protection',
    at,
  })
  return { state, group }
}

describe('durable alliance history', () => {
  it('bounds detailed alliance history while retaining the founding and recent events', () => {
    const { state, group } = setup()
    const formation = group.history?.find((event) => event.type === 'ALLIANCE_FORMED')
    let latestEventId = ''
    for (let index = 0; index < MAX_ALLIANCE_HISTORY_EVENTS + 20; index += 1) {
      const latest = appendRealityEvent(state, {
        ...at,
        type: 'ALLIANCE_STRATEGY_MEETING',
        allianceId: group.id,
        actorId: 'u',
        targetIds: ['k'],
        participantIds: ['u', 'k'],
        witnessIds: [],
        visibility: 'GROUP_VISIBLE',
        outcome: 'SUCCESS',
        reason: 'Recent meeting',
        tags: ['ALLIANCE', 'STRATEGY'],
        relatedFactIds: [],
        relatedPromiseIds: [],
        relatedThreadIds: [],
        publicEligible: false,
        juryEligible: true,
      })
      latestEventId = latest.id
    }

    expect(group.history).toHaveLength(MAX_ALLIANCE_HISTORY_EVENTS)
    expect(group.history).toContain(formation)
    expect(group.history?.at(-1)?.id).toBe(latestEventId)

    const normalized = normalizeRealityDomainState(state)
    const feedEvent = normalized.events.find((event) => event.id === latestEventId)
    const allianceEvent = normalized.alliances[group.id].history?.find(
      (event) => event.id === latestEventId
    )
    expect(allianceEvent).toBe(feedEvent)
  })

  it('caps request logs and settled receipts while keeping pending agreements', () => {
    const state = createInitialRealityDomainState()
    const requestHistory = Array.from(
      { length: MAX_ALLIANCE_REQUEST_HISTORY_EVENTS + 4 },
      (_, index) => ({
        id: `request-event-${index}`,
        sequence: index,
        day: 1,
        phase: 'social_1' as const,
        type: 'ALLIANCE_REQUEST_VOTE',
        targetIds: [],
        participantIds: ['u', 'k'],
        witnessIds: [],
        visibility: 'GROUP_VISIBLE' as const,
        outcome: 'SYSTEM' as const,
        reason: '',
        tags: ['ALLIANCE', 'REQUEST'],
        relatedFactIds: [],
        relatedPromiseIds: [],
        relatedThreadIds: [],
        publicEligible: false,
        juryEligible: false,
      })
    )
    const makeRequest = (
      id: string,
      status: RealityAllianceRequest['status']
    ): RealityAllianceRequest => ({
      id,
      kind: 'PACT',
      status,
      proposerId: 'u',
      memberIds: ['u', 'k'],
      electorateIds: [],
      officerIds: [],
      votes: {},
      consents: {},
      purpose: 'Protection',
      createdAt: at,
      deadline: at,
      history: requestHistory,
    })

    for (let index = 0; index < 70; index += 1) {
      const request = makeRequest(`request:${index}`, 'ACCEPTED')
      state.allianceManagement.requests[request.id] = request
    }
    state.allianceManagement.requests.pending = makeRequest('pending', 'VOTING')
    for (let index = 0; index < 250; index += 1)
      state.allianceManagement.processedCommands[`receipt-${index}`] = {
        status: 'APPLIED',
        reason: 'Recorded',
      }

    const normalized = normalizeRealityDomainState(state)

    expect(Object.keys(normalized.allianceManagement.requests)).toHaveLength(65)
    expect(normalized.allianceManagement.requests['request:5']).toBeUndefined()
    expect(normalized.allianceManagement.requests['request:6']).toBeDefined()
    expect(normalized.allianceManagement.requests.pending.status).toBe('VOTING')
    expect(normalized.allianceManagement.requests['request:69'].history).toHaveLength(
      MAX_ALLIANCE_REQUEST_HISTORY_EVENTS
    )
    expect(Object.keys(normalized.allianceManagement.processedCommands)).toHaveLength(240)
    expect(normalized.allianceManagement.processedCommands['receipt-9']).toBeUndefined()
    expect(normalized.allianceManagement.processedCommands['receipt-10']).toBeDefined()
  })

  it('keeps the consultation result attached to the alliance history event', () => {
    const { state, group } = setup()
    const meeting = appendRealityEvent(state, {
      ...at,
      type: 'ALLIANCE_STRATEGY_MEETING',
      allianceId: group.id,
      actorId: 'u',
      targetIds: ['k'],
      participantIds: ['u', 'k'],
      witnessIds: [],
      visibility: 'GROUP_VISIBLE',
      outcome: 'SUCCESS',
      reason: `strategy_meeting:${group.id}:block_strategy:reality-event-source`,
      allianceConsultationSummary:
        'Kian recommends Remy for eviction. You have not chosen a position, so no alliance vote is set yet.',
      tags: ['ALLIANCE', 'STRATEGY', 'MEETING'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: true,
    })

    expect(allianceEventText(state, meeting, 'u', name)).toBe(
      'You consulted The Shield. Kian recommends Remy for eviction. You have not chosen a position, so no alliance vote is set yet.'
    )
    expect(allianceHistory(state, group.id, 'u')).toContain(meeting)
  })

  it('retains identity, founding day, renames and dissolution after feed trimming and save reload', () => {
    const { state, group } = setup()
    renameRealityAlliance(state, {
      allianceId: group.id,
      actorId: 'u',
      name: 'Spiderman',
      at: { day: 2, phase: 'social_1' },
    })
    manageAlliance(
      state,
      { type: 'DISSOLVE', allianceId: group.id, actorId: 'u' },
      { ...context, at: { day: 3, phase: 'social_2' } }
    )
    const event = state.events[0]
    for (let index = 0; index < 510; index++)
      appendRealityEvent(state, {
        ...at,
        type: 'CHAT',
        actorId: 'k',
        targetIds: [],
        participantIds: ['k'],
        witnessIds: [],
        visibility: 'PRIVATE',
        outcome: 'SYSTEM',
        reason: '',
        tags: [],
        relatedFactIds: [],
        relatedPromiseIds: [],
        relatedThreadIds: [],
        publicEligible: false,
        juryEligible: false,
      })
    expect(state.events).toHaveLength(500)
    expect(state.events).not.toContain(event)
    const restored = normalizeRealityDomainState(JSON.parse(JSON.stringify(state)))
    const history = allianceHistory(restored, group.id, 'u')
    expect(history.map((entry) => allianceEventText(restored, entry, 'u', name))).toEqual([
      'You dissolved Spiderman.',
      'You renamed The Shield to Spiderman.',
      'You founded The Shield with Kian and Jax.',
    ])
    expect(restored.alliances[group.id].createdAt).toEqual(at)
    expect(isFormerAllianceMember(restored.alliances[group.id], 'u')).toBe(true)
  })

  it('records the group vote before inviting the candidate and distinguishes rejection from joining', () => {
    const { state, group } = setup()
    const request = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'ADMIT', allianceId: group.id, candidateId: 'lia', actorId: 'u' },
      context
    )
    expect(allianceHistory(state, group.id, 'lia')).toHaveLength(0)
    manageAlliance(
      state,
      { type: 'RESPOND', requestId: request.requestId!, actorId: 'k', accept: true },
      context
    )
    manageAlliance(
      state,
      { type: 'RESPOND', requestId: request.requestId!, actorId: 'j', accept: false },
      context
    )
    const pending = state.allianceManagement.requests[request.requestId!]
    expect(pending.status).toBe('CONSENT')
    expect(pending.history!.filter((event) => event.type === 'ALLIANCE_REQUEST_VOTE')).toHaveLength(
      3
    )
    expect(group.memberIds).not.toContain('lia')
    expect(allianceHistory(state, group.id, 'lia').map((event) => event.type)).toEqual([
      'ALLIANCE_INVITATION_SENT',
    ])
    expect(isFormerAllianceMember(group, 'lia')).toBe(false)
    manageAlliance(
      state,
      { type: 'RESPOND', requestId: pending.id, actorId: 'lia', accept: false },
      context
    )
    expect(pending.status).toBe('DECLINED')
    expect(allianceEventText(state, pending.history!.at(-1)!, 'u', name)).toBe(
      "Lia turned down The Shield's invitation."
    )
    const nextDayContext = { ...context, at: { day: 2, phase: 'social_1' as const } }
    const retry = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'ADMIT', allianceId: group.id, candidateId: 'lia', actorId: 'u' },
      nextDayContext
    )
    for (const actorId of ['k', 'j', 'lia'])
      manageAlliance(
        state,
        { type: 'RESPOND', requestId: retry.requestId!, actorId, accept: true },
        nextDayContext
      )
    expect(group.memberIds).toContain('lia')
    expect(
      allianceHistory(state, group.id, 'u').some(
        (event) => allianceEventText(state, event, 'u', name) === 'Lia joined The Shield.'
      )
    ).toBe(true)
  })

  it('does not reveal private AI activity or new group events to a former member', () => {
    const { state, group } = setup()
    appendRealityEvent(state, {
      ...at,
      type: 'ALLIANCE_FALSE_PRETENSE_ESTABLISHED',
      allianceId: group.id,
      actorId: 'k',
      targetIds: [],
      participantIds: ['k'],
      witnessIds: [],
      visibility: 'PRIVATE',
      outcome: 'SYSTEM',
      reason: '',
      tags: [],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    removeRealityAllianceMember(state, {
      allianceId: group.id,
      memberId: 'u',
      actorId: 'u',
      kind: 'VOLUNTARY',
      at,
    })
    renameRealityAlliance(state, {
      allianceId: group.id,
      actorId: group.leaderId!,
      name: 'Secret new name',
      at: { day: 2, phase: 'social_1' },
    })
    const history = allianceHistory(state, group.id, 'u')
    expect(history.map((event) => event.type)).toEqual(['ALLIANCE_MEMBER_LEFT', 'ALLIANCE_FORMED'])
    expect(history.some((event) => event.allianceSnapshot?.name === 'Secret new name')).toBe(false)
  })

  it('keeps commitments and their outcomes in their originating alliance with their original visibility', () => {
    const { state, group } = setup()
    upsertRealityPromise(state, {
      id: 'vote-promise',
      kind: 'VOTE',
      promisorId: 'u',
      beneficiaryIds: ['k'],
      witnessIds: [],
      createdAt: at,
      stakes: 0.5,
      scope: {},
      status: 'ACTIVE',
      originatingAllianceId: group.id,
      visibility: 'PAIR_ONLY',
    })
    resolveRealityPromise(
      state,
      'vote-promise',
      'BROKEN',
      { day: 2, phase: 'social_2' },
      'vote-event'
    )
    expect(
      allianceHistory(state, group.id, 'u')
        .filter((event) => event.type === 'ALLIANCE_COMMITMENT_CHANGED')
        .map((event) => event.allianceCommitmentSnapshot?.status)
    ).toEqual(['BROKEN', 'ACTIVE'])
    expect(
      allianceHistory(state, group.id, 'j').some(
        (event) => event.type === 'ALLIANCE_COMMITMENT_CHANGED'
      )
    ).toBe(false)
  })

  it('keeps earlier commitment event IDs addressable when similar promises share a story entry', () => {
    const { state, group } = setup()
    for (const id of ['first-vote-promise', 'second-vote-promise'])
      upsertRealityPromise(state, {
        id,
        kind: 'VOTE',
        promisorId: 'u',
        beneficiaryIds: ['k'],
        witnessIds: [],
        createdAt: at,
        stakes: 0.5,
        scope: {},
        status: 'ACTIVE',
        originatingAllianceId: group.id,
        visibility: 'GROUP_VISIBLE',
      })

    const sourceEvents = state.events.filter(
      (event) => event.type === 'ALLIANCE_COMMITMENT_CHANGED'
    )
    const entries = allianceHistory(state, group.id, 'u').filter(
      (event) => event.type === 'ALLIANCE_COMMITMENT_CHANGED'
    )

    expect(entries).toHaveLength(1)
    expect(entries[0].relatedPromiseIds).toEqual(['second-vote-promise', 'first-vote-promise'])
    expect(entries[0].mergedEventIds).toContain(sourceEvents[0].id)
    expect(allianceEventText(state, entries[0], 'u', name)).toBe(
      'You made 2 vote promises to Kian in The Shield.'
    )
  })

  it('adopts surviving legacy events without confusing colon-containing IDs or inventing lost history', () => {
    const { state, group } = setup()
    group.history = []
    const formation = state.events[0]
    delete formation.allianceId
    delete formation.allianceSnapshot
    const normalized = normalizeRealityDomainState(state)
    expect(allianceHistory(normalized, group.id, 'u')).toHaveLength(1)
    const legacy = {
      ...formation,
      type: 'ALLIANCE_RENAMED',
      reason: `renamed:${group.id}:Spiderman`,
    }
    expect(allianceForEvent(normalized, legacy)).toBe(group.id)
  })
})
