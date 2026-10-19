import type { RealityDomainState, RealitySocialEvent } from './types'

export type RealityEventInput = Omit<RealitySocialEvent, 'id' | 'sequence'>

/** Keep detailed alliance timelines useful without letting them grow for a whole season. */
export const MAX_ALLIANCE_HISTORY_EVENTS = 64
/** A request needs its votes and response, not an unlimited transcript. */
export const MAX_ALLIANCE_REQUEST_HISTORY_EVENTS = 12

const ALLIANCE_MILESTONE_TYPES = new Set([
  'ALLIANCE_FORMED',
  'ALLIANCE_MEMBER_RECRUITED',
  'ALLIANCE_MEMBER_LEFT',
  'ALLIANCE_MEMBER_EXPELLED',
  'ALLIANCE_MEMBER_DEFECTED',
  'ALLIANCE_MEMBER_EVICTED',
  'ALLIANCE_OFFICERS_CHANGED',
  'ALLIANCE_ENDED',
  'ALLIANCE_DISSOLVED',
])
const CREATOR_EXIT_EVENT_TYPES = new Set([
  'ALLIANCE_MEMBER_LEFT',
  'ALLIANCE_MEMBER_EXPELLED',
  'ALLIANCE_MEMBER_DEFECTED',
  'ALLIANCE_MEMBER_EVICTED',
])

export function retainAllianceHistory(events: RealitySocialEvent[]): RealitySocialEvent[] {
  if (events.length <= MAX_ALLIANCE_HISTORY_EVENTS) return events
  const formation = events.find((event) => event.type === 'ALLIANCE_FORMED')
  const milestones = events.filter((event) => ALLIANCE_MILESTONE_TYPES.has(event.type)).slice(-15)
  const retained = new Map(
    [...(formation ? [formation] : []), ...milestones].map((event) => [event.id, event])
  )
  const availableSlots = MAX_ALLIANCE_HISTORY_EVENTS - retained.size
  const recent = events
    .slice(-MAX_ALLIANCE_HISTORY_EVENTS)
    .filter((event) => !retained.has(event.id))
    .slice(-availableSlots)
  for (const event of recent) retained.set(event.id, event)
  return [...retained.values()].sort((left, right) => left.sequence - right.sequence)
}

export function retainAllianceRequestHistory(events: RealitySocialEvent[]): RealitySocialEvent[] {
  return events.length > MAX_ALLIANCE_REQUEST_HISTORY_EVENTS
    ? events.slice(-MAX_ALLIANCE_REQUEST_HISTORY_EVENTS)
    : events
}

export function appendRealityEvent(
  state: RealityDomainState,
  input: RealityEventInput
): RealitySocialEvent {
  const sequence = state.nextSequence
  state.nextSequence += 1
  const event: RealitySocialEvent = {
    ...input,
    id: `reality-event-${sequence}`,
    sequence,
    targetIds: [...new Set(input.targetIds)],
    participantIds: [...new Set(input.participantIds)],
    witnessIds: [...new Set(input.witnessIds)],
    tags: [...new Set(input.tags)],
    relatedFactIds: [...new Set(input.relatedFactIds)],
    relatedPromiseIds: [...new Set(input.relatedPromiseIds)],
    relatedThreadIds: [...new Set(input.relatedThreadIds)],
  }
  const alliance = input.allianceId ? state.alliances[input.allianceId] : undefined
  if (alliance) {
    event.allianceSnapshot ??= {
      id: alliance.id,
      kind: alliance.kind,
      name: alliance.name,
      leaderId: alliance.leaderId,
      coLeaderId: alliance.coLeaderId,
      memberIds: [...alliance.memberIds],
    }
    alliance.history ??= []
    alliance.history.push(event)
    alliance.history = retainAllianceHistory(alliance.history)

    const creatorId = alliance.createdById
    if (
      creatorId &&
      CREATOR_EXIT_EVENT_TYPES.has(event.type) &&
      event.targetIds.includes(creatorId)
    )
      alliance.creatorPreviouslyLeft = true
    if (
      creatorId &&
      event.type === 'ALLIANCE_OFFICERS_CHANGED' &&
      event.allianceSnapshot?.leaderId &&
      event.allianceSnapshot.leaderId !== creatorId
    )
      alliance.leadershipTransferApproved = true
  }
  state.events.push(event)
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500)
  return event
}

export function visibleRealityEvents(
  state: RealityDomainState,
  input: {
    actorId?: string
    viewer?: boolean
    publicOnly?: boolean
    juryOnly?: boolean
  }
): RealitySocialEvent[] {
  return state.events.filter((event) => {
    if (input.publicOnly) return event.publicEligible
    if (input.juryOnly) return event.juryEligible
    if (input.viewer) {
      return (
        event.visibility !== 'PRIVATE' &&
        event.visibility !== 'PAIR_ONLY' &&
        event.visibility !== 'JURY_ONLY'
      )
    }
    if (!input.actorId) return false
    return (
      event.participantIds.includes(input.actorId) ||
      event.witnessIds.includes(input.actorId) ||
      event.visibility === 'HOUSE_PUBLIC' ||
      event.visibility === 'CEREMONY_PUBLIC'
    )
  })
}
