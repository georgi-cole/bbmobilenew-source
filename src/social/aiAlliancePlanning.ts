import type { RootState } from '../store/store'
import { allianceManagementContext, allianceProposalPrice } from './allianceManagementActions'
import { getSocialPersonality } from './socialPersonalityBank'
import { seededUnit } from './socialStrategyShared'
import { hasRelationshipBoundary } from './reality/relationshipAutonomy'
import {
  ALLIANCE_LIMITS,
  allianceKind,
  currentAllianceCounts,
  isCurrentAlliance,
} from './reality/allianceIdentity'
import {
  isPendingAllianceRequest,
  type AllianceManagementCommand,
} from './reality/allianceManagement'
import { evaluateAllianceStrategicFit } from './reality/allianceStrategicFit'

type Proposal = Extract<AllianceManagementCommand, { type: 'PROPOSE' }>

/** Small, affordable proposals over the same consent/governance commands used by players. */
export function planAiAllianceProposal(state: RootState, actorId: string): Proposal | null {
  const context = allianceManagementContext(state)
  const { reality } = state.social
  const actor = state.game.players.find((player) => player.id === actorId)
  if (
    context.disabled ||
    context.terminal ||
    state.game.weekendInterlude?.active ||
    context.at.day < 2 ||
    context.at.phase !== 'social_1' ||
    context.activeActorIds.length < 5 ||
    !actor ||
    actor.isUser ||
    !context.activeActorIds.includes(actorId)
  )
    return null

  const requests = Object.values(reality.allianceManagement.requests)
  // One approach per contestant per day, and time to respect a refusal.
  if (
    requests.some(
      (request) =>
        request.proposerId === actorId &&
        (isPendingAllianceRequest(request) || request.createdAt.day === context.at.day)
    )
  )
    return null
  if (
    requests.filter(
      (request) =>
        ['FOUND', 'ADMIT', 'APPOINT'].includes(request.kind) &&
        request.createdAt.day === context.at.day
    ).length >= 2
  )
    return null
  const personality = getSocialPersonality(actorId)
  const initiative = 0.45 + personality.socialEnergy * 0.35
  if (seededUnit(context.seed, `group-initiative:${context.at.day}:${actorId}`) > initiative)
    return null

  const groups = Object.values(reality.alliances).filter(
    (entry) =>
      isCurrentAlliance(entry) &&
      allianceKind(entry) === 'GROUP' &&
      entry.memberIds.includes(actorId)
  )
  const ledGroup = groups.find((entry) => entry.leaderId === actorId && entry.fractureRisk < 0.7)
  if (ledGroup && !ledGroup.coLeaderId && ledGroup.memberIds.length >= 4) {
    const deputy = ledGroup.memberIds
      .filter((id) => id !== actorId && context.activeActorIds.includes(id))
      .filter(
        (id) =>
          (reality.relationships[actorId]?.[id]?.trust ?? 0) >= 10 &&
          (ledGroup.memberCommitment[id] ?? 0) >= 0.5
      )
      .sort(
        (a, b) =>
          (ledGroup.memberCommitment[b] ?? 0) - (ledGroup.memberCommitment[a] ?? 0) ||
          a.localeCompare(b)
      )[0]
    if (deputy)
      return {
        type: 'PROPOSE',
        kind: 'APPOINT',
        actorId,
        allianceId: ledGroup.id,
        candidateId: deputy,
      }
  }
  if (ledGroup && ledGroup.memberIds.length >= ALLIANCE_LIMITS.groupMembers) return null
  if (!ledGroup && groups.length >= ALLIANCE_LIMITS.groupsPerMember) return null

  const candidates = context.activeActorIds
    .filter(
      (id) =>
        id !== actorId &&
        !ledGroup?.memberIds.includes(id) &&
        !ledGroup?.currentTargetIds.includes(id) &&
        currentAllianceCounts(reality, id).groups < ALLIANCE_LIMITS.groupsPerMember &&
        !hasRelationshipBoundary(reality, id, actorId, 'NO_ALLIANCE_PITCHES') &&
        !hasRelationshipBoundary(reality, id, actorId, 'MINIMIZE_CONTACT')
    )
    .map((id) => {
      // Only the recruiter's own relationship read enters their decision.
      const edge = reality.relationships[actorId]?.[id]
      const affinity = state.social.relationships[actorId]?.[id]?.affinity ?? 0
      const fit = evaluateAllianceStrategicFit(reality, context, actorId, [id])
      const score =
        Math.max(affinity, edge?.warmth ?? 0) * 0.035 +
        (edge?.trust ?? 0) * 0.035 +
        (edge?.reliability ?? 0) * 0.02 +
        (edge?.strategicValue ?? 0) * 0.025 -
        (edge?.resentment ?? 0) * 0.04 -
        (edge?.suspicion ?? 0) * 0.025 +
        fit.modifier * 4
      return { id, score, edge, affinity }
    })
    .filter(
      ({ score, edge, affinity }) =>
        score >= 0.35 &&
        (edge?.trust ?? 0) > -15 &&
        (edge?.resentment ?? 0) < 40 &&
        (affinity >= 4 || (edge?.trust ?? 0) >= 6 || (edge?.strategicValue ?? 0) >= 12)
    )
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))

  let proposal: Proposal
  if (ledGroup) {
    const candidate = candidates.find(
      ({ id }) =>
        !requests.some(
          (request) =>
            request.kind === 'ADMIT' &&
            request.allianceId === ledGroup.id &&
            request.candidateId === id &&
            (isPendingAllianceRequest(request) || request.createdAt.day >= context.at.day - 1)
        )
    )
    if (!candidate) return null
    proposal = {
      type: 'PROPOSE',
      kind: 'ADMIT',
      actorId,
      allianceId: ledGroup.id,
      candidateId: candidate.id,
    }
  } else {
    if (candidates.length < 2) return null
    // Start with three. Further growth must pass the existing member vote and invitee consent.
    const partners = candidates.slice(0, 2).map(({ id }) => id)
    if (groups.some((group) => partners.every((id) => group.memberIds.includes(id)))) {
      const outsider = candidates.find(
        ({ id }) => !groups.some((group) => group.memberIds.includes(id))
      )
      if (!outsider) return null
      partners[1] = outsider.id
    }
    const memberIds = [actorId, ...partners]
    if (groups.some((group) => memberIds.every((id) => group.memberIds.includes(id)))) return null
    if (
      requests.some(
        (request) =>
          request.kind === 'FOUND' &&
          memberIds.every((id) => request.memberIds.includes(id)) &&
          (isPendingAllianceRequest(request) || request.createdAt.day >= context.at.day - 1)
      )
    )
      return null
    proposal = {
      type: 'PROPOSE',
      kind: 'FOUND',
      actorId,
      memberIds,
      purpose:
        'Compare plans, share information and protect one another while keeping individual decisions.',
    }
  }
  const price = allianceProposalPrice(proposal)!
  if (
    (state.social.energyBank[actorId] ?? 0) < price.energy ||
    (state.social.influenceBank[actorId] ?? 0) < price.influence
  )
    return null
  return proposal
}
