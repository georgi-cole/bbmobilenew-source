import { isCurrentAlliance } from './reality/allianceIdentity'
import { getRealityBetrayalStatus } from './reality/relationshipFacts'
import type { RealityDomainState } from './reality/types'
import type { RelationshipsMap } from './types'

/** A low compatibility affinity alone must not turn an operational ally into an enemy. */
export function isProtectedSocialAlly(
  reality: RealityDomainState | undefined,
  relationships: RelationshipsMap | undefined,
  actorId: string,
  subjectId: string
): boolean {
  const shared = Object.values(reality?.alliances ?? {}).filter(
    (alliance) => alliance.memberIds.includes(actorId) && alliance.memberIds.includes(subjectId)
  )
  if (shared.length) {
    return (
      shared.some(
        (alliance) =>
          isCurrentAlliance(alliance) && ['ACTIVE', 'PROBATIONARY'].includes(alliance.status)
      ) &&
      (!reality || getRealityBetrayalStatus(reality, actorId, subjectId) !== 'UNRESOLVED')
    )
  }
  const tags = new Set(relationships?.[actorId]?.[subjectId]?.tags ?? [])
  return tags.has('alliance') && !tags.has('betrayal') && !tags.has('broken_alliance')
}
