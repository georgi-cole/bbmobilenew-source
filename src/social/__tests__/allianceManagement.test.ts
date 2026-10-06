import { describe, expect, it } from 'vitest'
import {
  advanceAllianceRequests,
  finalizeAcceptedPersonalPact,
  manageAlliance,
  type AllianceManagementContext,
} from '../reality/allianceManagement'
import { currentAllianceCounts, isCurrentAlliance } from '../reality/allianceIdentity'
import {
  createInitialRealityDomainState,
  ensureRealityActors,
  normalizeRealityDomainState,
} from '../reality/state'
import {
  createRealityAlliance,
  migrateDramaAlliances,
  reconcileRealityBattleBackReturn,
  refreshRealityAllianceDynamics,
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
  it('requires a strict majority, officer approval, and separate candidate consent', () => {
    const state = setup()
    const alliance = group(state)
    const id = request(state, 'x', 'group', 'k')
    respond(state, id, 'r')
    expect(state.allianceManagement.requests[id].status).toBe('VOTING')
    respond(state, id, 'u', false)
    expect(state.allianceManagement.requests[id].status).toBe('DECLINED')
    expect(alliance.memberIds).not.toContain('x')
    const next = manageAlliance(
      state,
      { type: 'PROPOSE', kind: 'ADMIT', actorId: 'u', candidateId: 'c', allianceId: alliance.id },
      context
    ).requestId!
    approve(state, next)
    expect(state.allianceManagement.requests[next].status).toBe('CONSENT')
    expect(alliance.memberIds).not.toContain('c')
    expect(state.allianceManagement.requests[next].deadline).toEqual({ day: 1, phase: 'social_2' })
    respond(state, next, 'c')
    expect(alliance.memberIds).toContain('c')
  })
  it('lets a co-leader provide the officer yes when the leader votes no', () => {
    const state = setup()
    group(state, undefined, undefined, 'u', 'k')
    const id = request(state, 'x', 'group', 'k')
    respond(state, id, 'u', false)
    respond(state, id, 'k')
    respond(state, id, 'r')
    expect(state.allianceManagement.requests[id].status).toBe('CONSENT')
    respond(state, id, 'x')
    expect(state.alliances.group.memberIds).toContain('x')
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
  it('rechecks capacity when two invitations compete for a candidate’s final group slot', () => {
    const state = setup()
    group(state)
    group(state, ['k', 'c', 'd'], 'second', 'k')
    group(state, ['x', 'e', 'f'], 'existing', 'x')
    const first = request(state)
    const second = request(state, 'x', 'second', 'k')
    approve(state, first)
    approve(state, second)
    respond(state, first, 'x')
    respond(state, second, 'x')
    expect(state.allianceManagement.requests[first].status).toBe('ACCEPTED')
    expect(state.allianceManagement.requests[second].status).toBe('INVALIDATED')
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
})

describe('alliance save migration', () => {
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
