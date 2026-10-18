import { isCurrentAlliance } from './allianceIdentity'
import type { RealityDomainState } from './types'

export interface AllianceCampaignMove {
  actionId: 'pitch_target' | 'suggest_replacement' | 'rally_votes_against'
  targetIds: string[]
  subjectId: string
  reason: string
}

/** Select the next legal political move for a contestant who is willing to carry a faction plan. */
export function getAllianceCampaignMove(input: {
  reality: RealityDomainState
  actorId: string
  activeActorIds: readonly string[]
  eligibleVoterIds?: readonly string[]
  phase: string
  lohId?: string | null
  posWinnerId?: string | null
  atRiskActorIds: readonly string[]
}): AllianceCampaignMove | null {
  const activeIds = new Set(input.activeActorIds)
  const alliance = Object.values(input.reality.alliances)
    .filter(
      (entry) =>
        isCurrentAlliance(entry) &&
        (entry.status === 'ACTIVE' || entry.status === 'PROBATIONARY') &&
        entry.memberIds.includes(input.actorId) &&
        entry.currentTargetIds.some(
          (targetId) => activeIds.has(targetId) && !entry.memberIds.includes(targetId)
        )
    )
    .sort(
      (left, right) =>
        Number(right.status === 'ACTIVE') - Number(left.status === 'ACTIVE') ||
        right.memberIds.length - left.memberIds.length ||
        (right.memberCommitment[input.actorId] ?? 0) -
          (left.memberCommitment[input.actorId] ?? 0) ||
        left.id.localeCompare(right.id)
    )[0]
  if (!alliance) return null

  const subjectId = alliance.currentTargetIds.find(
    (targetId) => activeIds.has(targetId) && !alliance.memberIds.includes(targetId)
  )
  if (!subjectId) return null
  const actorBelievesInPlan = (alliance.memberPlanBeliefs[input.actorId] ?? []).includes(
    `target:${subjectId}`
  )
  if (!actorBelievesInPlan && (alliance.memberCommitment[input.actorId] ?? 0) < 0.6) return null

  const atRisk = new Set(input.atRiskActorIds)
  if (
    ['social_1', 'nominations', 'loh_results'].includes(input.phase) &&
    input.lohId &&
    input.lohId !== input.actorId &&
    input.lohId !== subjectId &&
    activeIds.has(input.lohId)
  ) {
    return {
      actionId: 'pitch_target',
      targetIds: [input.lohId],
      subjectId,
      reason: `their alliance has identified ${subjectId} as a threat and wants the Head of Household to act`,
    }
  }

  if (
    [
      'nomination_results',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
    ].includes(input.phase) &&
    input.posWinnerId &&
    input.posWinnerId !== input.actorId &&
    !atRisk.has(subjectId) &&
    activeIds.has(input.posWinnerId)
  ) {
    return {
      actionId: 'suggest_replacement',
      targetIds: [input.posWinnerId],
      subjectId,
      reason: `their alliance is asking the Safety holder to consider ${subjectId} as a replacement nominee`,
    }
  }

  if (['social_2', 'pos_ceremony_results'].includes(input.phase) && atRisk.has(subjectId)) {
    const eligibleVoterIds = new Set(input.eligibleVoterIds ?? input.activeActorIds)
    const partnerId = alliance.memberIds
      .filter((id) => id !== input.actorId && activeIds.has(id) && eligibleVoterIds.has(id))
      .sort(
        (left, right) =>
          Number((alliance.memberPlanBeliefs[right] ?? []).includes(`target:${subjectId}`)) -
            Number((alliance.memberPlanBeliefs[left] ?? []).includes(`target:${subjectId}`)) ||
          (input.reality.relationships[input.actorId]?.[right]?.trust ?? 0) -
            (input.reality.relationships[input.actorId]?.[left]?.trust ?? 0) ||
          left.localeCompare(right)
      )[0]
    if (partnerId) {
      return {
        actionId: 'rally_votes_against',
        targetIds: [partnerId],
        subjectId,
        reason: `their alliance is organizing votes to remove ${subjectId}`,
      }
    }
  }

  return null
}
