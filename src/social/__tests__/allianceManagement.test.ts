import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import {
  advanceAllianceRequests,
  finalizeAcceptedPersonalPact,
  manageAlliance,
  type AllianceManagementContext,
} from '../reality/allianceManagement'
import {
  currentAllianceCounts,
  isCurrentAlliance,
  normalizeAllianceManagement,
} from '../reality/allianceIdentity'
import { allianceEventText } from '../reality/allianceHistory'
import {
  createDirectedRelationship,
  createInitialRealityDomainState,
  ensureRealityActors,
  normalizeRealityDomainState,
} from '../reality/state'
import {
  createRealityAlliance,
  migrateDramaAlliances,
  reconcileRealityBattleBackReturn,
  refreshRealityAllianceDynamics,
  removeRealityAllianceMember,
  removeRealityAllianceMembers,
  renameRealityAlliance,
} from '../reality/relationshipForms'
import {
  getRealityAllianceKnowledgeView,
  maybeExposeRealityAlliance,
} from '../reality/allianceKnowledge'
import {
  compareRealityClock,
  resolveRealityPromise,
  upsertRealityPromise,
} from '../reality/commitments'
import { compareIncomingClock } from '../incomingInteractionDeadline'
import { hasCanonicalLiveAlliance } from '../relationshipSemantics'
import type { RealityDomainState } from '../reality/types'
import type { DramaAlliance } from '../types'

const ids = ['u', 'k', 'r', 'x', 'c', 'd', 'e', 'f', 'g', 'h']
const context: AllianceManagementContext = {
  at: { day: 1, phase: 'social_1' },
  activeActorIds: ids,
  humanActorIds: ids,
  seed: 13,
}
const setup = () => {
  const state = createInitialRealityDomainState()
  ensureRealityActors(state, ids)
  return state
}

describe('alliance normalization during progression', () => {
  it('still repairs a missing legacy pact officer list', () => {
    const state = setup()
    const legacy = pact(state)
    delete (legacy as Partial<typeof legacy>).leaderIds
    normalizeAllianceManagement(state)
    expect(legacy.leaderIds).toEqual([])
  })
  it('preserves an unchanged normalized world and refreshes knowledge when the roster changes', () => {
    const state = setup()
    group(state)
    pact(state, 'c', 'd')
    const normalized = produce(state, (draft) => normalizeAllianceManagement(draft))
    const repeated = produce(normalized, (draft) => normalizeAllianceManagement(draft))
    expect(repeated).toBe(normalized)

    const changed = produce(normalized, (draft) => {
      draft.alliances.group.name = 'A new name'
      draft.alliances.group.memberIds.push('x')
      draft.alliances.group.rosterRevision!++
      normalizeAllianceManagement(draft)
    })
    expect(changed.alliances.group.rosterKnowledgeByActor?.u).toMatchObject({
      name: 'A new name',
      memberIds: ['u', 'k', 'r', 'x'],
    })
    expect(changed.alliances.group.rosterKnowledgeByActor?.x).toBeDefined()
    expect(changed.alliances['pact:c:d']).toBe(normalized.alliances['pact:c:d'])
  })
})
const pact = (state: RealityDomainState, a = 'u', b = 'k', purpose = 'Mutual protection') =>
  createRealityAlliance(state, {
    id: `pact:${a}:${b}`,
    founderIds: [a],
    memberIds: [b],
    purpose,
    at: context.at,
  })
const group = (
  state: RealityDomainState,
  members = ['u', 'k', 'r'],
  id = 'group',
  leaderId = 'u',
  coLeaderId?: string
) =>
  createRealityAlliance(state, {
    id,
    kind: 'GROUP',
    founderIds: members,
    memberIds: [],
    purpose: 'Mutual protection',
    at: context.at,
    leaderId,
    coLeaderId,
  })
const respond = (state: RealityDomainState, requestId: string, actorId: string, accept = true) =>
  manageAlliance(state, { type: 'RESPOND', requestId, actorId, accept }, context)
const request = (
  state: RealityDomainState,
  candidateId = 'x',
  allianceId = 'group',
  actorId = 'u'
) =>
  manageAlliance(
    state,
    { type: 'PROPOSE', kind: 'ADMIT', actorId, candidateId, allianceId },
    context
  ).requestId!
const approve = (state: RealityDomainState, id: string) => {
  for (const actorId of state.allianceManagement.requests[id].electorateIds)
    respond(state, id, actorId)
}

describe('explicit alliance management', () => {
  it('names the members and alliance when a founding vote succeeds', () => {
    const state = setup()
    const namedContext: AllianceManagementContext = {
      ...context,
      humanActorIds: ['u', 'k', 'r'],
      displayNames: { u: 'Player', k: 'Kian', r: 'Jax' },
      viewerActorId: 'u',
    }
    const proposal = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'FOUND',
        actorId: 'u',
        memberIds: ['u', 'k', 'r'],
        name: 'The Shield',
      },
      namedContext
    )
    const requestId = proposal.requestId!
    manageAlliance(state, { type: 'RESPOND', requestId, actorId: 'k', accept: true }, namedContext)
    const completed = manageAlliance(
      state,
      { type: 'RESPOND', requestId, actorId: 'r', accept: true },
      namedContext
    )

    expect(completed.reason).toBe(
      'You, Kian, and Jax made it official. Your new alliance is ready to be named.'
    )
    expect(state.allianceManagement.requests[requestId].status).toBe('ACCEPTED')
    expect(state.alliances[`alliance:${requestId}`]?.name).toBe('The Shield')
  })

  it('makes the person who submitted the founding request the leader', () => {
    const state = setup()
    const proposal = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'FOUND', actorId: 'u', memberIds: ['k', 'r', 'u'] },
      context
    )
    const requestId = proposal.requestId!
    respond(state, requestId, 'k')
    respond(state, requestId, 'r')

    const alliance = state.alliances[`alliance:${requestId}`]
    expect(alliance.createdById).toBe('u')
    expect(alliance.leaderId).toBe('u')
    expect(alliance.leaderIds).toContain('u')
  })

  it('repairs a missing or stale leader to the creator unless leadership was transferred', () => {
    const state = setup()
    const alliance = group(state)
    delete alliance.createdById
    alliance.leaderId = 'k'
    alliance.leaderIds = ['k']

    const normalized = normalizeRealityDomainState(state).alliances[alliance.id]
    expect(normalized.createdById).toBe('u')
    expect(normalized.leaderId).toBe('u')

    const missingLeaderState = setup()
    const missingLeaderAlliance = group(missingLeaderState)
    delete missingLeaderAlliance.createdById
    missingLeaderAlliance.leaderId = undefined
    missingLeaderAlliance.leaderIds = ['k']
    expect(normalizeRealityDomainState(missingLeaderState).alliances.group.leaderId).toBe('u')

    const transferredState = setup()
    const transferredAlliance = group(transferredState)
    const transfer = manageAlliance(
      transferredState,
      { type: 'PROPOSE', kind: 'TRANSFER', actorId: 'u', candidateId: 'k', allianceId: 'group' },
      context
    )
    respond(transferredState, transfer.requestId!, 'k')
    expect(transferredAlliance.leaderId).toBe('k')
    expect(normalizeRealityDomainState(transferredState).alliances.group.leaderId).toBe('k')

    const departedState = setup()
    const departedAlliance = group(departedState, undefined, undefined, 'u', 'k')
    manageAlliance(departedState, { type: 'LEAVE', actorId: 'u', allianceId: 'group' }, context)
    expect(departedAlliance.leaderId).toBe('k')
    expect(normalizeRealityDomainState(departedState).alliances.group.leaderId).toBe('k')
  })

  it('lets only the leader rename directly and routes member suggestions to the leader', () => {
    const state = setup()
    const alliance = group(state)
    const rejected = manageAlliance(
      state,
      { type: 'RENAME', allianceId: alliance.id, actorId: 'k', name: 'The Orbit' },
      context
    )
    expect(rejected.status).toBe('REJECTED')
    expect(alliance.name).not.toBe('The Orbit')

    const suggestion = manageAlliance(
      state,
      { type: 'SUGGEST_RENAME', allianceId: alliance.id, actorId: 'k', name: 'The Orbit' },
      context
    )
    expect(suggestion.status).toBe('APPLIED')
    expect(alliance.name).not.toBe('The Orbit')
    const accepted = respond(state, suggestion.requestId!, 'u')
    expect(accepted.status).toBe('APPLIED')
    expect(alliance.name).toBe('The Orbit')
    expect(state.events.some((event) => event.type === 'ALLIANCE_RENAMED')).toBe(true)

    const leaderRename = manageAlliance(
      state,
      { type: 'RENAME', allianceId: alliance.id, actorId: 'u', name: 'The Night Shift' },
      context
    )
    expect(leaderRename.status).toBe('APPLIED')
    expect(alliance.name).toBe('The Night Shift')

    const pendingSuggestion = manageAlliance(
      state,
      { type: 'SUGGEST_RENAME', allianceId: alliance.id, actorId: 'r', name: 'The Late Shift' },
      context
    )
    const leaderChange = manageAlliance(
      state,
      { type: 'RENAME', allianceId: alliance.id, actorId: 'u', name: 'The Final Four' },
      context
    )
    expect(leaderChange.status).toBe('APPLIED')
    expect(state.allianceManagement.requests[pendingSuggestion.requestId!].status).toBe(
      'INVALIDATED'
    )
    expect(alliance.name).toBe('The Final Four')
  })

  it('keeps the Kian/Rae conversations as two personal pacts without inventing a group', () => {
    const state = setup()
    finalizeAcceptedPersonalPact(state, {
      actorId: 'u',
      targetId: 'k',
      at: context.at,
      interactionId: 'one',
    })
    finalizeAcceptedPersonalPact(state, {
      actorId: 'u',
      targetId: 'r',
      at: context.at,
      interactionId: 'two',
    })
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 0, pacts: 2 })
    expect(Object.values(state.alliances).map((entry) => entry.memberIds)).toEqual([
      ['u', 'k'],
      ['u', 'r'],
    ])
  })
  it('keeps existing one-to-one pacts when founding a separate group', () => {
    const state = setup()
    const beaPact = pact(state, 'u', 'k')
    const zedPact = pact(state, 'u', 'r')
    const id = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'FOUND',
        actorId: 'u',
        memberIds: ['u', 'k', 'r'],
      },
      context
    ).requestId!

    respond(state, id, 'k')
    respond(state, id, 'r')

    expect(isCurrentAlliance(beaPact)).toBe(true)
    expect(isCurrentAlliance(zedPact)).toBe(true)
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 1, pacts: 2 })
  })
  it('allows more than three independent personal pacts', () => {
    const state = setup()
    for (const partner of ['k', 'r', 'x', 'c']) pact(state, 'u', partner)

    const proposal = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'd' },
      context
    )
    const request = state.allianceManagement.requests[proposal.requestId!]

    expect(proposal.status).toBe('APPLIED')
    expect(request.status).toBe('CONSENT')
    expect(currentAllianceCounts(state, 'u').pacts).toBe(4)
  })
  it('creates a new group only after unanimous founding and then supersedes the selected ordinary pact', () => {
    const state = setup()
    const original = pact(state)
    upsertRealityPromise(state, {
      id: 'private',
      kind: 'protect',
      promisorId: 'u',
      beneficiaryIds: ['k'],
      witnessIds: [],
      createdAt: context.at,
      stakes: 1,
      scope: {},
      status: 'ACTIVE',
    })
    const id = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'FOUND',
        actorId: 'u',
        memberIds: ['u', 'k', 'r'],
        basePactId: original.id,
      },
      context
    ).requestId!
    respond(state, id, 'k')
    expect(currentAllianceCounts(state, 'u').groups).toBe(0)
    respond(state, id, 'r')
    const created = state.alliances[state.allianceManagement.requests[id].resultAllianceId!]
    expect(created.id).not.toBe(original.id)
    expect(original.status).toBe('DISSOLVED')
    expect(created.memberIds).toEqual(['u', 'k', 'r'])
    expect(created.sharedPromiseIds).toEqual([])
    expect(state.promises.private.originatingAllianceId).toBe(original.id)
    expect(state.promises.private.beneficiaryIds).toEqual(['k'])
  })
  it('preserves a private Final Two when founding a wider group', () => {
    const state = setup()
    const original = pact(state, 'u', 'k', 'Final Two')
    const id = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'FOUND',
        actorId: 'u',
        memberIds: ['k', 'r'],
        basePactId: original.id,
      },
      context
    ).requestId!
    respond(state, id, 'k')
    respond(state, id, 'r')
    expect(isCurrentAlliance(original)).toBe(true)
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 1, pacts: 1 })
  })
  it('cancels a rejected founding without a partial group or changing the original pact', () => {
    const state = setup()
    const original = pact(state)
    const id = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'FOUND',
        actorId: 'u',
        memberIds: ['k', 'r'],
        basePactId: original.id,
      },
      context
    ).requestId!
    respond(state, id, 'k', false)
    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(isCurrentAlliance(original)).toBe(true)
    expect(currentAllianceCounts(state, 'u').groups).toBe(0)
  })
  it('requires a strict majority and separate candidate consent', () => {
    const state = setup()
    const alliance = group(state)
    const id = request(state, 'x', 'group', 'k')
    respond(state, id, 'r')
    respond(state, id, 'u', false)
    expect(state.allianceManagement.requests[id].status).toBe('CONSENT')
    expect(alliance.memberIds).not.toContain('x')
    expect(state.allianceManagement.requests[id].voteSummary).toContain('k voted yes')
    expect(state.allianceManagement.requests[id].voteSummary).toContain('r voted yes')
    expect(state.allianceManagement.requests[id].voteSummary).toContain('u voted no')
    respond(state, id, 'x')
    expect(state.allianceManagement.requests[id].status).toBe('ACCEPTED')
    expect(alliance.memberIds).toContain('x')
  })
  it('lets an invitee at the group limit choose which current group to leave only when accepting', () => {
    const state = setup()
    const target = group(state)
    const firstCurrent = group(state, ['x', 'c', 'd'], 'candidate-first', 'c')
    const secondCurrent = group(state, ['x', 'e', 'f'], 'candidate-second', 'e')
    firstCurrent.name = 'Old Circle'
    secondCurrent.name = 'Quiet Group'

    const id = request(state, 'x')
    respond(state, id, 'k')
    respond(state, id, 'r')
    respond(state, id, 'u')
    expect(state.allianceManagement.requests[id].status).toBe('CONSENT')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)

    const withoutChoice = manageAlliance(
      state,
      { type: 'RESPOND', requestId: id, actorId: 'x', accept: true },
      context
    )
    expect(withoutChoice.status).toBe('REJECTED')
    expect(state.allianceManagement.requests[id].status).toBe('CONSENT')
    expect(firstCurrent.memberIds).toContain('x')
    expect(secondCurrent.memberIds).toContain('x')

    const accepted = manageAlliance(
      state,
      {
        type: 'RESPOND',
        requestId: id,
        actorId: 'x',
        accept: true,
        leaveAllianceId: firstCurrent.id,
      },
      context
    )
    expect(accepted.status).toBe('APPLIED')
    expect(state.allianceManagement.requests[id].status).toBe('ACCEPTED')
    expect(firstCurrent.memberIds).not.toContain('x')
    expect(secondCurrent.memberIds).toContain('x')
    expect(target.memberIds).toContain('x')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)
  })
  it('does not change an invitee’s existing groups when they decline at the group limit', () => {
    const state = setup()
    const target = group(state)
    const firstCurrent = group(state, ['x', 'c', 'd'], 'candidate-first', 'c')
    const secondCurrent = group(state, ['x', 'e', 'f'], 'candidate-second', 'e')
    const id = request(state, 'x')
    approve(state, id)

    respond(state, id, 'x', false)

    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(firstCurrent.memberIds).toContain('x')
    expect(secondCurrent.memberIds).toContain('x')
    expect(target.memberIds).not.toContain('x')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)
  })
  it('does not let an AI invitee trade two healthy alliances for a comparable one by default', () => {
    const state = setup()
    const target = group(state)
    const firstCurrent = group(state, ['x', 'c', 'd'], 'candidate-first', 'c')
    const secondCurrent = group(state, ['x', 'e', 'f'], 'candidate-second', 'e')
    const id = request(state, 'x', target.id)
    approve(state, id)

    advanceAllianceRequests(state, { ...context, humanActorIds: ids.filter((id) => id !== 'x') })

    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(firstCurrent.memberIds).toContain('x')
    expect(secondCurrent.memberIds).toContain('x')
    expect(target.memberIds).not.toContain('x')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)
  })
  it('can accept a strategically stronger invitation when the weakest current group is fractured', () => {
    const state = setup()
    const target = group(state)
    target.status = 'ACTIVE'
    const fractured = group(state, ['x', 'c', 'd'], 'candidate-fractured', 'c')
    fractured.status = 'FRACTURED'
    fractured.cohesion = 0.1
    fractured.fractureRisk = 0.9
    const healthy = group(state, ['x', 'e', 'f'], 'candidate-healthy', 'e')
    healthy.status = 'ACTIVE'
    healthy.cohesion = 0.8
    healthy.fractureRisk = 0.05
    state.relationships.x = Object.fromEntries(
      target.memberIds.map((memberId) => [memberId, createDirectedRelationship('x', memberId, 100)])
    )
    const id = request(state, 'x', target.id)
    approve(state, id)

    advanceAllianceRequests(state, { ...context, humanActorIds: ids.filter((id) => id !== 'x') })

    expect(state.allianceManagement.requests[id].status).toBe('ACCEPTED')
    expect(fractured.memberIds).not.toContain('x')
    expect(healthy.memberIds).toContain('x')
    expect(target.memberIds).toContain('x')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)
  })
  it('lets the leader break a two-member admission tie with a yes vote', () => {
    const state = setup()
    const alliance = group(state)
    manageAlliance(state, { type: 'LEAVE', actorId: 'r', allianceId: alliance.id }, context)
    const id = request(state, 'x')
    respond(state, id, 'k', false)

    expect(state.allianceManagement.requests[id].status).toBe('CONSENT')
    expect(state.allianceManagement.requests[id].voteSummary).toContain(
      'leader u broke the tie with a yes vote'
    )
    respond(state, id, 'x')
    expect(alliance.memberIds).toContain('x')
  })
  it('rejects a two-member tie when the leader votes no', () => {
    const state = setup()
    const alliance = group(state)
    manageAlliance(state, { type: 'LEAVE', actorId: 'r', allianceId: alliance.id }, context)
    const id = request(state, 'x', alliance.id, 'k')
    respond(state, id, 'u', false)

    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(state.allianceManagement.requests[id].voteSummary).toContain(
      'leader u broke the tie with a no vote'
    )
    expect(alliance.memberIds).not.toContain('x')
  })
  it('never invents the human ballot even when the AI ballots form a majority', () => {
    const state = setup()
    group(state, ['u', 'k', 'r'], 'group', 'k')
    for (const actorId of ['k', 'r'])
      state.relationships[actorId] = {
        x: {
          ...state.relationships[actorId]?.x,
          fromId: actorId,
          toId: 'x',
          trust: 100,
        } as RealityDomainState['relationships'][string][string],
      }
    const mixed = { ...context, humanActorIds: ['u', 'x'], seed: 1 }
    const id = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'ADMIT', actorId: 'k', candidateId: 'x', allianceId: 'group' },
      mixed
    ).requestId!
    expect(state.allianceManagement.requests[id].votes.u).toBeUndefined()
    expect(state.allianceManagement.requests[id].status).toBe('VOTING')
    const saved = normalizeRealityDomainState(state)
    advanceAllianceRequests(saved, mixed)
    expect(saved.allianceManagement.requests[id].votes).toEqual(
      state.allianceManagement.requests[id].votes
    )
  })
  it('retains disclosed roster knowledge after a candidate declines', () => {
    const state = setup()
    group(state)
    const id = request(state)
    approve(state, id)
    respond(state, id, 'x', false)
    expect(getRealityAllianceKnowledgeView(state, 'group', 'x').knownMemberIds.sort()).toEqual([
      'k',
      'r',
      'u',
    ])
    expect(state.alliances.group.memberIds).not.toContain('x')
  })
  it('invalidates consent on roster/governance changes but allows a name-only change', () => {
    const state = setup()
    group(state)
    const first = request(state)
    approve(state, first)
    renameRealityAlliance(state, {
      allianceId: 'group',
      actorId: 'u',
      name: 'New name',
      at: context.at,
    })
    respond(state, first, 'x')
    expect(state.allianceManagement.requests[first].status).toBe('ACCEPTED')
    const second = request(state, 'c')
    approve(state, second)
    manageAlliance(
      state,
      { type: 'REMOVE', allianceId: 'group', actorId: 'u', targetId: 'r' },
      context
    )
    expect(state.allianceManagement.requests[second].status).toBe('INVALIDATED')
    respond(state, second, 'c')
    expect(state.alliances.group.memberIds).not.toContain('c')
  })
  it('requires a deliberate alliance switch when two invitations compete for a candidate at the group limit', () => {
    const state = setup()
    group(state)
    group(state, ['k', 'c', 'd'], 'second', 'k')
    group(state, ['x', 'e', 'f'], 'existing', 'x')
    const first = request(state)
    const second = request(state, 'x', 'second', 'k')
    approve(state, first)
    approve(state, second)
    respond(state, first, 'x')
    expect(state.allianceManagement.requests[first].status).toBe('ACCEPTED')
    expect(state.allianceManagement.requests[second].status).toBe('CONSENT')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)

    const acceptedSwitch = manageAlliance(
      state,
      {
        type: 'RESPOND',
        requestId: second,
        actorId: 'x',
        accept: true,
        leaveAllianceId: 'existing',
      },
      context
    )
    expect(acceptedSwitch.status).toBe('APPLIED')
    expect(state.allianceManagement.requests[second].status).toBe('ACCEPTED')
    expect(state.alliances.existing.memberIds).not.toContain('x')
    expect(state.alliances.second.memberIds).toContain('x')
    expect(currentAllianceCounts(state, 'x').groups).toBe(2)
  })
  it('allows additional personal pacts independently of group membership limits', () => {
    const state = setup()
    group(state)
    group(state, ['u', 'c', 'd'], 'second')
    for (const target of ['k', 'r', 'c', 'd']) pact(state, 'u', target)
    const id = request(state)
    approve(state, id)
    respond(state, id, 'x')
    expect(state.allianceManagement.requests[id].status).toBe('ACCEPTED')
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 2, pacts: 4 })
    expect(
      manageAlliance(
        state,
        { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'e' },
        context
      ).status
    ).toBe('APPLIED')
  })
  it('keeps roles stable when social standing changes and requires accepting an officer offer', () => {
    const state = setup()
    const alliance = group(state)
    alliance.memberCommitment.u = 0.1
    alliance.memberCommitment.r = 1
    refreshRealityAllianceDynamics(alliance)
    expect(alliance.leaderId).toBe('u')
    const id = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'APPOINT', actorId: 'u', candidateId: 'k', allianceId: 'group' },
      context
    ).requestId!
    expect(alliance.coLeaderId).toBeUndefined()
    respond(state, id, 'k')
    expect(alliance.coLeaderId).toBe('k')
  })
  it('prevents a co-leader removing the leader or dissolving the group', () => {
    const state = setup()
    group(state, undefined, undefined, 'u', 'k')
    expect(
      manageAlliance(
        state,
        { type: 'REMOVE', actorId: 'k', allianceId: 'group', targetId: 'u' },
        context
      ).status
    ).toBe('REJECTED')
    expect(
      manageAlliance(state, { type: 'DISSOLVE', actorId: 'k', allianceId: 'group' }, context).status
    ).toBe('REJECTED')
    expect(
      manageAlliance(
        state,
        { type: 'REMOVE', actorId: 'r', allianceId: 'group', targetId: 'k' },
        context
      ).status
    ).toBe('REJECTED')
  })
  it('accepts removal suggestions only through an authorized officer decision', () => {
    const state = setup()
    group(state)
    const id = manageAlliance(
      state,
      {
        type: 'PROPOSE',
        kind: 'REMOVE_SUGGESTION',
        actorId: 'k',
        candidateId: 'r',
        allianceId: 'group',
      },
      context
    ).requestId!
    expect(state.alliances.group.memberIds).toContain('r')
    respond(state, id, 'u')
    expect(state.alliances.group.memberIds).toEqual(['u', 'k'])
  })
  it('retains the group identity at two members and ends every membership below two', () => {
    const state = setup()
    const alliance = group(state)
    manageAlliance(state, { type: 'LEAVE', actorId: 'r', allianceId: 'group' }, context)
    expect(alliance.kind).toBe('GROUP')
    expect(currentAllianceCounts(state, 'u').groups).toBe(1)
    manageAlliance(state, { type: 'LEAVE', actorId: 'k', allianceId: 'group' }, context)
    expect(alliance.memberIds).toEqual([])
    expect(currentAllianceCounts(state, 'u').groups).toBe(0)
  })
  it('allows hostile members to leave while preserving independent connections', () => {
    const state = setup()
    group(state)
    const personal = pact(state)
    state.alliances.group.status = 'FRACTURED'
    state.alliances.group.memberCommitment.u = 0
    manageAlliance(state, { type: 'LEAVE', actorId: 'u', allianceId: 'group' }, context)
    expect(hasCanonicalLiveAlliance(state, 'u', 'r')).toBe(false)
    expect(hasCanonicalLiveAlliance(state, 'u', 'k')).toBe(true)
    manageAlliance(state, { type: 'LEAVE', actorId: 'u', allianceId: personal.id }, context)
    expect(hasCanonicalLiveAlliance(state, 'u', 'k')).toBe(false)
  })
  it('promotes the co-leader on departure and clears the co-leader slot', () => {
    const state = setup()
    const alliance = group(state, undefined, undefined, 'u', 'k')
    manageAlliance(state, { type: 'LEAVE', actorId: 'u', allianceId: 'group' }, context)
    expect(alliance.leaderId).toBe('k')
    expect(alliance.coLeaderId).toBeUndefined()
  })
  it('applies simultaneous officer eviction before assigning a surviving successor', () => {
    const state = setup()
    const alliance = group(state, ['u', 'k', 'r', 'x'], 'group', 'u', 'k')
    removeRealityAllianceMembers(state, { memberIds: ['u', 'k'], at: context.at })
    expect(alliance.leaderId).toBe('r')
    expect(alliance.memberIds).toEqual(['r', 'x'])
    expect(alliance.leaderIds).toEqual(['r'])
  })
  it('never restores Battle Back membership or former officer authority', () => {
    const state = setup()
    group(state)
    state.reentryProfiles.u = {
      evictedAt: context.at,
      alliances: [{ ...state.alliances.group, allianceId: 'group' }],
    }
    removeRealityAllianceMembers(state, { memberIds: ['u'], at: context.at })
    const result = reconcileRealityBattleBackReturn(state, {
      playerId: 'u',
      at: context.at,
      activeActorIds: ids,
    })
    expect(result.restoredAllianceIds).toEqual([])
    expect(state.alliances.group.memberIds).not.toContain('u')
    expect(state.alliances.group.leaderId).not.toBe('u')
  })
  it('does not reveal a new recruit through an old public exposure', () => {
    const state = setup()
    const alliance = group(state)
    alliance.secrecy = 0
    maybeExposeRealityAlliance(state, alliance.id, context.at, 'exposure')
    const id = request(state)
    approve(state, id)
    respond(state, id, 'x')
    const outsider = getRealityAllianceKnowledgeView(state, 'group', 'c')
    expect(outsider.fullMembershipKnown).toBe(false)
    expect(outsider.knownMemberIds).not.toContain('x')
  })
  it('keeps a former member’s last-known name and roster without future secret updates', () => {
    const state = setup()
    const alliance = group(state)
    renameRealityAlliance(state, {
      allianceId: 'group',
      actorId: 'u',
      name: 'Old name',
      at: context.at,
    })
    manageAlliance(state, { type: 'LEAVE', actorId: 'r', allianceId: 'group' }, context)
    renameRealityAlliance(state, {
      allianceId: 'group',
      actorId: 'u',
      name: 'Secret name',
      at: context.at,
    })
    expect(getRealityAllianceKnowledgeView(state, alliance.id, 'r').displayName).toBe('Old name')
  })
  it('binds private promise consequences to the original pact rather than a stronger shared group', () => {
    const state = setup()
    const personal = pact(state)
    upsertRealityPromise(state, {
      id: 'promise',
      kind: 'protect',
      promisorId: 'u',
      beneficiaryIds: ['k'],
      witnessIds: [],
      createdAt: context.at,
      stakes: 1,
      scope: {},
      status: 'ACTIVE',
    })
    const shared = group(state)
    const before = shared.memberCommitment.u
    resolveRealityPromise(state, 'promise', 'BROKEN', context.at, 'broken')
    expect(personal.memberCommitment.u).toBeLessThan(0.5)
    expect(shared.memberCommitment.u).toBe(before)
  })
  it('permits a personal pact within a group and deduplicates reverse pair requests', () => {
    const state = setup()
    group(state)
    const first = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'k' },
      context
    )
    const second = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'k', candidateId: 'u' },
      context
    )
    expect(second.requestId).toBe(first.requestId)
    respond(state, first.requestId!, 'k')
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 1, pacts: 1 })
  })
  it('lets an isolated AI accept a useful pact from a reliable, visibly connected proposer', () => {
    const state = setup()
    state.relationships.k = { u: createDirectedRelationship('k', 'u', 65) }
    Object.assign(state.relationships.k.u, {
      trust: 65,
      reliability: 80,
      warmth: 55,
      loyalty: 50,
      strategicValue: 55,
    })
    state.contestants.k.primaryGoalId = 'SURVIVE_THE_VOTE'
    state.contestants.k.loneliness = 65
    const proposerGroup = group(state, ['u', 'r', 'x'], 'proposer-network')
    proposerGroup.rosterKnowledgeByActor!.k = {
      memberIds: ['u', 'r', 'x'],
      rosterRevision: proposerGroup.rosterRevision ?? 0,
    }

    const proposal = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'k' },
      { ...context, humanActorIds: ['u'] }
    )
    const request = state.allianceManagement.requests[proposal.requestId!]
    const pactId = request.resultAllianceId!

    expect(request.status).toBe('ACCEPTED')
    expect(request.responsesByActorId?.k).toEqual({
      style: 'ENTHUSIASTIC',
      reason: 'You have useful connections, and I trust you to follow through for both of us.',
    })
    expect(state.alliances[pactId].memberCommitment.k).toBe(0.68)
  })
  it('allows a well-connected AI to accept a pact while limiting what it will promise existing allies', () => {
    const state = setup()
    state.relationships.k = { u: createDirectedRelationship('k', 'u', 50) }
    Object.assign(state.relationships.k.u, {
      trust: 70,
      reliability: 70,
      warmth: 40,
      loyalty: 50,
      strategicValue: 40,
    })
    const existing = pact(state, 'k', 'r')
    existing.memberCommitment.k = 0.95

    const proposal = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'k' },
      { ...context, humanActorIds: ['u'], displayNames: { u: 'Player', k: 'Kian' } }
    )
    const request = state.allianceManagement.requests[proposal.requestId!]

    expect(request.status).toBe('ACCEPTED')
    expect(request.responsesByActorId?.k).toEqual({
      style: 'LIMITED',
      reason: 'I can work with you, but I will not break my existing commitments for this pact.',
    })
    expect(state.alliances[request.resultAllianceId!].memberCommitment.k).toBe(0.32)
    expect(request.reason).toContain('agreed with limits')
    expect(request.reason).toContain('Kian')
    expect(request.reason).toContain('existing commitments')
    const consentEvent = request.history?.find(
      (entry) => entry.type === 'ALLIANCE_REQUEST_CONSENT' && entry.actorId === 'k'
    )
    expect(consentEvent?.allianceRequestSnapshot).toMatchObject({
      accepted: true,
      responseStyle: 'LIMITED',
      responseReason:
        'I can work with you, but I will not break my existing commitments for this pact.',
    })
    expect(allianceEventText(state, consentEvent!, 'u', (id) => (id === 'k' ? 'Kian' : id))).toBe(
      'Kian accepted: “I can work with you, but I will not break my existing commitments for this pact.”'
    )
  })
  it('makes known broken promises reduce pact acceptance and gives the AI a clear reason', () => {
    const makeScenario = (withBrokenPromises: boolean) => {
      const state = setup()
      state.relationships.k = { u: createDirectedRelationship('k', 'u', 60) }
      Object.assign(state.relationships.k.u, {
        trust: 60,
        reliability: 80,
        warmth: 50,
        loyalty: 40,
        strategicValue: 40,
      })
      const existing = pact(state, 'k', 'r')
      existing.memberCommitment.k = 0.95
      if (withBrokenPromises) {
        for (let index = 0; index < 3; index += 1) {
          upsertRealityPromise(state, {
            id: `broken-deal-${index}`,
            kind: 'protection vote',
            promisorId: 'u',
            beneficiaryIds: ['k'],
            witnessIds: [],
            createdAt: context.at,
            stakes: 1,
            scope: {},
            status: 'BROKEN',
            visibility: 'PAIR_ONLY',
          })
        }
      }
      const proposal = manageAlliance(
        state,
        { type: 'PROPOSE', kind: 'PACT', actorId: 'u', candidateId: 'k' },
        { ...context, seed: 6, humanActorIds: ['u'] }
      )
      return state.allianceManagement.requests[proposal.requestId!]
    }

    const trustedHistory = makeScenario(false)
    const damagedHistory = makeScenario(true)

    expect(trustedHistory.status).toBe('ACCEPTED')
    expect(damagedHistory.status).toBe('DECLINED')
    expect(damagedHistory.reason).toContain('broken deals I knew about')
    expect(damagedHistory.responsesByActorId?.k?.style).toBe('DECLINED')
  })
  it('does not reset duplicate deadlines and cannot revive an expired response', () => {
    const state = setup()
    group(state)
    const id = request(state)
    const deadline = state.allianceManagement.requests[id].deadline
    expect(request(state)).toBe(id)
    expect(state.allianceManagement.requests[id].deadline).toEqual(deadline)
    advanceAllianceRequests(state, { ...context, at: { day: 2, phase: 'social_2' } })
    state.events = []
    respond(state, id, 'x')
    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(state.alliances.group.memberIds).not.toContain('x')
  })
  it('retains interaction receipts after ending a pact and trimming events', () => {
    const state = setup()
    const input = { actorId: 'u', targetId: 'k', at: context.at, interactionId: 'accepted' }
    const first = finalizeAcceptedPersonalPact(state, input)
    manageAlliance(state, { type: 'LEAVE', actorId: 'u', allianceId: first.allianceId! }, context)
    state.events = []
    expect(finalizeAcceptedPersonalPact(state, input).status).toBe('NO_OP')
    expect(currentAllianceCounts(state, 'u').pacts).toBe(0)
  })
  it('uses one phase order for promise and incoming deadlines', () => {
    const earlier = { day: 1, phase: 'pos_results' }
    const later = { day: 1, phase: 'social_2' }
    expect(compareRealityClock(earlier, later)).toBeLessThan(0)
    expect(compareRealityClock(earlier, later)).toBe(compareIncomingClock(earlier, later))
  })
  it('keeps the pre-existing alliance when a departure makes another roster identical', () => {
    const state = setup()
    const original = group(state, ['u', 'k', 'r'], 'original')
    const expanded = group(state, ['u', 'k', 'r', 'x'], 'expanded')
    original.name = 'The Core'
    expanded.name = 'The Expanded Core'

    removeRealityAllianceMember(state, {
      allianceId: expanded.id,
      memberId: 'x',
      actorId: 'x',
      kind: 'VOLUNTARY',
      at: { day: 2, phase: 'social_1' },
    })

    expect(original.status).toBe('PROBATIONARY')
    expect(original.memberIds).toEqual(['u', 'k', 'r'])
    expect(expanded.status).toBe('DISSOLVED')
    expect(expanded.memberIds).toEqual([])
    expect(expanded.supersededById).toBe(original.id)
    const ended = state.events.find(
      (event) => event.type === 'ALLIANCE_ENDED' && event.allianceId === expanded.id
    )
    expect(ended?.allianceSnapshot?.endReason).toBe('DUPLICATE_ROSTER')
    expect(
      allianceEventText(
        state,
        ended!,
        'u',
        (id) => ({ u: 'You', k: 'Kian', r: 'Jax', x: 'Lux' })[id] ?? id
      )
    ).toBe('The Expanded Core closed because its roster matched The Core; The Core remains active.')
  })
})

describe('alliance save migration', () => {
  it('collapses legacy duplicate group rosters deterministically and idempotently', () => {
    const state = setup()
    const original = group(state, ['u', 'k', 'r'], 'original')
    const duplicate = group(state, ['u', 'k', 'r'], 'duplicate')
    original.createdAt = { day: 1, phase: 'social_1' }
    duplicate.createdAt = { day: 2, phase: 'social_1' }

    const normalized = normalizeRealityDomainState(state)

    expect(normalized.alliances.original.status).toBe('PROBATIONARY')
    expect(normalized.alliances.duplicate.status).toBe('DISSOLVED')
    expect(normalized.alliances.duplicate.supersededById).toBe('original')
    expect(normalizeRealityDomainState(normalized)).toEqual(normalized)
  })
  it('upgrades a detached old save idempotently while retaining scoped promises and ambiguous pair sources', () => {
    const state = setup()
    const original = pact(state)
    const raw = JSON.parse(JSON.stringify(state))
    raw.version = 1
    delete raw.allianceManagement
    delete raw.alliances[original.id].kind
    raw.alliances.duplicate = { ...raw.alliances[original.id], id: 'duplicate' }
    raw.promises.old = {
      id: 'old',
      kind: 'Final Two',
      promisorId: 'u',
      beneficiaryIds: ['k'],
      witnessIds: [],
      createdAt: context.at,
      stakes: 1,
      scope: { allianceId: 'duplicate' },
      status: 'ACTIVE',
    }
    const before = JSON.stringify(raw)
    const upgraded = normalizeRealityDomainState(raw)
    expect(JSON.stringify(raw)).toBe(before)
    expect(currentAllianceCounts(upgraded, 'u').pacts).toBe(1)
    expect(
      Object.values(upgraded.alliances).find((entry) => entry.provenance === 'UNRESOLVED')
        ?.sourceEpisodeIds
    ).toEqual(['duplicate', original.id].sort())
    expect(upgraded.promises.old.scope.allianceId).toBe('duplicate')
    expect(normalizeRealityDomainState(upgraded)).toEqual(upgraded)
  })
  it('does not reimport compatibility pair mirrors or resurrect an ended episode', () => {
    const state = setup()
    const personal = pact(state)
    group(state)
    const legacy = [
      {
        id: 'legacy-u-k',
        participantIds: ['u', 'k'],
        primaryForIds: [],
        loyaltyByPlayer: { u: 50, k: 50 },
        status: 'active',
        secrecy: 'secret',
        discoveredByIds: [],
        falsePretenceByIds: [],
        lastUpdatedWeek: 1,
      },
    ] as unknown as DramaAlliance[]
    migrateDramaAlliances(state, legacy)
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 1, pacts: 1 })
    manageAlliance(state, { type: 'LEAVE', actorId: 'u', allianceId: personal.id }, context)
    migrateDramaAlliances(state, legacy)
    expect(currentAllianceCounts(state, 'u').pacts).toBe(0)
    expect(state.alliances['legacy-u-k']).toBeUndefined()
  })
  it('imports old normal-mode tags as individual unresolved pair records without combining their partners', () => {
    const relationships = {
      u: { k: { affinity: 20, tags: ['alliance'] }, r: { affinity: 20, tags: ['alliance'] } },
      k: { u: { affinity: 20, tags: ['alliance'] } },
      r: { u: { affinity: 20, tags: ['alliance'] } },
    }
    const state = normalizeRealityDomainState(undefined, relationships)
    expect(currentAllianceCounts(state, 'u')).toEqual({ groups: 0, pacts: 2 })
    expect(Object.values(state.alliances).every((entry) => entry.provenance === 'UNRESOLVED')).toBe(
      true
    )
  })
  it('refuses future save versions without changing their recoverable contents', () => {
    const state = { ...setup(), version: 3 }
    const before = JSON.stringify(state)
    expect(() => normalizeRealityDomainState(state)).toThrow('Unsupported Reality save version')
    expect(JSON.stringify(state)).toBe(before)
  })
})
