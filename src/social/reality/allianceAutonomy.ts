import { buildStrategicThreatSnapshot } from '../strategicThreat'
import {
  isPendingAllianceRequest,
  manageAlliance,
  type AllianceManagementContext,
} from './allianceManagement'
import { allianceKind, getCurrentPact, isCurrentAlliance } from './allianceIdentity'
import { holdRealityAllianceStrategyMeeting } from './relationshipForms'
import type { RealityAlliance, RealityDomainState } from './types'

interface AllianceTargetRead {
  actorId: string
  score: number
  observedInfluence: number
  observedCompetitionThreat: number
}

interface AllianceTargetCandidate {
  actorId: string
  score: number
  observedInfluence: number
  observedCompetitionThreat: number
  isAtRisk: boolean
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0))
}

function planId(kind: 'target' | 'fallback', actorId: string): string {
  return `${kind}:${actorId}`
}

function aiMembers(alliance: RealityAlliance, context: AllianceManagementContext): string[] {
  return alliance.memberIds.filter(
    (id) => context.activeActorIds.includes(id) && !context.humanActorIds.includes(id)
  )
}

function targetReadsByActor(
  domain: RealityDomainState,
  alliance: RealityAlliance,
  context: AllianceManagementContext,
  candidateIds: readonly string[],
  threatSnapshot: ReturnType<typeof buildStrategicThreatSnapshot>
): Record<string, AllianceTargetRead> {
  const result: Record<string, AllianceTargetRead> = {}
  for (const candidateId of candidateIds) {
    const readers = alliance.memberIds
      .map((observerId) => ({
        observerId,
        read: threatSnapshot[observerId]?.[candidateId],
      }))
      .filter((entry) => entry.read !== undefined)
    const bestRead = readers
      .map((entry) => ({ actorId: entry.observerId, score: entry.read!.score }))
      .sort(
        (left, right) => right.score - left.score || left.actorId.localeCompare(right.actorId)
      )[0]
    const relationshipRisk = alliance.memberIds.reduce((sum, memberId) => {
      const edge = domain.relationships[memberId]?.[candidateId]
      if (!edge) return sum
      return (
        sum +
        edge.perceivedThreat * 0.035 +
        edge.suspicion * 0.025 +
        edge.resentment * 0.02 +
        edge.fear * 0.015 -
        Math.max(0, edge.warmth) * 0.012 -
        Math.max(0, edge.loyalty) * 0.01
      )
    }, 0)
    const averageRelationshipRisk = relationshipRisk / Math.max(1, alliance.memberIds.length)
    const best = bestRead ?? { actorId: alliance.memberIds[0] ?? '', score: 0 }
    const observedInfluence = clamp(best.score / 12)
    const observedCompetitionThreat = Math.max(
      0,
      context.competitionThreatByActorId?.[candidateId] ?? 0
    )
    result[candidateId] = {
      actorId: best.actorId,
      observedInfluence,
      observedCompetitionThreat,
      score: best.score * 0.42 + averageRelationshipRisk + observedCompetitionThreat,
    }
  }
  return result
}

function rankAllianceTargets(
  domain: RealityDomainState,
  alliance: RealityAlliance,
  context: AllianceManagementContext,
  threatSnapshot: ReturnType<typeof buildStrategicThreatSnapshot>
): AllianceTargetCandidate[] {
  const activeMemberIds = new Set(
    alliance.memberIds.filter((id) => context.activeActorIds.includes(id))
  )
  const outsiders = context.activeActorIds.filter((id) => !activeMemberIds.has(id))
  const outsiderIds = new Set(outsiders)
  const atRiskIds = [...new Set(context.atRiskActorIds ?? [])].filter((id) => outsiderIds.has(id))
  // During a live vote window, factions react to the block that is actually in front of them.
  // In other phases they can build a longer-term target list from witnessed influence.
  const candidateIds = atRiskIds.length > 0 ? atRiskIds : outsiders
  const reads = targetReadsByActor(domain, alliance, context, candidateIds, threatSnapshot)
  return candidateIds
    .map((actorId) => {
      const read = reads[actorId]
      return {
        actorId,
        score: read.score + (atRiskIds.includes(actorId) ? 2.2 : 0),
        observedInfluence: read.observedInfluence,
        observedCompetitionThreat: read.observedCompetitionThreat,
        isAtRisk: atRiskIds.includes(actorId),
      }
    })
    .sort((left, right) => right.score - left.score || left.actorId.localeCompare(right.actorId))
}

function selectAllianceTargets(
  alliance: RealityAlliance,
  ranked: AllianceTargetCandidate[],
  context: AllianceManagementContext
): AllianceTargetCandidate[] {
  if (ranked.length === 0) return []
  const priorTargetId = alliance.currentTargetIds.find((id) =>
    ranked.some((entry) => entry.actorId === id)
  )
  const priorTarget = ranked.find((entry) => entry.actorId === priorTargetId)
  const leading = ranked[0]
  // Keep an existing agenda unless a materially stronger rival or a changed block calls for a move.
  const chosen =
    priorTarget &&
    !leading.isAtRisk &&
    context.at.phase !== 'social_2' &&
    leading.score < priorTarget.score + 1.6
      ? priorTarget
      : leading
  const alternatives = ranked.filter((entry) => entry.actorId !== chosen.actorId)
  const priorFallbackId = alliance.fallbackTargetIds.find((id) =>
    alternatives.some((entry) => entry.actorId === id)
  )
  const priorFallback = alternatives.find((entry) => entry.actorId === priorFallbackId)
  const fallback =
    priorFallback && !chosen.isAtRisk && priorFallback.score >= alternatives[0]?.score - 1.2
      ? priorFallback
      : alternatives[0]
  return [chosen, ...(fallback ? [fallback] : [])]
}

function targetReason(read: AllianceTargetCandidate, context: AllianceManagementContext): string {
  const name = context.displayNames?.[read.actorId] ?? read.actorId
  if (read.isAtRisk)
    return `${name} is on the current block, so the alliance can act on that vote now.`
  const evidence = [
    ...(read.observedInfluence >= 0.25
      ? [`has repeatedly shaped social decisions the alliance has witnessed`]
      : []),
    ...(read.observedCompetitionThreat >= 1 ? [`has looked strong in recent competitions`] : []),
  ]
  if (evidence.length > 0) return `${name} ${evidence.join(' and ')}.`
  return `${name} appears strategically dangerous from the members’ relationships and recent events.`
}

function planBeliefs(
  domain: RealityDomainState,
  alliance: RealityAlliance,
  selected: AllianceTargetCandidate[]
): Record<string, string[]> {
  const primary = selected[0]
  const fallback = selected[1]
  const beliefs: Record<string, string[]> = {}
  for (const memberId of alliance.memberIds) {
    if (!primary) {
      beliefs[memberId] = []
      continue
    }
    const edge = domain.relationships[memberId]?.[primary.actorId]
    const personallyProtective = Boolean(
      edge &&
      (edge.warmth >= 58 || edge.loyalty >= 42 || edge.attraction >= 42 || edge.intimacy >= 35)
    )
    beliefs[memberId] = personallyProtective
      ? fallback
        ? [planId('fallback', fallback.actorId)]
        : []
      : [
          planId('target', primary.actorId),
          ...(fallback ? [planId('fallback', fallback.actorId)] : []),
        ]
  }
  return beliefs
}

function strategySummary(
  selected: AllianceTargetCandidate[],
  context: AllianceManagementContext
): string {
  if (selected.length === 0) return 'The members could not agree on a useful target this round.'
  const targetName = context.displayNames?.[selected[0].actorId] ?? selected[0].actorId
  const alternate = selected[1]
    ? ` They kept ${context.displayNames?.[selected[1].actorId] ?? selected[1].actorId} as an alternative.`
    : ''
  return `The members compared witnessed social influence, personal ties, and the current vote. They chose ${targetName}: ${targetReason(selected[0], context)}${alternate} Individual members may still protect someone they care about.`
}

function chooseRecruitment(
  domain: RealityDomainState,
  alliance: RealityAlliance,
  context: AllianceManagementContext,
  selectedTargetId?: string
): void {
  if (context.at.phase !== 'social_1' || alliance.memberIds.length >= 6) return
  const hasPendingRequest = Object.values(domain.allianceManagement.requests).some(
    (request) =>
      isPendingAllianceRequest(request) &&
      request.allianceId === alliance.id &&
      request.kind === 'ADMIT'
  )
  if (hasPendingRequest) return

  const eligibleRecruiters = aiMembers(alliance, context)
    .filter((id) =>
      allianceKind(alliance) === 'PACT' ? true : (alliance.memberCommitment[id] ?? 0) >= 0.4
    )
    .sort(
      (left, right) =>
        Number(right === alliance.leaderId) - Number(left === alliance.leaderId) ||
        (alliance.memberCommitment[right] ?? 0) - (alliance.memberCommitment[left] ?? 0) ||
        left.localeCompare(right)
    )
  const recruiterId = eligibleRecruiters[0]
  if (!recruiterId) return

  const candidate = context.activeActorIds
    .filter(
      (id) =>
        id !== recruiterId &&
        !alliance.memberIds.includes(id) &&
        id !== selectedTargetId &&
        (allianceKind(alliance) !== 'GROUP' || alliance.memberIds.length < 6)
    )
    .map((id) => {
      const edge = domain.relationships[recruiterId]?.[id]
      const towardTarget = selectedTargetId
        ? domain.relationships[id]?.[selectedTargetId]
        : undefined
      const score =
        (edge?.trust ?? 0) * 0.03 +
        (edge?.loyalty ?? 0) * 0.018 +
        (edge?.reliability ?? 0) * 0.012 +
        (edge?.strategicValue ?? 0) * 0.022 -
        (edge?.suspicion ?? 0) * 0.012 +
        ((towardTarget?.resentment ?? 0) + (towardTarget?.perceivedThreat ?? 0)) * 0.009
      return { id, score, trust: edge?.trust ?? 0, strategicValue: edge?.strategicValue ?? 0 }
    })
    .filter((entry) => entry.trust >= 18 || entry.strategicValue >= 34)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0]
  if (!candidate || candidate.score < 1.15) return

  if (allianceKind(alliance) === 'GROUP') {
    manageAlliance(
      domain,
      {
        type: 'PROPOSE',
        kind: 'ADMIT',
        actorId: recruiterId,
        allianceId: alliance.id,
        candidateId: candidate.id,
      },
      context
    )
    return
  }

  if (alliance.provenance === 'UNRESOLVED' || getCurrentPact(domain, recruiterId, candidate.id))
    return
  manageAlliance(
    domain,
    {
      type: 'PROPOSE',
      kind: 'FOUND',
      actorId: recruiterId,
      memberIds: [...alliance.memberIds, candidate.id],
      basePactId: alliance.id,
    },
    context
  )
}

/**
 * Let each AI-led faction review a durable agenda once per social window.
 * Targets come from the members’ observer-specific evidence, while meetings and
 * admission requests continue to use Reality’s existing alliance systems.
 */
export function evaluateAllianceAutonomy(
  domain: RealityDomainState,
  context: AllianceManagementContext
): boolean {
  const phaseReceipt = `ai-alliance:${context.at.day}:${context.at.phase}`
  if (
    context.disabled ||
    context.terminal ||
    !['social_1', 'social_2'].includes(context.at.phase) ||
    domain.allianceManagement.processedCommands[phaseReceipt]
  )
    return false

  domain.allianceManagement.processedCommands[phaseReceipt] = {
    status: 'APPLIED',
    reason: 'AI factions reviewed threats, vote plans, and recruitment opportunities.',
  }
  const players = [
    ...context.activeActorIds.map((id) => ({ id, status: 'active' })),
    ...(context.juryActorIds ?? []).map((id) => ({ id, status: 'jury' })),
  ]
  const threatSnapshot = buildStrategicThreatSnapshot({ reality: domain, players })
  const alliances = Object.values(domain.alliances)
    .filter(
      (entry) =>
        isCurrentAlliance(entry) &&
        (entry.status === 'ACTIVE' || entry.status === 'PROBATIONARY') &&
        aiMembers(entry, context).length >= 2
    )
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const alliance of alliances) {
    const ranked = rankAllianceTargets(domain, alliance, context, threatSnapshot)
    const selected = selectAllianceTargets(alliance, ranked, context)
    if (selected.length > 0) {
      const targetIds = selected.slice(0, 1).map((entry) => entry.actorId)
      const fallbackTargetIds = selected.slice(1, 2).map((entry) => entry.actorId)
      const targetChanged =
        targetIds[0] !== alliance.currentTargetIds[0] ||
        fallbackTargetIds[0] !== alliance.fallbackTargetIds[0]
      if (targetChanged || !alliance.lastMeeting) {
        const aiAttendees = aiMembers(alliance, context)
        // Human members retain their vote and aren't penalized as absentees.
        const excusedAbsentIds = alliance.memberIds.filter((id) =>
          context.humanActorIds.includes(id)
        )
        const callerId = aiAttendees.includes(alliance.leaderId ?? '')
          ? alliance.leaderId!
          : [...aiAttendees].sort(
              (left, right) =>
                (alliance.memberCommitment[right] ?? 0) - (alliance.memberCommitment[left] ?? 0) ||
                left.localeCompare(right)
            )[0]
        holdRealityAllianceStrategyMeeting(domain, {
          allianceId: alliance.id,
          callerId,
          attendeeIds: aiAttendees,
          targetIds,
          fallbackTargetIds,
          planIds: [
            planId('target', targetIds[0]),
            ...fallbackTargetIds.map((id) => planId('fallback', id)),
          ],
          memberPlanBeliefs: planBeliefs(domain, alliance, selected),
          agenda: context.at.phase === 'social_2' ? 'VOTE_REALIGNMENT' : 'THREAT_REVIEW',
          consultationSummary: strategySummary(selected, context),
          at: context.at,
          sourceEventId: `autonomous-agenda:${alliance.id}:${context.at.day}:${context.at.phase}`,
          excusedAbsentIds,
        })
      }
    }
    chooseRecruitment(domain, alliance, context, selected[0]?.actorId)
  }

  // Keep the prior low-commitment exit behavior, while allowing every faction
  // to make its own choice instead of limiting the whole house to one request.
  for (const actorId of context.activeActorIds
    .filter((id) => !context.humanActorIds.includes(id))
    .sort()) {
    const exhausted = Object.values(domain.alliances).find(
      (entry) =>
        isCurrentAlliance(entry) &&
        entry.memberIds.includes(actorId) &&
        (entry.memberCommitment[actorId] ?? 0.5) <= 0.08
    )
    if (exhausted)
      manageAlliance(domain, { type: 'LEAVE', actorId, allianceId: exhausted.id }, context)
  }
  return true
}
