import type { RealityActionContract } from './actionContract'
import {
  getCanonicalRelationshipTags,
  selectCanonicalRelationshipView,
} from '../relationshipSemantics'
import type { RealityContext, RealityDomainState, RealityResponseResolution } from './types'
import { isSafetyProtectionOffer } from '../protectionOffer'

export type { RealityResponseKind, RealityResponseResolution } from './types'

export function resolveRealityTargetResponse(input: {
  action: RealityActionContract
  actorId: string
  targetId: string
  reality: RealityDomainState
  context?: Pick<RealityContext, 'atRiskActorIds' | 'day'> &
    Partial<Pick<RealityContext, 'phase' | 'rolesByActor'>>
  draw: number
  acceptanceChanceOverride?: number
  /** The promisor's current plan contradicts the protection promise. */
  promiseContradicted?: boolean
}): RealityResponseResolution {
  const edge = input.reality.relationships[input.targetId]?.[input.actorId]
  const trust = edge?.trust ?? 0
  const warmth = edge?.warmth ?? 0
  const loyalty = edge?.loyalty ?? 0
  const suspicion = edge?.suspicion ?? 0
  const resentment = edge?.resentment ?? 0
  const threat = edge?.perceivedThreat ?? 0
  if (input.action.purposes.includes('CONFLICT')) {
    const escalation = (resentment + threat - trust) / 240
    if (input.draw < Math.max(0.08, escalation)) {
      return {
        kind: 'ESCALATE',
        utility: escalation,
        reason: 'target_resentment_and_threat',
        accepted: false,
      }
    }
    if (input.draw > 0.82) {
      return { kind: 'WALK_AWAY', utility: 0.2, reason: 'target_avoids_conflict', accepted: false }
    }
    return {
      kind: 'DE_ESCALATE',
      utility: 0.35,
      reason: 'target_contains_conflict',
      accepted: false,
    }
  }
  if (input.acceptanceChanceOverride !== undefined) {
    const chance = Math.max(0.02, Math.min(1, input.acceptanceChanceOverride))
    if (input.draw < chance) {
      return {
        kind: 'ACCEPT',
        utility: chance,
        reason: 'phase_scoped_repetition_landed',
        accepted: true,
      }
    }
    return {
      kind: input.draw > 0.96 ? 'QUESTION' : 'REJECT',
      utility: chance - 0.5,
      reason: chance <= 0.02 ? 'repetition_felt_forced' : 'social_approach_did_not_land',
      accepted: false,
    }
  }
  let acceptance =
    0.42 + trust / 260 + warmth / 360 + loyalty / 420 - suspicion / 250 - resentment / 300
  if (input.action.id === 'protect') {
    const safetySave = isSafetyProtectionOffer({
      phase: input.context?.phase,
      actorHoldsSafety:
        input.context?.rolesByActor?.[input.actorId]?.some((role) =>
          role.split('+').includes('pos')
        ) === true,
      targetIsNominated: input.context?.atRiskActorIds.includes(input.targetId) === true,
    })
    // A nominee can welcome an available save without already trusting or
    // befriending its holder. The promise is judged when Safety is played.
    if (safetySave && !input.promiseContradicted) {
      return {
        kind: 'ACCEPT',
        utility: 1,
        reason: 'nominee_welcomes_available_safety_save',
        accepted: true,
      }
    }
    const relationshipTags = getCanonicalRelationshipTags({
      reality: input.reality,
      actorId: input.actorId,
      targetId: input.targetId,
    })
    const targetToActor = input.reality.relationships[input.targetId]?.[input.actorId]
    const actorToTarget = input.reality.relationships[input.actorId]?.[input.targetId]
    const pairEdges = [targetToActor, actorToTarget].filter(Boolean)
    const hasActiveNemesis = Object.values(input.reality.relationshipAutonomy.nemeses).some(
      (nemesis) =>
        nemesis.status === 'ACTIVE' &&
        ((nemesis.ownerId === input.actorId && nemesis.targetId === input.targetId) ||
          (nemesis.ownerId === input.targetId && nemesis.targetId === input.actorId))
    )
    const contextDay = input.context?.day
    const recentFight =
      contextDay !== undefined &&
      input.reality.events.some(
        (event) =>
          event.day >= contextDay - 1 &&
          event.tags.includes('CONFLICT') &&
          event.participantIds.includes(input.actorId) &&
          event.participantIds.includes(input.targetId)
      )
    const formalAlly =
      selectCanonicalRelationshipView({
        reality: input.reality,
        actorId: input.actorId,
        targetId: input.targetId,
      }).alliance?.operational === true
    const relationshipIsStrained =
      relationshipTags.has('rivalry') ||
      relationshipTags.has('betrayal') ||
      hasActiveNemesis ||
      recentFight ||
      pairEdges.some(
        (edge) =>
          edge?.perceivedLabel === 'ENEMY' ||
          edge?.perceivedLabel === 'RIVAL' ||
          ((edge?.trust ?? 0) <= 18 &&
            ((edge?.resentment ?? 0) >= 18 || (edge?.suspicion ?? 0) >= 22)) ||
          (edge?.acuteTension ?? 0) >= 35
      )
    const targetIsAtRisk = input.context?.atRiskActorIds.includes(input.targetId) === true

    // An uncontradicted promise from a trusted, active ally is reassuring when
    // the recipient is on the block. Refusal remains possible when there is
    // recent conflict, a damaged bond, or evidence that the promisor is still
    // targeting them.
    if (formalAlly && targetIsAtRisk && !relationshipIsStrained && !input.promiseContradicted) {
      return {
        kind: 'ACCEPT',
        utility: 1,
        reason: 'trusted_ally_promised_vote_protection',
        accepted: true,
      }
    }

    if (!relationshipIsStrained && !input.promiseContradicted) {
      if (formalAlly) acceptance += 0.18
      if (targetIsAtRisk) acceptance += 0.08
    } else {
      if (relationshipIsStrained) acceptance -= 0.18
      if (input.promiseContradicted) acceptance -= 0.28
    }
  }
  if (input.draw < Math.max(0.04, Math.min(0.92, acceptance))) {
    return {
      kind: 'ACCEPT',
      utility: acceptance,
      reason: 'relationship_supports_acceptance',
      accepted: true,
    }
  }
  if (input.action.purposes.includes('COMMITMENT') || input.action.purposes.includes('PERSUADE')) {
    if (input.draw < Math.min(0.97, acceptance + 0.22)) {
      return {
        kind: 'COUNTER',
        utility: acceptance - 0.05,
        reason: 'target_demands_better_terms',
        accepted: false,
      }
    }
    if (suspicion > 45 && input.draw > 0.88) {
      return { kind: 'LIE', utility: 0.1, reason: 'target_conceals_intent', accepted: false }
    }
  }
  if (input.action.purposes.includes('INFORMATION')) {
    return suspicion > 45 && input.draw > 0.72
      ? { kind: 'LIE', utility: 0.1, reason: 'target_conceals_intent', accepted: false }
      : {
          kind: 'QUESTION',
          utility: acceptance,
          reason: 'target_gives_an_uncertain_answer',
          accepted: false,
        }
  }
  return {
    kind: input.draw > 0.9 ? 'QUESTION' : 'REJECT',
    utility: acceptance,
    reason: input.draw > 0.9 ? 'target_requests_evidence' : 'target_rejects_risk',
    accepted: false,
  }
}
