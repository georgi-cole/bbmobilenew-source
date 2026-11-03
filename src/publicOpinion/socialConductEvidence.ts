import { getRealityActionContract } from '../social/reality/actionContract'
import type { RealitySocialEvent, RealityVisibility } from '../social/reality/types'
import type { SocialActionLogEntry } from '../social/types'

const PUBLIC = new Set<RealityVisibility>(['HOUSE_PUBLIC', 'CEREMONY_PUBLIC'])
const MISCONDUCT = new Set(['startFight', 'plant_lie', 'betray'])

/** A public action is visible; another actor's private history is not evidence
 * for the audience until an actual public reveal supplies that provenance. */
export function socialConductEvidence(
  entry: SocialActionLogEntry,
  events: readonly RealitySocialEvent[],
  week: number
) {
  const tail = events.slice(-128)
  const byId = new Map(tail.map((event) => [event.id, event]))
  const visibilityCache = new Map<string, RealityVisibility | undefined>()
  const isPublic = (action: SocialActionLogEntry) => {
    const source = action.realityEventId ? byId.get(action.realityEventId) : undefined
    if (
      action.realityEventId &&
      (!source ||
        source.actorId !== action.actorId ||
        source.actionId !== action.actionId ||
        (!source.targetIds.includes(action.targetId) &&
          !(action.targetId === action.actorId && source.targetIds.length === 0)) ||
        source.day > week ||
        !source.publicEligible)
    )
      return false
    if (!visibilityCache.has(action.actionId))
      visibilityCache.set(action.actionId, getRealityActionContract(action.actionId)?.visibility)
    const visibility =
      source?.visibility ?? action.visibility ?? visibilityCache.get(action.actionId)
    return visibility !== undefined && PUBLIC.has(visibility)
  }
  const source = entry.realityEventId ? byId.get(entry.realityEventId) : undefined
  const publicPast = tail.filter(
    (event) =>
      PUBLIC.has(event.visibility) &&
      event.publicEligible &&
      event.day <= week &&
      event.day >= week - 2 &&
      (!source || event.sequence < source.sequence) &&
      event.outcome !== 'FAILURE' &&
      event.outcome !== 'IGNORED'
  )
  const misconduct = (event: RealitySocialEvent) =>
    MISCONDUCT.has(event.actionId ?? '') || event.allianceCommitmentSnapshot?.status === 'BROKEN'
  const involvedPair = (event: RealitySocialEvent, leftId: string, rightId: string) =>
    (event.actorId === leftId && event.targetIds.includes(rightId)) ||
    (event.actorId === rightId && event.targetIds.includes(leftId))
  return {
    isPublic,
    justified: publicPast.some(
      (event) =>
        event.actorId === entry.targetId &&
        involvedPair(event, entry.actorId, entry.targetId) &&
        misconduct(event)
    ),
    accountableRepair: publicPast.some(
      (event) =>
        event.actorId === entry.actorId &&
        involvedPair(event, entry.actorId, entry.targetId) &&
        misconduct(event)
    ),
    substantiatedExposure:
      source?.actionId === 'expose_secret' &&
      source.outcome === 'SUCCESS' &&
      source.relatedFactIds.length > 0 &&
      source.publicEligible &&
      PUBLIC.has(source.visibility),
    explicitBreach: source?.allianceCommitmentSnapshot?.status === 'BROKEN',
  }
}

/** Source-event keys survive log duplication; legacy fingerprints survive reload. */
export function socialStoryReceiptKey(entry: SocialActionLogEntry): string {
  return entry.realityEventId
    ? `event:${entry.realityEventId}`
    : entry.id
      ? `action:${entry.id}`
      : `legacy:${JSON.stringify([entry.week ?? 0, entry.phase ?? '', entry.actorId, entry.targetId, entry.actionId, entry.timestamp, entry.outcome, entry.delta, entry.score])}`
}
