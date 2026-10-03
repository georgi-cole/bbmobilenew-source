import type { RealityDomainState } from './types'

/** Decision protection comes from operational pacts, not historical roster tags. */
export function getDecisionRelationshipTags(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  suppliedTags: readonly string[] = []
): string[] {
  const tags = new Set(suppliedTags)
  const livePacts = Object.values(state.alliances).filter(
    (alliance) =>
      (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
      alliance.memberIds.includes(actorId) &&
      alliance.memberIds.includes(targetId)
  )
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
  if (
    Object.values(state.romances).some(
      (romance) =>
        romance.status === 'ACTIVE' &&
        romance.participantIds.includes(actorId) &&
        romance.participantIds.includes(targetId)
    )
  )
    tags.add('romance')
  return [...tags]
}
