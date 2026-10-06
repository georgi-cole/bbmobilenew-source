import {
  ALLIANCE_LIMITS,
  allianceKind,
  currentAllianceCounts,
  getCurrentPact,
  isCurrentAlliance,
  normalizeAllianceManagement,
  rememberAllianceRoster,
  synchronizeAllianceOfficers,
} from './allianceIdentity'
import { compareSocialClock, nextAllianceDeadline } from './clock'
import { appendRealityEvent } from './events'
import {
  createRealityAlliance,
  refreshRealityAllianceOverlaps,
  removeRealityAllianceMember,
} from './relationshipForms'
import type {
  RealityAlliance,
  RealityAllianceRequest,
  RealityAllianceRequestKind,
  RealityClock,
  RealityDomainState,
} from './types'

export interface AllianceManagementContext {
  at: RealityClock
  activeActorIds: readonly string[]
  humanActorIds: readonly string[]
  seed: number
  disabled?: boolean
  terminal?: boolean
}

export type AllianceManagementCommand =
  | {
      type: 'PROPOSE'
      kind: RealityAllianceRequestKind
      actorId: string
      candidateId?: string
      allianceId?: string
      memberIds?: string[]
      basePactId?: string
      name?: string
      leaderId?: string
      coLeaderId?: string
      purpose?: string
      commandId?: string
    }
  | { type: 'RESPOND'; requestId: string; actorId: string; accept: boolean; commandId?: string }
  | { type: 'WITHDRAW'; requestId: string; actorId: string; commandId?: string }
  | {
      type: 'LEAVE' | 'REMOVE' | 'DISSOLVE' | 'CLEAR_COLEADER'
      allianceId: string
      actorId: string
      targetId?: string
      commandId?: string
    }

export interface AllianceManagementResult {
  status: 'APPLIED' | 'NO_OP' | 'REJECTED'
  reason: string
  allianceId?: string
  requestId?: string
}

export function isPendingAllianceRequest(request: RealityAllianceRequest): boolean {
  return request.status === 'VOTING' || request.status === 'CONSENT'
}

const reject = (reason: string): AllianceManagementResult => ({ status: 'REJECTED', reason })

function event(
  state: RealityDomainState,
  alliance: RealityAlliance,
  actorId: string,
  type: string,
  at: RealityClock,
  targetIds: string[] = []
) {
  return appendRealityEvent(state, {
    ...at,
    type,
    actorId,
    targetIds,
    participantIds: [...alliance.memberIds],
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: 'SUCCESS',
    reason: `management:${alliance.id}`,
    tags: ['ALLIANCE', 'MANAGEMENT'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: true,
  })
}

function endAlliance(
  state: RealityDomainState,
  alliance: RealityAlliance,
  actorId: string,
  at: RealityClock,
  reason: string
): void {
  rememberAllianceRoster(alliance)
  event(state, alliance, actorId, 'ALLIANCE_ENDED', at)
  alliance.status = 'DISSOLVED'
  alliance.endedAt = { ...at }
  alliance.endReason = reason
  alliance.memberIds = []
  alliance.currentTargetIds = []
  alliance.fallbackTargetIds = []
  alliance.rosterRevision = (alliance.rosterRevision ?? 0) + 1
  synchronizeAllianceOfficers(alliance)
}

function capacityProblem(
  state: RealityDomainState,
  memberIds: string[],
  kind: 'PACT' | 'GROUP',
  basePactId?: string
): string | undefined {
  if (kind === 'GROUP' && memberIds.length > ALLIANCE_LIMITS.groupMembers)
    return 'A group can have at most six members.'
  for (const actorId of memberIds) {
    const counts = currentAllianceCounts(state, actorId)
    if (kind === 'GROUP' && counts.groups >= ALLIANCE_LIMITS.groupsPerMember)
      return 'A founder or candidate already belongs to two groups.'
    const replacesPact = basePactId && state.alliances[basePactId]?.memberIds.includes(actorId)
    if (kind === 'PACT' && !replacesPact && counts.pacts >= ALLIANCE_LIMITS.pactsPerMember)
      return 'A participant already has three personal pacts.'
  }
  return undefined
}

function requestProblem(
  state: RealityDomainState,
  request: RealityAllianceRequest,
  context: AllianceManagementContext
): string | undefined {
  if (context.disabled || context.terminal)
    return 'Alliance decisions are closed in this game window.'
  if (
    [
      request.proposerId,
      ...request.memberIds,
      ...request.electorateIds,
      ...(request.candidateId ? [request.candidateId] : []),
    ].some((id) => !context.activeActorIds.includes(id))
  )
    return 'A participant is no longer in the house.'
  if (request.allianceId) {
    const alliance = state.alliances[request.allianceId]
    if (!alliance || !isCurrentAlliance(alliance)) return 'This alliance has ended.'
    if (
      alliance.rosterRevision !== request.rosterRevision ||
      alliance.governanceRevision !== request.governanceRevision
    )
      return 'The roster or officers changed. A new request needs fresh consent.'
  }
  if (request.basePactId && !isCurrentAlliance(state.alliances[request.basePactId]))
    return 'The selected pact has ended.'
  return undefined
}

function settle(
  request: RealityAllianceRequest,
  status: RealityAllianceRequest['status'],
  reason: string,
  at: RealityClock
): void {
  request.status = status
  request.reason = reason
  request.settledAt = { ...at }
}

function finalize(
  state: RealityDomainState,
  request: RealityAllianceRequest,
  context: AllianceManagementContext
): void {
  const problem = requestProblem(state, request, context)
  if (problem) {
    settle(request, 'INVALIDATED', problem, context.at)
    return
  }
  const alliance = request.allianceId ? state.alliances[request.allianceId] : undefined
  if (request.kind === 'PACT' || request.kind === 'FOUND') {
    const kind = request.kind === 'PACT' ? 'PACT' : 'GROUP'
    const capacity = capacityProblem(
      state,
      request.memberIds,
      kind,
      request.kind === 'PACT' ? request.basePactId : undefined
    )
    if (capacity) {
      settle(request, 'INVALIDATED', capacity, context.at)
      return
    }
    if (kind === 'PACT') {
      const existing = getCurrentPact(state, request.memberIds[0], request.memberIds[1])
      if (existing && existing.id !== request.basePactId) {
        settle(request, 'INVALIDATED', 'This personal pact already exists.', context.at)
        return
      }
    } else if (
      Object.values(state.alliances).some(
        (entry) =>
          isCurrentAlliance(entry) &&
          allianceKind(entry) === 'GROUP' &&
          [...entry.memberIds].sort().join('~') === [...request.memberIds].sort().join('~')
      )
    ) {
      settle(request, 'INVALIDATED', 'A group with this exact roster already exists.', context.at)
      return
    }
    const created = createRealityAlliance(state, {
      id: `alliance:${request.id}`,
      kind,
      founderIds: [...request.memberIds],
      memberIds: [],
      purpose: request.purpose,
      at: context.at,
      name: request.name,
      leaderId: request.leaderId,
      coLeaderId: request.coLeaderId,
      replacesPactId: kind === 'PACT' ? request.basePactId : undefined,
    })
    request.resultAllianceId = created.id
    if (request.basePactId) {
      const base = state.alliances[request.basePactId]
      created.predecessorIds = [base.id]
      if (
        kind === 'PACT' ||
        !/final\s*(two|2)|endgame|ride.?or.?die|last\s*two/i.test(base.purpose)
      ) {
        endAlliance(
          state,
          base,
          request.proposerId,
          context.at,
          kind === 'PACT' ? 'RECONCILED' : 'SUPERSEDED'
        )
        base.supersededById = created.id
      }
    }
  } else if (alliance && request.kind === 'ADMIT' && request.candidateId) {
    const counts = currentAllianceCounts(state, request.candidateId)
    if (
      counts.groups >= ALLIANCE_LIMITS.groupsPerMember ||
      alliance.memberIds.length >= ALLIANCE_LIMITS.groupMembers
    ) {
      settle(
        request,
        'INVALIDATED',
        'The candidate or group has no remaining group slot.',
        context.at
      )
      return
    }
    const candidateId = request.candidateId
    alliance.memberIds.push(candidateId)
    alliance.memberJoinSequence ??= {}
    alliance.memberJoinSequence[candidateId] = state.nextSequence++
    alliance.memberCommitment[candidateId] = 0.5
    alliance.memberPerceivedStatus[candidateId] = 'REGULAR'
    alliance.memberPlanBeliefs[candidateId] = []
    alliance.operationalRoles[candidateId] = []
    alliance.rosterRevision = (alliance.rosterRevision ?? 0) + 1
    rememberAllianceRoster(alliance)
    event(state, alliance, request.proposerId, 'ALLIANCE_MEMBER_RECRUITED', context.at, [
      candidateId,
    ])
    request.resultAllianceId = alliance.id
  } else if (
    alliance &&
    (request.kind === 'APPOINT' || request.kind === 'TRANSFER') &&
    request.candidateId
  ) {
    if (
      alliance.leaderId !== request.proposerId ||
      !alliance.memberIds.includes(request.candidateId)
    ) {
      settle(request, 'INVALIDATED', 'The appointment is no longer authorized.', context.at)
      return
    }
    if (request.kind === 'TRANSFER') {
      alliance.leaderId = request.candidateId
      alliance.coLeaderId = undefined
    } else alliance.coLeaderId = request.candidateId
    alliance.governanceRevision = (alliance.governanceRevision ?? 0) + 1
    synchronizeAllianceOfficers(alliance)
    rememberAllianceRoster(alliance)
    event(state, alliance, request.proposerId, 'ALLIANCE_OFFICERS_CHANGED', context.at, [
      request.candidateId,
    ])
    request.resultAllianceId = alliance.id
  } else if (alliance && request.kind === 'REMOVE_SUGGESTION' && request.candidateId) {
    const officerId = request.officerIds.find(
      (id) => request.consents[id] === true && id !== request.candidateId
    )
    if (
      !officerId ||
      (request.candidateId === alliance.coLeaderId && officerId !== alliance.leaderId)
    ) {
      settle(request, 'INVALIDATED', 'An authorized officer must approve this removal.', context.at)
      return
    }
    removeRealityAllianceMember(state, {
      allianceId: alliance.id,
      memberId: request.candidateId,
      actorId: officerId,
      kind: 'EXPELLED',
      at: context.at,
    })
    request.resultAllianceId = alliance.id
  }
  settle(request, 'ACCEPTED', 'The agreed change is now active.', context.at)
  refreshRealityAllianceOverlaps(state)
}

function aiConsent(
  state: RealityDomainState,
  request: RealityAllianceRequest,
  actorId: string,
  seed: number
): boolean {
  let hash = seed >>> 0
  for (const character of `${request.id}:${actorId}:${request.status}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  const otherIds =
    request.kind === 'ADMIT' && request.status === 'VOTING'
      ? [request.candidateId!]
      : request.memberIds.filter((id) => id !== actorId)
  const trust =
    otherIds.reduce((sum, id) => sum + (state.relationships[actorId]?.[id]?.trust ?? 0), 0) /
    Math.max(1, otherIds.length)
  if (request.kind === 'REMOVE_SUGGESTION')
    return (state.relationships[actorId]?.[request.candidateId!]?.trust ?? 0) < -10
  return hash / 0x1_0000_0000 < Math.max(0.12, Math.min(0.92, 0.62 + trust / 200))
}

export function canSeeAllianceRequest(request: RealityAllianceRequest, actorId: string): boolean {
  return (
    request.memberIds.includes(actorId) ||
    request.proposerId === actorId ||
    Boolean(request.candidateInvitedAt && request.candidateId === actorId)
  )
}

export function allianceRequestDecisionActors(request: RealityAllianceRequest): string[] {
  if (request.status === 'VOTING')
    return request.electorateIds.filter((id) => request.votes[id] === undefined)
  if (request.status !== 'CONSENT') return []
  const actors =
    request.kind === 'PACT' || request.kind === 'FOUND'
      ? request.memberIds
      : request.kind === 'REMOVE_SUGGESTION'
        ? request.officerIds.filter((id) => id !== request.candidateId)
        : request.candidateId
          ? [request.candidateId]
          : []
  return actors.filter((id) => request.consents[id] === undefined)
}

export function advanceAllianceRequests(
  state: RealityDomainState,
  context: AllianceManagementContext
): void {
  normalizeAllianceManagement(state)
  for (const request of Object.values(state.allianceManagement.requests)) {
    if (!isPendingAllianceRequest(request)) continue
    const problem = requestProblem(state, request, context)
    if (problem) {
      settle(request, 'INVALIDATED', problem, context.at)
      continue
    }
    for (const actorId of allianceRequestDecisionActors(request)) {
      if (context.humanActorIds.includes(actorId)) continue
      const consent = aiConsent(state, request, actorId, context.seed)
      if (request.status === 'VOTING') request.votes[actorId] = consent
      else request.consents[actorId] = consent
    }
    const overdue = compareSocialClock(request.deadline, context.at) < 0
    if (request.status === 'VOTING') {
      if (!overdue && allianceRequestDecisionActors(request).length > 0) continue
      const yes = request.electorateIds.filter((id) => request.votes[id] === true).length
      if (
        yes <= request.electorateIds.length / 2 ||
        !request.officerIds.some((id) => request.votes[id] === true)
      ) {
        settle(
          request,
          'DECLINED',
          'Admission needs a strict member majority and an officer voting yes.',
          context.at
        )
        continue
      }
      request.status = 'CONSENT'
      request.candidateInvitedAt = { ...context.at }
      request.deadline = nextAllianceDeadline(context.at)
      const alliance = state.alliances[request.allianceId!]
      alliance.rosterKnowledgeByActor ??= {}
      alliance.rosterKnowledgeByActor[request.candidateId!] = {
        memberIds: [...alliance.memberIds],
        rosterRevision: alliance.rosterRevision ?? 0,
        name: alliance.name,
        leaderId: alliance.leaderId,
        coLeaderId: alliance.coLeaderId,
      }
      // Candidate consent is a separate stage with its own complete window.
      if (!context.humanActorIds.includes(request.candidateId!))
        request.consents[request.candidateId!] = aiConsent(
          state,
          request,
          request.candidateId!,
          context.seed
        )
    }
    if (request.status === 'CONSENT') {
      const answers = Object.values(request.consents)
      if (request.kind === 'REMOVE_SUGGESTION' && answers.includes(true)) {
        finalize(state, request, context)
        continue
      }
      if (request.kind !== 'REMOVE_SUGGESTION' && answers.includes(false)) {
        settle(request, 'DECLINED', 'The proposed terms were declined.', context.at)
        continue
      }
      if (allianceRequestDecisionActors(request).length === 0) {
        if (request.kind === 'REMOVE_SUGGESTION')
          settle(request, 'DECLINED', 'The officers declined the suggestion.', context.at)
        else finalize(state, request, context)
      } else if (compareSocialClock(request.deadline, context.at) < 0)
        settle(
          request,
          'EXPIRED',
          'The response window ended without complete consent.',
          context.at
        )
    }
  }
}

function propose(
  state: RealityDomainState,
  command: Extract<AllianceManagementCommand, { type: 'PROPOSE' }>,
  context: AllianceManagementContext,
  advance = true
): AllianceManagementResult {
  const alliance = command.allianceId ? state.alliances[command.allianceId] : undefined
  if (
    command.allianceId &&
    (!alliance || !isCurrentAlliance(alliance) || !alliance.memberIds.includes(command.actorId))
  )
    return reject('Choose a current alliance you belong to.')
  const members = [
    ...new Set(
      command.kind === 'PACT'
        ? [command.actorId, command.candidateId ?? '']
        : command.kind === 'FOUND'
          ? [command.actorId, ...(command.memberIds ?? [])]
          : (alliance?.memberIds ?? [])
    ),
  ]
  if (
    members.some((id) => !id || !context.activeActorIds.includes(id)) ||
    (command.candidateId && !context.activeActorIds.includes(command.candidateId))
  )
    return reject('Every participant must still be in the house.')
  if (command.kind === 'PACT') {
    if (members.length !== 2) return reject('A personal pact needs two different people.')
    const pact = getCurrentPact(state, members[0], members[1])
    if (pact && !(pact.provenance === 'UNRESOLVED' && command.basePactId === pact.id))
      return { status: 'NO_OP', reason: 'You already share a personal pact.', allianceId: pact.id }
  }
  if (command.kind === 'FOUND') {
    const pendingFounding = Object.values(state.allianceManagement.requests).find(
      (entry) =>
        entry.kind === 'FOUND' &&
        entry.proposerId === command.actorId &&
        isPendingAllianceRequest(entry)
    )
    if (pendingFounding)
      return {
        status: 'NO_OP',
        reason: 'Your founding draft is already waiting for consent.',
        requestId: pendingFounding.id,
      }
  }
  if (command.kind === 'FOUND' && members.length < 3)
    return reject('Founding a group needs at least three people.')
  if (
    command.kind === 'FOUND' &&
    Object.values(state.alliances).some(
      (entry) =>
        isCurrentAlliance(entry) &&
        allianceKind(entry) === 'GROUP' &&
        [...entry.memberIds].sort().join('~') === [...members].sort().join('~')
    )
  )
    return { status: 'NO_OP', reason: 'A group with this exact roster already exists.' }
  if (command.basePactId) {
    const base = state.alliances[command.basePactId]
    if (
      !base ||
      !isCurrentAlliance(base) ||
      allianceKind(base) !== 'PACT' ||
      !base.memberIds.every((id) => members.includes(id))
    )
      return reject('The selected pact must belong to the agreed founding roster.')
    if (command.kind === 'FOUND' && base.provenance === 'UNRESOLVED')
      return reject('End or mutually renew the unresolved personal pact before converting it.')
  }
  if (command.kind === 'PACT' || command.kind === 'FOUND') {
    const capacity = capacityProblem(
      state,
      members,
      command.kind === 'PACT' ? 'PACT' : 'GROUP',
      command.kind === 'PACT' ? command.basePactId : undefined
    )
    if (capacity) return reject(capacity)
  } else if (!alliance || allianceKind(alliance) !== 'GROUP')
    return reject('This decision requires a group alliance.')
  if (command.kind === 'ADMIT') {
    const pendingAdmission = Object.values(state.allianceManagement.requests).find(
      (entry) =>
        entry.kind === 'ADMIT' &&
        entry.allianceId === command.allianceId &&
        isPendingAllianceRequest(entry)
    )
    if (pendingAdmission)
      return {
        status: 'NO_OP',
        reason: 'This group already has an admission decision pending.',
        requestId: pendingAdmission.id,
      }
    if (!command.candidateId || members.includes(command.candidateId))
      return reject('Choose someone outside this group.')
    if (
      members.length >= ALLIANCE_LIMITS.groupMembers ||
      currentAllianceCounts(state, command.candidateId).groups >= ALLIANCE_LIMITS.groupsPerMember
    )
      return reject('The candidate or group has no remaining group slot.')
  }
  if (command.kind === 'APPOINT' || command.kind === 'TRANSFER') {
    if (alliance?.leaderId !== command.actorId)
      return reject('Only the leader may offer an officer role.')
    if (
      !command.candidateId ||
      !members.includes(command.candidateId) ||
      command.candidateId === command.actorId
    )
      return reject('Choose another current group member.')
    if (
      Object.values(state.allianceManagement.requests).some(
        (request) =>
          isPendingAllianceRequest(request) &&
          request.allianceId === command.allianceId &&
          ['APPOINT', 'TRANSFER'].includes(request.kind)
      )
    )
      return reject('An officer offer is already awaiting a response.')
  }
  if (
    command.kind === 'REMOVE_SUGGESTION' &&
    (!command.candidateId ||
      !members.includes(command.candidateId) ||
      command.candidateId === command.actorId ||
      command.candidateId === alliance?.leaderId)
  )
    return reject('Choose another removable group member.')
  const matching = Object.values(state.allianceManagement.requests).find(
    (request) =>
      request.kind === command.kind &&
      request.allianceId === command.allianceId &&
      (command.kind === 'PACT'
        ? [...request.memberIds].sort().join('~') === [...members].sort().join('~')
        : request.candidateId === command.candidateId) &&
      (command.kind !== 'FOUND' ||
        [...request.memberIds].sort().join('~') === [...members].sort().join('~')) &&
      (command.kind !== 'REMOVE_SUGGESTION' || request.proposerId === command.actorId) &&
      (isPendingAllianceRequest(request) ||
        (['DECLINED', 'EXPIRED'].includes(request.status) &&
          request.settledAt?.day === context.at.day))
  )
  if (matching)
    return {
      status: 'NO_OP',
      reason: isPendingAllianceRequest(matching)
        ? 'This request is already pending; its deadline is unchanged.'
        : 'Give this decision until the next game day before asking again.',
      requestId: matching.id,
    }
  const leaderId =
    command.kind === 'FOUND' ? (command.leaderId ?? command.actorId) : alliance?.leaderId
  if (
    command.kind === 'FOUND' &&
    (!members.includes(leaderId!) ||
      (command.coLeaderId &&
        (!members.includes(command.coLeaderId) || command.coLeaderId === leaderId)))
  )
    return reject('The proposed officers must be different founding members.')
  const id = `request:${state.allianceManagement.nextRequestSequence++}`
  const request: RealityAllianceRequest = {
    id,
    kind: command.kind,
    status: command.kind === 'ADMIT' ? 'VOTING' : 'CONSENT',
    proposerId: command.actorId,
    allianceId: command.allianceId,
    candidateId: command.candidateId,
    memberIds: members,
    electorateIds: command.kind === 'ADMIT' ? [...members] : [],
    officerIds: alliance ? [...alliance.leaderIds] : [],
    votes: command.kind === 'ADMIT' ? { [command.actorId]: true } : {},
    consents:
      command.kind === 'PACT' || command.kind === 'FOUND' ? { [command.actorId]: true } : {},
    rosterRevision: alliance?.rosterRevision,
    governanceRevision: alliance?.governanceRevision,
    leaderId,
    coLeaderId: command.coLeaderId ?? alliance?.coLeaderId,
    basePactId: command.basePactId,
    name: alliance?.name ?? command.name?.trim().replace(/\s+/g, ' ').slice(0, 28),
    purpose: command.purpose?.trim() || 'Mutual protection',
    createdAt: { ...context.at },
    deadline: nextAllianceDeadline(context.at),
  }
  state.allianceManagement.requests[id] = request
  if (advance) advanceAllianceRequests(state, context)
  return {
    status: 'APPLIED',
    reason: request.reason ?? 'The request is waiting for the required decisions.',
    requestId: id,
    allianceId: request.resultAllianceId,
  }
}

export function manageAlliance(
  state: RealityDomainState,
  command: AllianceManagementCommand,
  context: AllianceManagementContext
): AllianceManagementResult {
  normalizeAllianceManagement(state)
  const receipt = command.commandId && state.allianceManagement.processedCommands[command.commandId]
  if (receipt)
    return { ...receipt, status: 'NO_OP', reason: 'This command has already been processed.' }
  advanceAllianceRequests(state, context)
  let result: AllianceManagementResult
  if (context.disabled || context.terminal || !context.activeActorIds.includes(command.actorId))
    result = reject('Alliance management is unavailable for this contestant or game window.')
  else if (command.type === 'PROPOSE') result = propose(state, command, context)
  else if (command.type === 'RESPOND' || command.type === 'WITHDRAW') {
    const request = state.allianceManagement.requests[command.requestId]
    if (!request || !isPendingAllianceRequest(request))
      result = {
        status: 'NO_OP',
        reason: request?.reason ?? 'This request is no longer pending.',
        requestId: command.requestId,
      }
    else if (command.type === 'WITHDRAW') {
      if (request.proposerId !== command.actorId)
        result = reject('Only the proposer may withdraw this request.')
      else {
        settle(request, 'WITHDRAWN', 'The proposer withdrew this request.', context.at)
        result = { status: 'APPLIED', reason: request.reason!, requestId: request.id }
      }
    } else if (!allianceRequestDecisionActors(request).includes(command.actorId))
      result = reject('You have already answered or are not a decision maker for this request.')
    else {
      if (request.status === 'VOTING') request.votes[command.actorId] = command.accept
      else request.consents[command.actorId] = command.accept
      advanceAllianceRequests(state, context)
      result = {
        status: 'APPLIED',
        reason: request.reason ?? 'Your decision was recorded.',
        requestId: request.id,
        allianceId: request.resultAllianceId,
      }
    }
  } else {
    const alliance = state.alliances[command.allianceId]
    if (!alliance || !isCurrentAlliance(alliance) || !alliance.memberIds.includes(command.actorId))
      result = {
        status: 'NO_OP',
        reason: 'You no longer belong to this commitment.',
        allianceId: command.allianceId,
      }
    else if (command.type === 'LEAVE') {
      if (allianceKind(alliance) === 'PACT')
        endAlliance(state, alliance, command.actorId, context.at, 'ENDED_BY_PARTNER')
      else
        removeRealityAllianceMember(state, {
          allianceId: alliance.id,
          memberId: command.actorId,
          actorId: command.actorId,
          kind: 'VOLUNTARY',
          at: context.at,
        })
      result = {
        status: 'APPLIED',
        reason: 'You left this commitment. Other independent agreements remain.',
        allianceId: alliance.id,
      }
    } else if (command.type === 'DISSOLVE') {
      if (allianceKind(alliance) !== 'GROUP' || alliance.leaderId !== command.actorId)
        result = reject('Only the group leader may dissolve the group.')
      else {
        endAlliance(state, alliance, command.actorId, context.at, 'DISSOLVED_BY_LEADER')
        result = {
          status: 'APPLIED',
          reason: 'The group has ended for every member.',
          allianceId: alliance.id,
        }
      }
    } else if (command.type === 'CLEAR_COLEADER') {
      if (alliance.leaderId !== command.actorId)
        result = reject('Only the leader may clear the co-leader role.')
      else if (!alliance.coLeaderId)
        result = { status: 'NO_OP', reason: 'There is no co-leader to remove.' }
      else {
        alliance.coLeaderId = undefined
        alliance.governanceRevision = (alliance.governanceRevision ?? 0) + 1
        synchronizeAllianceOfficers(alliance)
        rememberAllianceRoster(alliance)
        event(state, alliance, command.actorId, 'ALLIANCE_OFFICERS_CHANGED', context.at)
        result = {
          status: 'APPLIED',
          reason: 'The co-leader is now a regular member.',
          allianceId: alliance.id,
        }
      }
    } else if (
      !command.targetId ||
      !alliance.memberIds.includes(command.targetId) ||
      command.targetId === command.actorId ||
      command.targetId === alliance.leaderId ||
      !alliance.leaderIds.includes(command.actorId) ||
      (command.targetId === alliance.coLeaderId && command.actorId !== alliance.leaderId)
    )
      result = reject('Your role does not allow removing that member.')
    else {
      removeRealityAllianceMember(state, {
        allianceId: alliance.id,
        memberId: command.targetId,
        actorId: command.actorId,
        kind: 'EXPELLED',
        at: context.at,
      })
      result = {
        status: 'APPLIED',
        reason: 'The member was removed from this group.',
        allianceId: alliance.id,
      }
    }
  }
  advanceAllianceRequests(state, context)
  refreshRealityAllianceOverlaps(state)
  if (command.commandId)
    state.allianceManagement.processedCommands[command.commandId] = { ...result }
  return result
}

/** Called only after an interaction has recorded both participants' acceptance. */
export function finalizeAcceptedPersonalPact(
  state: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    at: RealityClock
    interactionId: string
    purpose?: string
  }
): AllianceManagementResult {
  const context: AllianceManagementContext = {
    at: input.at,
    activeActorIds: [input.actorId, input.targetId],
    humanActorIds: [input.actorId, input.targetId],
    seed: 0,
  }
  normalizeAllianceManagement(state)
  const receiptId = `accepted-pact:${input.interactionId}`
  const receipt = state.allianceManagement.processedCommands[receiptId]
  if (receipt)
    return {
      ...receipt,
      status: 'NO_OP',
      reason: 'This accepted interaction has already been processed.',
    }
  const existing = getCurrentPact(state, input.actorId, input.targetId)
  if (existing) {
    const result: AllianceManagementResult = {
      status: 'NO_OP',
      reason: 'The personal pact is already active.',
      allianceId: existing.id,
    }
    state.allianceManagement.processedCommands[receiptId] = result
    return result
  }
  const result = propose(
    state,
    {
      type: 'PROPOSE',
      kind: 'PACT',
      actorId: input.actorId,
      candidateId: input.targetId,
      purpose: input.purpose,
    },
    context,
    false
  )
  if (!result.requestId || result.status !== 'APPLIED') {
    state.allianceManagement.processedCommands[receiptId] = result
    return result
  }
  const request = state.allianceManagement.requests[result.requestId]
  request.consents = { [input.actorId]: true, [input.targetId]: true }
  finalize(state, request, context)
  const finalized =
    request.status === 'ACCEPTED'
      ? {
          status: 'APPLIED' as const,
          reason: request.reason!,
          allianceId: request.resultAllianceId,
          requestId: request.id,
        }
      : reject(request.reason ?? 'The pact could not be finalized.')
  state.allianceManagement.processedCommands[receiptId] = finalized
  return finalized
}
