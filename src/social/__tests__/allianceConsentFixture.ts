import { allianceRequestDecisionActors, manageAlliance } from '../reality/allianceManagement'
import { allianceKind } from '../reality/allianceIdentity'
import type { RealityDomainState, RealityClock } from '../reality/types'

/** Test setup goes through the same consent boundaries as live management. */
export function consentedRecruit(
  state: RealityDomainState,
  input: {
    allianceId: string
    recruiterId: string
    targetId: string
    expandedAllianceId: string
    at: RealityClock
  }
) {
  const base = state.alliances[input.allianceId]
  if (base.memberIds.includes(input.targetId)) return base
  const ids = [
    ...new Set([
      ...Object.values(state.alliances).flatMap((entry) => entry.memberIds),
      input.recruiterId,
      input.targetId,
    ]),
  ]
  const context = { at: input.at, activeActorIds: ids, humanActorIds: ids, seed: 1 }
  const result = manageAlliance(
    state,
    allianceKind(base) === 'PACT'
      ? {
          type: 'PROPOSE',
          kind: 'FOUND',
          actorId: input.recruiterId,
          memberIds: [...base.memberIds, input.targetId],
          basePactId: base.id,
          purpose: 'Wider coalition',
        }
      : {
          type: 'PROPOSE',
          kind: 'ADMIT',
          actorId: input.recruiterId,
          allianceId: base.id,
          candidateId: input.targetId,
        },
    context
  )
  if (!result.requestId) throw new Error(result.reason)
  const request = state.allianceManagement.requests[result.requestId]
  for (let round = 0; round < 2; round++)
    for (const actorId of allianceRequestDecisionActors(request))
      manageAlliance(
        state,
        { type: 'RESPOND', requestId: request.id, actorId, accept: true },
        context
      )
  if (request.status !== 'ACCEPTED') throw new Error(request.reason ?? 'Fixture consent failed')
  return state.alliances[request.resultAllianceId!]
}
