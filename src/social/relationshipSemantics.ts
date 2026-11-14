import { isCurrentAlliance } from './reality/allianceIdentity'
import { projectRealityAffinity } from './reality/relationships'
import {
  getRealityBetrayalStatus,
  getRealityFormerCommitmentTag,
  hasRealityRomanticBond,
} from './reality/relationshipFacts'
import type { RelationshipsMap } from './types'
import type {
  DirectedRelationship,
  RealityAlliance,
  RealityAllianceStatus,
  RealityDomainState,
  RealityRelationshipLabel,
} from './reality/types'

const LIVE_ALLIANCE_STATUSES = new Set(['ACTIVE', 'PROBATIONARY'])
const sharedAlliances = new WeakMap<
  RealityDomainState['alliances'],
  Map<string, Map<string, RealityAlliance[]>>
>()
const canonicalTags = new WeakMap<
  RealityDomainState,
  WeakMap<RelationshipsMap, Map<string, Map<string, string[]>>>
>()
const emptyRelationships: RelationshipsMap = Object.freeze({})
const REPAIRABLE_LEGACY_TAGS = new Set(['betrayal', 'broken_alliance', 'rivalry', 'strained'])
export const RELATIONSHIP_FORMING_GRACE_DAYS = 3
const ALLIANCE_STATUS_PRIORITY: Record<RealityAllianceStatus, number> = {
  ACTIVE: 4,
  PROBATIONARY: 3,
  FRACTURED: 2,
  DISSOLVED: 1,
  DORMANT: 0,
}

const RELATIONSHIP_LABEL_COPY: Record<RealityRelationshipLabel, string> = {
  UNKNOWN: 'Still forming',
  ACQUAINTANCE: 'Acquaintance',
  FRIENDLY: 'Friendly',
  FRIEND: 'Friend',
  CLOSE_FRIEND: 'Close friend',
  TRANSACTIONAL: 'Transactional',
  ALLY: 'Ally',
  CORE_ALLY: 'Core ally',
  FAKE_ALLY: 'Fake ally',
  ROMANCE: 'Romance',
  POWER_PAIR: 'Power pair',
  ONE_SIDED_CRUSH: 'One-sided crush',
  EX_ROMANCE: 'Ex',
  RIVAL: 'Rival',
  ENEMY: 'Enemy',
  UNEASY_TRUCE: 'Uneasy truce',
  ESTRANGED: 'Estranged',
}
const RELATIONSHIP_LABELS_WITH_PRIORITY = new Set<RealityRelationshipLabel>([
  'CLOSE_FRIEND',
  'TRANSACTIONAL',
  'ALLY',
  'CORE_ALLY',
  'FAKE_ALLY',
  'ROMANCE',
  'POWER_PAIR',
  'ONE_SIDED_CRUSH',
  'EX_ROMANCE',
  'RIVAL',
  'ENEMY',
  'UNEASY_TRUCE',
  'ESTRANGED',
])

/** A betrayal belongs to its actor and harmed target, never every alliance witness. */
export function isBetrayalBetween(
  event: RealityDomainState['events'][number],
  firstId: string,
  secondId: string
): boolean {
  if (
    event.type !== 'ALLIANCE_BETRAYAL' &&
    event.actionId !== 'betray' &&
    !event.tags.some((tag) => tag.toLowerCase() === 'betrayal')
  ) {
    return false
  }
  return Boolean(
    event.actorId &&
    ((event.actorId === firstId && event.targetIds.includes(secondId)) ||
      (event.actorId === secondId && event.targetIds.includes(firstId)))
  )
}

/** The Reality edge, rather than its compatibility affinity projection, owns the visible label. */
export function getCanonicalRelationshipLabel(
  edge: DirectedRelationship | undefined,
  hasOperationalAlliance = false,
  currentDay?: number,
  hasActiveNemesis = false,
  hasPersonalPact?: boolean,
  hasRomanticBond?: boolean
): string {
  const isEarlyRead =
    !edge ||
    edge.perceivedLabel === 'UNKNOWN' ||
    edge.perceivedLabel === 'ACQUAINTANCE' ||
    edge.perceivedLabel === 'FRIENDLY'

  if (hasActiveNemesis) return 'Nemesis'
  if (edge && ['ROMANCE', 'POWER_PAIR'].includes(edge.perceivedLabel)) {
    if (hasRomanticBond === false) return 'Romantic interest'
    if (
      edge.perceivedLabel === 'POWER_PAIR' &&
      hasRomanticBond !== undefined &&
      hasPersonalPact === false
    )
      return 'Romance'
  }
  if (hasOperationalAlliance && isEarlyRead) return 'Ally'
  if (isEarlyRead && currentDay !== undefined && currentDay > RELATIONSHIP_FORMING_GRACE_DAYS) {
    return getFirstImpressionLabel(edge)
  }
  if (!edge || edge.perceivedLabel === 'UNKNOWN') {
    return 'Still forming'
  }
  if (RELATIONSHIP_LABELS_WITH_PRIORITY.has(edge.perceivedLabel)) {
    return RELATIONSHIP_LABEL_COPY[edge.perceivedLabel]
  }
  if (hasOperationalAlliance) return 'Ally'

  const affinity = projectRealityAffinity(edge)
  if (affinity >= 55) return 'Close'
  if (affinity >= 20) return 'Friendly'
  if (affinity <= -45) return 'Hostile'
  if (affinity <= -15) return 'Tense'
  return RELATIONSHIP_LABEL_COPY[edge?.perceivedLabel ?? 'UNKNOWN']
}

/**
 * Once the opening days have passed, an unknown edge should read as an early
 * impression rather than remaining provisional forever. This is presentation
 * only: it does not create or mutate relationship state.
 */
function getFirstImpressionLabel(edge: DirectedRelationship | undefined): string {
  if (!edge) return 'No tea'

  const affinity = projectRealityAffinity(edge)
  if (
    (edge.resentment >= 24 && edge.trust <= 10) ||
    ((edge.suspicion >= 22 || (edge.acuteTension ?? 0) >= 24) && edge.trust <= 18)
  ) {
    return edge.resentment >= 24 ? 'Thin ice' : 'Side-eye'
  }
  if (affinity <= -15) return 'Bad vibes'
  if (affinity >= 55) return 'Same wavelength'
  if (edge.attraction >= 32) return 'Uh-oh, sparks'
  if (edge.warmth >= 15 || affinity >= 20) return 'Good banter'
  if (edge.trust >= 20 && edge.reliability >= 18) return 'Solid-ish'
  if (edge.respect >= 20 || edge.gratitude >= 20) return 'Points earned'
  if (edge.strategicValue >= 35 && edge.warmth < 20) return 'All business'
  return 'No tea'
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
  const immutable = Object.isFrozen(reality.alliances)
  let actors = immutable ? sharedAlliances.get(reality.alliances) : undefined
  const cached = actors?.get(actorId)?.get(targetId)
  if (cached) return [...cached]
  const result = Object.values(reality.alliances)
    .filter(
      (alliance) =>
        (alliance.memberIds.includes(actorId) && alliance.memberIds.includes(targetId)) ||
        (!isCurrentAlliance(alliance) &&
          Object.values(alliance.rosterKnowledgeByActor ?? {}).some(
            (snapshot) =>
              snapshot.memberIds.includes(actorId) && snapshot.memberIds.includes(targetId)
          ))
    )
    .sort(
      (left, right) =>
        Number(isCurrentAlliance(right)) - Number(isCurrentAlliance(left)) ||
        (ALLIANCE_STATUS_PRIORITY[right.status] ?? -1) -
          (ALLIANCE_STATUS_PRIORITY[left.status] ?? -1) ||
        left.id.localeCompare(right.id)
    )
  if (immutable) {
    if (!actors) sharedAlliances.set(reality.alliances, (actors = new Map()))
    let targets = actors.get(actorId)
    if (!targets) actors.set(actorId, (targets = new Map()))
    targets.set(targetId, [...result])
  }
  return result
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
      isCurrentAlliance(alliance)
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
  isNemesis: boolean
} {
  const outward = input.relationships?.[input.actorId]?.[input.targetId]
  const inward = input.relationships?.[input.targetId]?.[input.actorId]
  const formalAlliance = selectCanonicalAlliance(input.reality, input.actorId, input.targetId)
  const visibleTags = getCanonicalRelationshipTags(input)
  const isNemesis = isNemesisDisclosedTo(input.reality, input.actorId, input.targetId)

  if (formalAlliance?.status === 'PROBATIONARY') {
    visibleTags.delete('strained_alliance')
    visibleTags.add('new_alliance')
  }
  if (formalAlliance?.status === 'FRACTURED') {
    visibleTags.add('strained_alliance')
  }
  if (formalAlliance?.status === 'DISSOLVED') {
    visibleTags.delete('alliance')
    visibleTags.add(formalAlliance.kind === 'GROUP' ? 'former_group' : 'ended_pact')
  }

  return {
    affinity:
      outward?.affinity !== undefined || inward?.affinity !== undefined
        ? Math.round(((outward?.affinity ?? 0) + (inward?.affinity ?? 0)) / 2)
        : undefined,
    visibleTags,
    isNemesis,
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
 * Nemesis is a private AI objective, not automatically a player-facing fact.
 * It becomes an earned relationship read only after hostility the viewer
 * actually experienced or witnessed. This cannot leak a PRIVATE objective.
 */
export function isNemesisDisclosedTo(
  reality: RealityDomainState | undefined,
  viewerId: string,
  otherId: string
): boolean {
  if (!reality) return false
  return Object.values(reality.relationshipAutonomy.nemeses).some((nemesis) => {
    if (nemesis.status !== 'ACTIVE') return false
    if (nemesis.ownerId === viewerId && nemesis.targetId === otherId) return true
    if (nemesis.ownerId !== otherId || nemesis.targetId !== viewerId) return false
    // The player may witness hostility before the story discloses that
    // character's private Nemesis objective. Show a Rival in that interval;
    // only the persisted named revelation justifies the Nemesis label.
    return Boolean(nemesis.revealEventId || nemesis.revealedAt)
  })
}

/**
 * Returns the relationship truth used by action availability. Once a Reality
 * domain exists, a formal alliance is the only source for the alliance tag;
 * a stale projected legacy tag must never advertise a non-executable huddle.
 */
export function getCanonicalRelationshipTags(
  input: Parameters<typeof readCanonicalRelationshipTags>[0]
): Set<string> {
  const reality = input.reality,
    relationships = input.relationships ?? emptyRelationships
  if (!reality || !Object.isFrozen(reality) || !Object.isFrozen(relationships))
    return readCanonicalRelationshipTags(input)
  let byRelationships = canonicalTags.get(reality)
  if (!byRelationships) canonicalTags.set(reality, (byRelationships = new WeakMap()))
  let actors = byRelationships.get(relationships)
  if (!actors) byRelationships.set(relationships, (actors = new Map()))
  let targets = actors.get(input.actorId)
  if (!targets) actors.set(input.actorId, (targets = new Map()))
  let tags = targets.get(input.targetId)
  if (!tags) {
    tags = [...readCanonicalRelationshipTags(input)]
    targets.set(input.targetId, tags)
  }
  // Consumers intentionally add/remove presentation tags. Never expose cached sets.
  return new Set(tags)
}

function readCanonicalRelationshipTags(input: {
  relationships?: RelationshipsMap
  reality?: RealityDomainState
  actorId: string
  targetId: string
}): Set<string> {
  const tags = pairLegacyTags(input.relationships, input.actorId, input.targetId)
  const edge = input.reality?.relationships[input.actorId]?.[input.targetId]
  const hasLiveAlliance = hasCanonicalLiveAlliance(input.reality, input.actorId, input.targetId)
  const hasDisclosedNemesis = isNemesisDisclosedTo(input.reality, input.actorId, input.targetId)

  if (input.reality) {
    // Legacy projection includes the other person's private rivalry and
    // targeting tags. A player-limited read must not turn them into a spoiler.
    tags.delete('rivalry')
    tags.delete('target')
    if (input.relationships?.[input.actorId]?.[input.targetId]?.tags.includes('rivalry')) {
      tags.add('rivalry')
    }
    tags.delete('alliance')
    if (hasLiveAlliance) tags.add('alliance')
    // A hostile read or an ordinary grievance is not proof that trust was broken.
    tags.delete('betrayal')
    tags.delete('betrayed_them')
    tags.delete('repaired_betrayal')
    tags.delete('broken_alliance')
    tags.delete('former_group')
    tags.delete('ended_pact')
    tags.delete('romance')
    const received = getRealityBetrayalStatus(input.reality, input.actorId, input.targetId)
    const caused = getRealityBetrayalStatus(input.reality, input.targetId, input.actorId)
    if (received === 'UNRESOLVED') tags.add('betrayal')
    if (caused === 'UNRESOLVED') tags.add('betrayed_them')
    if (received === 'REPAIRED' || caused === 'REPAIRED') tags.add('repaired_betrayal')
    if (hasRealityRomanticBond(input.reality, input.actorId, input.targetId, false))
      tags.add('romance')
    if (!hasLiveAlliance) {
      const former = getRealityFormerCommitmentTag(input.reality, input.actorId, input.targetId)
      if (former) tags.add(former)
    }
  }

  if (hasDisclosedNemesis) tags.add('rivalry')

  // Never infer this player's opinion from the other character's hidden edge.
  for (const relationship of [edge]) {
    if (!relationship) continue
    if (relationship.perceivedLabel === 'RIVAL' || relationship.perceivedLabel === 'ENEMY') {
      tags.add('rivalry')
    }
    if (
      relationship.trust <= 18 &&
      (relationship.resentment >= 18 ||
        relationship.suspicion >= 22 ||
        relationship.reliability <= 15)
    ) {
      tags.add('strained')
    }
  }

  if (tags.has('betrayal') || tags.has('betrayed_them')) {
    tags.add('strained')
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
  day?: number
}): boolean {
  const { actorId, targetId, reality, relationships } = input
  const isPair = (left: string, right: string) =>
    (left === actorId && right === targetId) || (left === targetId && right === actorId)
  if (
    Object.values(reality?.grievances ?? {}).some(
      (grievance) =>
        isPair(grievance.holderId, grievance.againstId) &&
        grievance.status !== 'RESOLVED' &&
        grievance.repairDebt > 0
    )
  )
    return true
  if (isNemesisDisclosedTo(reality, actorId, targetId)) return true

  const edges = [
    reality?.relationships[actorId]?.[targetId],
    reality?.relationships[targetId]?.[actorId],
  ].filter((edge) => edge !== undefined)
  if (
    edges.some(
      (edge) =>
        ['RIVAL', 'ENEMY', 'ESTRANGED'].includes(edge.perceivedLabel) ||
        edge.warmth < -5 ||
        edge.trust < -5 ||
        edge.resentment >= 12 ||
        (edge.acuteTension ?? 0) >= 20 ||
        (edge.suspicion >= 18 && edge.trust <= 18)
    )
  )
    return true

  const events = (reality?.events ?? []).filter(
    (event) => event.participantIds.includes(actorId) && event.participantIds.includes(targetId)
  )
  const lastRepair = events.reduce(
    (latest, event) =>
      event.outcome === 'SUCCESS' && ['apologize', 'repair_bond'].includes(event.actionId ?? '')
        ? Math.max(latest, event.sequence)
        : latest,
    -1
  )
  const day = input.day ?? Math.max(0, ...events.map((event) => event.day))
  if (
    events.some(
      (event) =>
        event.sequence > lastRepair &&
        event.day >= day - 1 &&
        (event.tags.some((tag) =>
          ['CONFLICT', 'BETRAYAL', 'RUMOUR', 'RUMOR'].includes(tag.toUpperCase())
        ) ||
          ['ALLIANCE_BETRAYAL', 'RUMOUR_SPREAD', 'PROMISE_BROKEN'].includes(event.type))
    )
  )
    return true

  // Current Reality edges own the relationship. Historical betrayal/alliance
  // tags must not keep advertising an apology after the tension has healed.
  if (edges.length > 0) return false
  const legacyEdges = [relationships?.[actorId]?.[targetId], relationships?.[targetId]?.[actorId]]
  if (legacyEdges.some((edge) => (edge?.affinity ?? 0) < 0)) return true
  return (
    lastRepair < 0 &&
    legacyEdges.some((edge) => edge?.tags.some((tag) => REPAIRABLE_LEGACY_TAGS.has(tag)))
  )
}
