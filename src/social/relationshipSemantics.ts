import type { RelationshipsMap } from './types'
import type { RealityAlliance, RealityAllianceStatus, RealityDomainState } from './reality/types'

const LIVE_ALLIANCE_STATUSES = new Set(['ACTIVE', 'PROBATIONARY'])
const REPAIRABLE_LEGACY_TAGS = new Set(['betrayal', 'broken_alliance', 'rivalry', 'strained'])
const ALLIANCE_STATUS_PRIORITY: Record<RealityAllianceStatus, number> = {
  ACTIVE: 4,
  PROBATIONARY: 3,
  FRACTURED: 2,
  DISSOLVED: 1,
  DORMANT: 0,
}

/**
 * Return every formal alliance shared by a pair, ordered independently of
 * object insertion order. A pair can retain historical/fractured records
 * while a newer operational alliance is active, so callers must not use the
 * first matching Object.values() entry as the relationship truth.
 */
export function getSharedFormalAlliances(
  reality: RealityDomainState | undefined,
  actorId: string,
  targetId: string
): RealityAlliance[] {
  if (!reality || actorId === targetId) return []
  return Object.values(reality.alliances)
    .filter(
      (alliance) => alliance.memberIds.includes(actorId) && alliance.memberIds.includes(targetId)
    )
    .sort(
      (left, right) =>
        (ALLIANCE_STATUS_PRIORITY[right.status] ?? -1) -
          (ALLIANCE_STATUS_PRIORITY[left.status] ?? -1) || left.id.localeCompare(right.id)
    )
}

/** The canonical display record is the highest-priority shared record. */
export function selectCanonicalAlliance(
  reality: RealityDomainState | undefined,
  actorId: string,
  targetId: string
): RealityAlliance | null {
  return getSharedFormalAlliances(reality, actorId, targetId)[0] ?? null
}

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
    getSharedFormalAlliances(reality, actorId, targetId).some((alliance) =>
      LIVE_ALLIANCE_STATUSES.has(alliance.status)
    )
  )
}

/**
 * The single relationship read intended for presentation as well as action
 * contracts.  Legacy tags are a compatibility projection; formal Reality
 * records are the authority for alliance identity and lifecycle.
 */
export function selectCanonicalRelationshipView(input: {
  relationships?: RelationshipsMap
  reality?: RealityDomainState
  actorId: string
  targetId: string
}): {
  affinity?: number
  visibleTags: Set<string>
  alliance: { id: string; status: string; operational: boolean } | null
} {
  const outward = input.relationships?.[input.actorId]?.[input.targetId]
  const inward = input.relationships?.[input.targetId]?.[input.actorId]
  const formalAlliance = selectCanonicalAlliance(input.reality, input.actorId, input.targetId)
  const visibleTags = getCanonicalRelationshipTags(input)

  if (formalAlliance?.status === 'PROBATIONARY') visibleTags.add('strained_alliance')
  if (formalAlliance?.status === 'FRACTURED') {
    visibleTags.delete('alliance')
    visibleTags.add('broken_alliance')
  }
  if (formalAlliance?.status === 'DISSOLVED') {
    visibleTags.delete('alliance')
    visibleTags.add('broken_alliance')
  }

  return {
    affinity:
      outward?.affinity !== undefined || inward?.affinity !== undefined
        ? Math.round(((outward?.affinity ?? 0) + (inward?.affinity ?? 0)) / 2)
        : undefined,
    visibleTags,
    alliance: formalAlliance
      ? {
          id: formalAlliance.id,
          status: formalAlliance.status,
          operational: LIVE_ALLIANCE_STATUSES.has(formalAlliance.status),
        }
      : null,
  }
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
