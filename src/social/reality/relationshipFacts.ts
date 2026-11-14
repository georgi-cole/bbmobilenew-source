import { isCurrentAlliance } from './allianceIdentity'
import type { RealityDomainState, RealitySocialEvent } from './types'

export function isDirectedRealityBetrayal(
  event: RealitySocialEvent,
  betrayerId: string,
  harmedId: string
): boolean {
  return (
    event.actorId === betrayerId &&
    event.targetIds.includes(harmedId) &&
    (event.type === 'ALLIANCE_BETRAYAL' ||
      event.actionId === 'betray' ||
      event.tags.some((tag) => tag.toUpperCase() === 'BETRAYAL'))
  )
}

/** History retains responsibility; only unresolved harm drives current retaliation. */
export function getRealityBetrayalStatus(
  state: RealityDomainState,
  harmedId: string,
  betrayerId: string
): 'NONE' | 'UNRESOLVED' | 'REPAIRED' {
  const events = state.events.filter((event) =>
    isDirectedRealityBetrayal(event, betrayerId, harmedId)
  )
  const grievances = Object.values(state.grievances).filter(
    (grievance) => grievance.holderId === harmedId && grievance.againstId === betrayerId
  )
  if (events.length === 0) {
    const durable = grievances.filter((grievance) => grievance.id.startsWith('grievance:alliance:'))
    return durable.length === 0
      ? 'NONE'
      : durable.some((grievance) => grievance.status !== 'RESOLVED')
        ? 'UNRESOLVED'
        : 'REPAIRED'
  }
  const edge = state.relationships[harmedId]?.[betrayerId]
  for (const event of events) {
    const related = grievances.filter(
      (grievance) =>
        grievance.causeEventId === event.id || event.reason.endsWith(`:${grievance.causeEventId}`)
    )
    if (related.length > 0) {
      if (related.some((grievance) => grievance.status !== 'RESOLVED')) return 'UNRESOLVED'
      continue
    }
    // Old saves can lack a grievance record. Require subsequent, concrete repair.
    if (
      !edge ||
      (edge.lastMeaningfulInteraction?.day ?? event.day) <= event.day ||
      edge.trust < 35 ||
      edge.resentment >= 18 ||
      edge.suspicion >= 25
    )
      return 'UNRESOLVED'
  }
  return 'REPAIRED'
}

/** Explicit acceptance owns romance; mutually romantic old saves remain compatible. */
export function hasRealityRomanticBond(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  allowLegacyInference = true
): boolean {
  const romances = Object.values(state.romances).filter(
    (romance) =>
      romance.participantIds.includes(actorId) && romance.participantIds.includes(targetId)
  )
  if (romances.length > 0)
    return romances.some((romance) => ['ACTIVE', 'STRAINED'].includes(romance.status))
  if (!allowLegacyInference) return false
  return [state.relationships[actorId]?.[targetId], state.relationships[targetId]?.[actorId]].every(
    (edge) =>
      edge &&
      ['ROMANCE', 'POWER_PAIR'].includes(edge.perceivedLabel) &&
      edge.trust >= 20 &&
      edge.positiveAnchorEventIds.length > 0
  )
}

export function hasSurvivingRealityLoyalty(
  state: RealityDomainState,
  actorId: string,
  targetId: string
): boolean {
  const edge = state.relationships[actorId]?.[targetId]
  return Boolean(
    edge &&
    edge.trust >= 20 &&
    edge.loyalty >= 25 &&
    getRealityBetrayalStatus(state, actorId, targetId) !== 'UNRESOLVED'
  )
}

export function getRealityProtectionAlliances(
  state: RealityDomainState,
  actorId: string,
  targetId: string
) {
  return Object.values(state.alliances).filter(
    (alliance) =>
      isCurrentAlliance(alliance) &&
      alliance.memberIds.includes(actorId) &&
      alliance.memberIds.includes(targetId) &&
      (['ACTIVE', 'PROBATIONARY'].includes(alliance.status) ||
        (alliance.status === 'FRACTURED' && hasSurvivingRealityLoyalty(state, actorId, targetId)))
  )
}

/** A departed group is history, not an accusation that the personal bond broke. */
export function getRealityFormerCommitmentTag(
  state: RealityDomainState,
  actorId: string,
  targetId: string
): 'former_group' | 'ended_pact' | undefined {
  const event = [...state.events]
    .reverse()
    .find(
      (entry) =>
        [
          'ALLIANCE_MEMBER_LEFT',
          'ALLIANCE_MEMBER_DEFECTED',
          'ALLIANCE_MEMBER_EXPELLED',
          'ALLIANCE_MEMBER_EVICTED',
          'ALLIANCE_ENDED',
          'ALLIANCE_DISSOLVED',
        ].includes(entry.type) &&
        entry.participantIds.includes(actorId) &&
        entry.participantIds.includes(targetId) &&
        (entry.type === 'ALLIANCE_ENDED' ||
          entry.type === 'ALLIANCE_DISSOLVED' ||
          entry.targetIds.includes(actorId) ||
          entry.targetIds.includes(targetId))
    )
  const alliance = event?.allianceId ? state.alliances[event.allianceId] : undefined
  const historical =
    alliance ??
    Object.values(state.alliances).find(
      (entry) =>
        entry.status === 'DISSOLVED' &&
        Object.values(entry.rosterKnowledgeByActor ?? {}).some(
          (roster) => roster.memberIds.includes(actorId) && roster.memberIds.includes(targetId)
        )
    )
  const kind = event?.allianceSnapshot?.kind ?? historical?.kind
  return kind ? (kind === 'GROUP' ? 'former_group' : 'ended_pact') : undefined
}
