import { allianceEventText, canReadAllianceEvent } from './allianceHistory'
import { allianceKind, getCurrentPact, isCurrentAlliance } from './allianceIdentity'
import { hasRealityRomanticBond } from './relationshipFacts'
import type { RealityDomainState } from './types'

/** Observable evidence, not a forecast of a private ballot or another player's thoughts. */
export function getObservedRelationshipSignals(input: {
  state: RealityDomainState
  viewerId: string
  targetId: string
  day: number
  name: (id: string) => string
}): string[] {
  const { state, viewerId, targetId, day, name } = input
  const signals: string[] = []
  const pact = getCurrentPact(state, viewerId, targetId)
  const romantic = hasRealityRomanticBond(state, viewerId, targetId, false)
  const recent = [...state.events]
    .reverse()
    .filter(
      (event) => event.day <= day && event.day >= day - 2 && canReadAllianceEvent(event, viewerId)
    )
  const reaction = recent.find(
    (event) =>
      event.type === 'ALLIANCE_BETRAYAL_REACTION' &&
      event.actorId === targetId &&
      event.targetIds.includes(viewerId)
  )
  if (reaction) signals.push(allianceEventText(state, reaction, viewerId, name))
  const departure = recent.find(
    (event) =>
      ['ALLIANCE_MEMBER_LEFT', 'ALLIANCE_MEMBER_EXPELLED', 'ALLIANCE_MEMBER_DEFECTED'].includes(
        event.type
      ) &&
      event.participantIds.includes(viewerId) &&
      event.participantIds.includes(targetId) &&
      (event.targetIds.includes(viewerId) || event.targetIds.includes(targetId))
  )
  if (departure) {
    const continuing = pact
      ? ` Your personal pact with ${name(targetId)} remains.`
      : romantic
        ? ` Your romance continues; there is no separate personal protection pact.`
        : ''
    signals.push(`${allianceEventText(state, departure, viewerId, name)}${continuing}`)
  }
  if (signals.length === 0) {
    const fracturedGroup = Object.values(state.alliances).some(
      (alliance) =>
        isCurrentAlliance(alliance) &&
        allianceKind(alliance) === 'GROUP' &&
        alliance.status === 'FRACTURED' &&
        alliance.memberIds.includes(viewerId) &&
        alliance.memberIds.includes(targetId)
    )
    if (fracturedGroup)
      signals.push(
        pact
          ? 'Your group is fractured. Your separate personal pact remains.'
          : 'Your group is fractured. Personal loyalties may survive, but the group plan is unsettled.'
      )
    else if (romantic && !pact)
      signals.push(
        'Your romantic bond is separate from a personal protection pact. No such pact is agreed.'
      )
    else {
      const request = pact
        ? Object.values(state.allianceManagement.requests).find(
            (entry) =>
              entry.resultAllianceId === pact?.id &&
              entry.kind === 'PACT' &&
              entry.status === 'ACCEPTED'
          )
        : undefined
      const response = request?.responsesByActorId?.[targetId]
      if (response && ['HESITANT', 'LIMITED'].includes(response.style))
        signals.push(
          `${name(targetId)} agreed ${response.style === 'LIMITED' ? 'with limits' : 'cautiously'}: ${response.reason}`
        )
    }
  }
  return signals.slice(0, 2)
}
