import {
  isPendingAllianceRequest,
  manageAlliance,
  type AllianceManagementContext,
} from './allianceManagement'
import { allianceKind, getCurrentPact, isCurrentAlliance } from './allianceIdentity'
import type { RealityDomainState } from './types'

/** One explicit AI decision per social window; human consent remains pending. */
export function evaluateAllianceAutonomy(
  domain: RealityDomainState,
  context: AllianceManagementContext
): void {
  const phaseReceipt = `ai-alliance:${context.at.day}:${context.at.phase}`
  if (
    !context.disabled &&
    !context.terminal &&
    ['social_1', 'social_2'].includes(context.at.phase) &&
    !domain.allianceManagement.processedCommands[phaseReceipt]
  ) {
    domain.allianceManagement.processedCommands[phaseReceipt] = {
      status: 'APPLIED',
      reason: 'AI governance opportunities evaluated.',
    }
    // One explicit request per window bounds demand. Humans always answer for themselves.
    const aiIds = context.activeActorIds.filter((id) => !context.humanActorIds.includes(id)).sort()
    for (const actorId of aiIds) {
      if (
        Object.values(domain.allianceManagement.requests).some(
          (request) => isPendingAllianceRequest(request) && request.proposerId === actorId
        )
      )
        continue
      const exhausted = Object.values(domain.alliances).find(
        (entry) =>
          isCurrentAlliance(entry) &&
          entry.memberIds.includes(actorId) &&
          (entry.memberCommitment[actorId] ?? 0.5) <= 0.08
      )
      if (exhausted) {
        manageAlliance(domain, { type: 'LEAVE', actorId, allianceId: exhausted.id }, context)
        break
      }
      const group = Object.values(domain.alliances)
        .filter(
          (entry) =>
            isCurrentAlliance(entry) &&
            allianceKind(entry) === 'GROUP' &&
            entry.leaderIds.includes(actorId)
        )
        .sort((left, right) => left.id.localeCompare(right.id))[0]
      const candidateId = context.activeActorIds
        .filter(
          (id) =>
            id !== actorId &&
            !group?.memberIds.includes(id) &&
            (domain.relationships[actorId]?.[id]?.trust ?? 0) >= 25
        )
        .sort()[0]
      if (!candidateId) continue
      const pact = Object.values(domain.alliances).find(
        (entry) =>
          isCurrentAlliance(entry) &&
          allianceKind(entry) === 'PACT' &&
          entry.memberIds.includes(actorId) &&
          !entry.memberIds.includes(candidateId) &&
          entry.provenance !== 'UNRESOLVED'
      )
      const proposed = group
        ? manageAlliance(
            domain,
            { type: 'PROPOSE', kind: 'ADMIT', actorId, allianceId: group.id, candidateId },
            context
          )
        : pact && !getCurrentPact(domain, actorId, candidateId)
          ? manageAlliance(
              domain,
              {
                type: 'PROPOSE',
                kind: 'FOUND',
                actorId,
                memberIds: [...pact.memberIds, candidateId],
                basePactId: pact.id,
              },
              context
            )
          : undefined
      if (proposed?.status === 'APPLIED') break
    }
  }
}
