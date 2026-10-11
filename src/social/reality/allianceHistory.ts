import type { RealityAlliance, RealityDomainState, RealitySocialEvent } from './types'

export function canReadAllianceEvent(event: RealitySocialEvent, actorId: string): boolean {
  return (
    event.participantIds.includes(actorId) ||
    event.witnessIds.includes(actorId) ||
    event.visibility === 'HOUSE_PUBLIC' ||
    event.visibility === 'CEREMONY_PUBLIC'
  )
}

/** Older saves encoded IDs in reasons. Match whole IDs, including IDs containing colons. */
export function allianceForEvent(
  state: RealityDomainState,
  event: RealitySocialEvent
): string | undefined {
  const explicit = event.allianceId ?? event.allianceSnapshot?.id
  if (explicit) return explicit
  const request = event.allianceRequestId
    ? state.allianceManagement.requests[event.allianceRequestId]
    : undefined
  if (request) return request.allianceId ?? request.resultAllianceId
  const matches = Object.values(state.alliances).filter((alliance) =>
    [
      'management',
      'renamed',
      'voluntary',
      'expelled',
      'defection',
      'evicted',
      'strategy_meeting',
      'vote_defiance',
      'nomination',
      'vote',
      'replacement',
      'secondary_to_stronger_pact',
    ].some(
      (prefix) =>
        event.reason === `${prefix}:${alliance.id}` ||
        event.reason.startsWith(`${prefix}:${alliance.id}:`)
    )
  )
  if (matches.length === 1) return matches[0].id
  if (event.type === 'ALLIANCE_FORMED') {
    const formed = Object.values(state.alliances).filter(
      (alliance) =>
        alliance.founderIds.length === event.participantIds.length &&
        alliance.founderIds.every((id) => event.participantIds.includes(id)) &&
        (alliance.createdAt?.day ?? alliance.lastMeeting?.day) === event.day &&
        (alliance.createdAt?.phase ?? alliance.lastMeeting?.phase) === event.phase
    )
    if (formed.length === 1) return formed[0].id
  }
  return undefined
}

export function allianceHistory(
  state: RealityDomainState,
  allianceId: string,
  actorId: string
): RealitySocialEvent[] {
  const records = [
    ...state.events,
    ...(state.alliances[allianceId]?.history ?? []),
    ...Object.values(state.allianceManagement.requests)
      .filter(
        (request) => request.allianceId === allianceId || request.resultAllianceId === allianceId
      )
      .flatMap((request) => request.history ?? []),
  ]
  return [
    ...new Map(
      records
        .filter(
          (event) =>
            allianceForEvent(state, event) === allianceId && canReadAllianceEvent(event, actorId)
        )
        .map((event) => [event.id, event])
    ).values(),
  ].sort((left, right) => right.sequence - left.sequence)
}

export function isFormerAllianceMember(alliance: RealityAlliance, actorId: string): boolean {
  return (
    alliance.memberIds.includes(actorId) ||
    alliance.founderIds.includes(actorId) ||
    Boolean(alliance.rosterKnowledgeByActor?.[actorId]?.memberIds.includes(actorId)) ||
    Boolean(alliance.history?.some((event) => event.allianceSnapshot?.memberIds.includes(actorId)))
  )
}

function names(ids: string[], name: (id: string) => string): string {
  const values = ids.map(name)
  if (values.length < 2) return values[0] ?? 'the group'
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
}

/** One sentence used by both Today and the permanent alliance read. Names are event snapshots. */
export function allianceEventText(
  state: RealityDomainState,
  event: RealitySocialEvent,
  humanId: string,
  playerName: (id: string) => string
): string {
  const id = allianceForEvent(state, event)
  const group = id ? state.alliances[id] : undefined
  const name =
    event.allianceSnapshot?.name ??
    group?.name ??
    (event.allianceRequestId
      ? state.allianceManagement.requests[event.allianceRequestId]?.name
      : undefined) ??
    'the alliance'
  const person = (actorId: string) => (actorId === humanId ? 'You' : playerName(actorId))
  const listedPerson = (actorId: string) => (actorId === humanId ? 'you' : playerName(actorId))
  const actor = event.actorId ? person(event.actorId) : 'The group'
  const target = event.targetIds[0] ? person(event.targetIds[0]) : 'A member'
  const request = event.allianceRequestSnapshot
  const candidate = request?.candidateId ? person(request.candidateId) : target
  const kind = event.allianceSnapshot?.kind ?? group?.kind
  switch (event.type) {
    case 'ALLIANCE_COMMITMENT_CHANGED':
      return `${actor} · ${event.allianceCommitmentSnapshot?.kind.toLowerCase().replaceAll('_', ' ') ?? 'commitment'} in ${name} · ${event.allianceCommitmentSnapshot?.status.toLowerCase() ?? 'updated'}.`
    case 'ALLIANCE_FORMED':
      return kind === 'PACT'
        ? `${actor} formed a personal pact with ${names(
            event.participantIds.filter((memberId) => memberId !== event.actorId),
            listedPerson
          )}.`
        : `${actor} founded ${name} with ${names(
            event.participantIds.filter((memberId) => memberId !== event.actorId),
            listedPerson
          )}.`
    case 'ALLIANCE_MEMBER_RECRUITED':
      return `${target} joined ${name}.`
    case 'ALLIANCE_MEMBER_LEFT':
      return `${target} left ${name}.`
    case 'ALLIANCE_MEMBER_DEFECTED':
      return `${target} defected from ${name}.`
    case 'ALLIANCE_MEMBER_EVICTED':
      return `${target} left ${name} after eviction.`
    case 'ALLIANCE_MEMBER_EXPELLED':
      return `${actor} removed ${target === 'You' ? 'you' : target} from ${name}.`
    case 'ALLIANCE_RENAMED':
      if (event.allianceSnapshot?.nameAction === 'NAMED') return `${actor} named ${name}.`
      return `${actor} renamed ${event.allianceSnapshot?.previousName ?? 'the alliance'} to ${name}.`
    case 'ALLIANCE_OFFICERS_CHANGED':
      if (event.targetIds.length && event.targetIds[0] === event.allianceSnapshot?.leaderId)
        return `${target} became leader of ${name}.`
      if (event.targetIds[0] === event.allianceSnapshot?.coLeaderId && event.targetIds.length)
        return `${target} became co-leader of ${name}.`
      if (!event.targetIds.length && event.allianceSnapshot && !event.allianceSnapshot.coLeaderId)
        return `${actor} cleared ${name}'s co-leader role.`
      return `${actor} changed ${name}'s leadership${event.targetIds.length ? `: ${target}` : ''}.`
    case 'ALLIANCE_ENDED':
    case 'ALLIANCE_DISSOLVED': {
      const reason = event.allianceSnapshot?.endReason ?? group?.endReason
      if (reason === 'DISSOLVED_BY_LEADER') return `${actor} dissolved ${name}.`
      if (reason === 'ENDED_BY_PARTNER')
        return `${actor} ended the pact with ${names(
          event.participantIds.filter((memberId) => memberId !== event.actorId),
          listedPerson
        )}.`
      if (reason === 'TOO_FEW_MEMBERS')
        return `${name} dissolved after ${target === 'You' ? 'you' : target} ${event.allianceSnapshot?.exitKind === 'EXPELLED' ? 'was removed' : event.allianceSnapshot?.exitKind === 'EVICTED' ? 'left the game' : 'left'}; too few members remained.`
      return `${name} ended${reason === 'SUPERSEDED' ? ' when it was replaced' : reason === 'RECONCILED' ? ' when the pact was renewed' : ''}.`
    }
    case 'ALLIANCE_REQUEST_SUBMITTED':
      if (request?.kind === 'ADMIT')
        return `${actor} asked ${name} to vote on admitting ${candidate === 'You' ? 'you' : candidate}.`
      if (request?.kind === 'RENAME_SUGGESTION')
        return `${actor} suggested renaming ${name} to ${request.proposedName}.`
      if (request?.kind === 'FOUND') return `${actor} proposed founding ${name}.`
      if (request?.kind === 'APPOINT' || request?.kind === 'TRANSFER')
        return `${actor} offered ${candidate === 'You' ? 'you' : candidate} ${request.kind === 'APPOINT' ? 'co-leadership' : 'leadership'} of ${name}.`
      if (request?.kind === 'REMOVE_SUGGESTION')
        return `${actor} suggested removing ${candidate === 'You' ? 'you' : candidate} from ${name}.`
      return `${actor} proposed a personal pact.`
    case 'ALLIANCE_REQUEST_VOTE':
      return `${actor} voted ${request?.accepted ? 'yes' : 'no'} on admitting ${candidate === 'You' ? 'you' : candidate} to ${name}.`
    case 'ALLIANCE_INVITATION_SENT':
      return `${name} approved ${candidate === 'You' ? 'your' : `${candidate}'s`} admission and sent an invitation.`
    case 'ALLIANCE_REQUEST_CONSENT':
      return `${actor} ${request?.accepted ? 'accepted' : 'declined'} ${request?.kind === 'ADMIT' ? `the invitation to ${name}` : `the proposal for ${name}`}.`
    case 'ALLIANCE_REQUEST_ACCEPTED':
      return `${name}'s ${request?.kind === 'ADMIT' ? 'admission' : 'proposal'} was agreed.`
    case 'ALLIANCE_REQUEST_DECLINED':
      return request?.kind === 'ADMIT'
        ? event.reason.includes('candidate declined')
          ? `${candidate} declined the invitation to ${name}.`
          : `${name} rejected the proposal to admit ${candidate === 'You' ? 'you' : candidate}.`
        : `${name}'s proposal was declined.`
    case 'ALLIANCE_REQUEST_EXPIRED':
      return `${name}'s proposal expired without all required decisions.`
    case 'ALLIANCE_REQUEST_WITHDRAWN':
      return `${actor} withdrew ${name}'s proposal.`
    case 'ALLIANCE_REQUEST_INVALIDATED':
      return `${name}'s proposal was cancelled: ${event.reason}`
    case 'ALLIANCE_STRATEGY_MEETING':
      return `${actor} consulted ${name}${event.targetIds.length ? ` about ${names(event.targetIds, listedPerson)}` : ''}.`
    case 'ALLIANCE_TARGET_COORDINATED':
      return `${actor} agreed a plan in ${name}${event.targetIds.length ? ` involving ${names(event.targetIds, listedPerson)}` : ''}.`
    case 'ALLIANCE_PLAN_DEFIED':
      return `${actor} voted against ${name}'s agreed plan.`
    case 'ALLIANCE_BETRAYAL':
      return `${actor} betrayed ${target === 'You' ? 'you' : target} in ${name}.`
    case 'ALLIANCE_LEAKED':
      return `${actor} shared ${name}'s secrets with ${names(event.targetIds, listedPerson)}.`
    default:
      return `${name}: ${event.type.toLowerCase().replaceAll('_', ' ')}.`
  }
}
