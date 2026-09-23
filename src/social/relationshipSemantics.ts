import type { RelationshipsMap } from './types'
import type { RealityDomainState } from './reality/types'

const LIVE_ALLIANCE_STATUSES = new Set(['ACTIVE', 'PROBATIONARY'])
const REPAIRABLE_LEGACY_TAGS = new Set(['betrayal', 'broken_alliance', 'rivalry', 'strained'])

function pairLegacyTags(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): Set<string> {
  return new Set([
    ...(relationships?.[actorId]?.[targetId]?.tags ?? []),
    ...(relationships?.[targetId]?.[actorId]?.tags ?? []),
  ])
}

export function hasCanonicalLiveAlliance(
  reality: RealityDomainState | undefined,
  actorId: string,
  targetId: string
): boolean {
  return Boolean(
    reality &&
    Object.values(reality.alliances).some(
      (alliance) =>
        LIVE_ALLIANCE_STATUSES.has(alliance.status) &&
        alliance.memberIds.includes(actorId) &&
        alliance.memberIds.includes(targetId)
    )
  )
}

/**
 * Returns the relationship truth used by action availability. Once a Reality
 * domain exists, a formal alliance is the only source for the alliance tag;
 * a stale projected legacy tag must never advertise a non-executable huddle.
 */
export function getCanonicalRelationshipTags(input: {
  relationships?: RelationshipsMap
  reality?: RealityDomainState
  actorId: string
  targetId: string
}): Set<string> {
  const tags = pairLegacyTags(input.relationships, input.actorId, input.targetId)
  const edge = input.reality?.relationships[input.actorId]?.[input.targetId]
  const reverseEdge = input.reality?.relationships[input.targetId]?.[input.actorId]
  const hasLiveAlliance = hasCanonicalLiveAlliance(input.reality, input.actorId, input.targetId)

  if (input.reality) {
    tags.delete('alliance')
    if (hasLiveAlliance) tags.add('alliance')
  }

  for (const relationship of [edge, reverseEdge]) {
    if (!relationship) continue
    if (relationship.perceivedLabel === 'RIVAL') tags.add('rivalry')
    if (relationship.perceivedLabel === 'ENEMY') tags.add('betrayal')
    if (
      relationship.trust <= 18 &&
      (relationship.resentment >= 18 ||
        relationship.suspicion >= 22 ||
        relationship.reliability <= 15)
    ) {
      tags.add('strained')
    }
  }

  if (
    input.reality &&
    !hasLiveAlliance &&
    input.reality.events.some(
      (event) =>
        [
          'ALLIANCE_MEMBER_LEFT',
          'ALLIANCE_MEMBER_DEFECTED',
          'ALLIANCE_MEMBER_EXPELLED',
          'ALLIANCE_MEMBER_EVICTED',
          'ALLIANCE_REENTRY_RECONCILED',
        ].includes(event.type) &&
        event.participantIds.includes(input.actorId) &&
        event.participantIds.includes(input.targetId) &&
        (event.type !== 'ALLIANCE_REENTRY_RECONCILED' || event.outcome !== 'SUCCESS')
    )
  ) {
    tags.add('broken_alliance')
  }

  if (
    input.reality &&
    Object.values(input.reality.grievances).some(
      (grievance) =>
        grievance.status !== 'RESOLVED' &&
        ((grievance.holderId === input.actorId && grievance.againstId === input.targetId) ||
          (grievance.holderId === input.targetId && grievance.againstId === input.actorId))
    )
  ) {
    tags.add('betrayal')
  }

  return tags
}

export function hasCanonicalRelationshipTag(input: {
  relationships?: RelationshipsMap
  reality?: RealityDomainState
  actorId: string
  targetId: string
  tag: string
}): boolean {
  return getCanonicalRelationshipTags(input).has(input.tag)
}

export function isRepairableRelationship(input: {
  relationships?: RelationshipsMap
  reality?: RealityDomainState
  actorId: string
  targetId: string
}): boolean {
  const tags = getCanonicalRelationshipTags(input)
  return [...REPAIRABLE_LEGACY_TAGS].some((tag) => tags.has(tag))
}
