import type { RealityDomainState } from './types'
import {
  getRealityBetrayalStatus,
  getRealityProtectionAlliances,
  hasRealityRomanticBond,
} from './relationshipFacts'

/** Decision protection comes from operational pacts, not historical roster tags. */
export function getDecisionRelationshipTags(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  suppliedTags: readonly string[] = []
): string[] {
  const tags = new Set(suppliedTags)
  tags.delete('betrayal')
  if (getRealityBetrayalStatus(state, actorId, targetId) === 'UNRESOLVED') tags.add('betrayal')
  const livePacts = getRealityProtectionAlliances(state, actorId, targetId)
  for (const tag of ['alliance', 'primary_alliance', 'ride_or_die']) tags.delete(tag)
  if (livePacts.length > 0) {
    tags.add('alliance')
    for (const tag of ['primary_alliance', 'ride_or_die']) {
      if (suppliedTags.includes(tag)) tags.add(tag)
    }
    if (
      livePacts.some(
        (pact) =>
          pact.memberPerceivedStatus[actorId] === 'CORE' &&
          pact.memberPerceivedStatus[targetId] === 'CORE'
      )
    )
      tags.add('primary_alliance')
  }
  tags.delete('romance')
  if (hasRealityRomanticBond(state, actorId, targetId)) tags.add('romance')
  return [...tags]
}
