import { appendRealityEvent } from './events'
import type { RealityDomainState, RealityAllianceRequest, RealityClock } from './types'

/** Record decisions independently of the rolling feed; pre-approval votes exclude the candidate. */
export function recordAllianceRequestEvent(
  state: RealityDomainState,
  request: RealityAllianceRequest,
  type: string,
  at: RealityClock,
  actorId = request.proposerId,
  accepted?: boolean
): void {
  const allianceId = request.allianceId ?? request.resultAllianceId
  const invitationSent = Boolean(request.candidateInvitedAt)
  const response = request.responsesByActorId?.[actorId]
  const participantIds = [
    ...new Set(
      [
        ...request.memberIds,
        request.proposerId,
        ...(request.kind !== 'ADMIT' || invitationSent ? [request.candidateId ?? ''] : []),
      ].filter(Boolean)
    ),
  ]
  const entry = appendRealityEvent(state, {
    ...at,
    type,
    actorId,
    allianceId,
    allianceRequestId: request.id,
    allianceRequestSnapshot: {
      kind: request.kind,
      status: request.status,
      candidateId: request.candidateId,
      proposedName: request.proposedName,
      accepted,
      ...(response ? { responseStyle: response.style, responseReason: response.reason } : {}),
    },
    targetIds: request.candidateId ? [request.candidateId] : [],
    participantIds,
    witnessIds: [],
    visibility: 'GROUP_VISIBLE',
    outcome: accepted === false || request.status === 'DECLINED' ? 'FAILURE' : 'SYSTEM',
    reason: response?.reason ?? request.reason ?? request.purpose,
    tags: ['ALLIANCE', 'REQUEST'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
  request.history ??= []
  request.history.push(entry)
}
