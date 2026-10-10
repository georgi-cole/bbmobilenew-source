import { addRealityFact, learnRealityFact } from './knowledge'
import { compareRealityClock, resolveRealityPromise } from './commitments'
import { appendRealityEvent } from './events'
import { remember } from './memory'
import { applyRealityRelationshipChange, getRealityRelationship } from './relationships'
import {
  createDirectedRelationship,
  createRealityContestantState,
  createRealityPerception,
} from './state'
import { reconcileNemesisWithVoluntarySafety } from './relationshipAutonomy'
import { evaluateRelationshipViolation } from '../relationshipViolation'
import { getActiveFacadeAgreement } from './facadeAgreements'
import { getDecisionRelationshipTags } from './decisionRelationships'
import {
  adjustRealityAllianceCommitment,
  captureRealityReentryProfile,
  recordRealityAllianceBetrayal,
  recordRealityAlliancePlanDefiance,
  removeRealityAllianceMembers,
} from './relationshipForms'
import type {
  RealityClock,
  RealityDomainState,
  RealityJuryEvaluation,
  RealityPerception,
  RealitySocialEvent,
  RealityVoteIntent,
} from './types'

const clamp = (value: number, minimum = -100, maximum = 100) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export type RealityCeremonyKind =
  | 'POWER_WON'
  | 'NOMINATIONS_LOCKED'
  | 'SAFETY_USED'
  | 'SAFETY_DECLINED'
  | 'VOTE_CAST'
  | 'VOTES_REVEALED'
  | 'EVICTION'
  | 'JURY_VOTE'

export interface RealityCeremonyInput extends RealityClock {
  kind: RealityCeremonyKind
  actorId?: string
  targetIds: string[]
  participantIds?: string[]
  witnessIds: string[]
  reason?: string
  tags?: string[]
  /** Complete legal alternatives at decision time, when the host has them. */
  eligibleAlternativeIds?: string[]
  automaticTargetIds?: string[]
  nominationStage?: 'INITIAL_NOMINATION' | 'REPLACEMENT'
  relationshipTagsByTarget?: Record<string, string[]>
  /** Accepted dialogue promises, captured before their compatibility records resolve. */
  acceptedPromiseTargetIds?: string[]
  /** Nominees the holder could save at this decision, including a possible self-save. */
  safetyEligibleTargetIds?: string[]
  safetyDecisionComplete?: boolean
  publicEligible: boolean
}

function contestant(state: RealityDomainState, actorId: string) {
  state.contestants[actorId] ??= createRealityContestantState(actorId)
  return state.contestants[actorId]
}

function perception(state: RealityDomainState, actorId: string): RealityPerception {
  state.publicPerception[actorId] ??= createRealityPerception()
  return state.publicPerception[actorId]
}

function updatePerception(
  state: RealityDomainState,
  actorId: string,
  eventId: string,
  deltas: Partial<Omit<RealityPerception, 'sourceEventIds'>>
): void {
  const current = perception(state, actorId)
  for (const [key, value] of Object.entries(deltas) as Array<
    [keyof Omit<RealityPerception, 'sourceEventIds'>, number]
  >) {
    current[key] = clamp(current[key] + value)
  }
  current.sourceEventIds = [...new Set([...current.sourceEventIds, eventId])].slice(-80)
}

function projectPublicCeremony(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind
): void {
  if (!event.publicEligible) return
  const actorId = event.actorId
  if (actorId) {
    if (kind === 'POWER_WON') {
      updatePerception(state, actorId, event.id, {
        competitionRespect: 8,
        strategicRespect: 2,
        entertainment: 2,
      })
    } else if (kind === 'SAFETY_USED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 5,
        loyalty: event.tags.includes('protected_ally') ? 8 : 2,
        entertainment: 3,
      })
    } else if (kind === 'SAFETY_DECLINED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 1,
        loyalty: -3,
        controversy: 3,
      })
    } else if (kind === 'NOMINATIONS_LOCKED') {
      updatePerception(state, actorId, event.id, {
        strategicRespect: 4,
        controversy: event.tags.includes('betrayal') ? 10 : 2,
        loyalty: event.tags.includes('betrayal') ? -8 : 0,
      })
    } else if (kind === 'JURY_VOTE') {
      updatePerception(state, actorId, event.id, { authenticity: 2 })
    }
  }
  if (kind === 'EVICTION') {
    for (const targetId of event.targetIds)
      captureRealityReentryProfile(state, targetId, { day: event.day, phase: event.phase })
    for (const targetId of event.targetIds) {
      updatePerception(state, targetId, event.id, {
        underdog: 8,
        likability: 2,
      })
    }
  }
}

function rememberOfficialCeremony(
  state: RealityDomainState,
  event: RealitySocialEvent,
  factId: string
): void {
  const owners = [...new Set([...event.participantIds, ...event.witnessIds])]
  for (const ownerId of owners) {
    const memory = {
      id: `memory:${ownerId}:${event.id}`,
      ownerId,
      eventId: event.id,
      day: event.day,
      phase: event.phase,
      participantIds: [...event.participantIds],
      sourceType: 'OFFICIAL' as const,
      sourceChain: [],
      confidence: 1,
      importance: event.type.includes('EVICTION') ? 1 : 0.82,
      surprise: event.tags.includes('blindside') ? 0.9 : 0.35,
      emotionalValence: event.outcome === 'FAILURE' ? -0.55 : 0,
      emotionalIntensity: event.type.includes('EVICTION') ? 0.9 : 0.68,
      secrecy: 0,
      strategicRelevance: 1,
      visibility: event.visibility,
      tags: [...event.tags, 'official', 'ceremony'],
      relatedPromiseIds: [...event.relatedPromiseIds],
      relatedSecretIds: [],
      recallStrength: 1,
    }
    remember(state, memory)
    learnRealityFact(state, { ownerId, factId, memory, confidence: 1 })
  }
}

function resolveCeremonyPromises(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind,
  input: RealityCeremonyInput
): void {
  const activePromises = () =>
    Object.values(state.promises).filter((promise) => promise.status === 'ACTIVE')

  const resolveAndAttach = (promiseId: string, status: 'KEPT' | 'BROKEN' | 'VOID') => {
    const resolved = resolveRealityPromise(
      state,
      promiseId,
      status,
      { day: event.day, phase: event.phase },
      event.id,
      {
        skipAllianceConsequence: state.events.some(
          (candidate) =>
            candidate.type === 'ALLIANCE_BETRAYAL' &&
            candidate.actorId === event.actorId &&
            candidate.reason.endsWith(`:${event.id}`) &&
            candidate.targetIds.some((id) => state.promises[promiseId]?.beneficiaryIds.includes(id))
        ),
      }
    )
    if (resolved && !event.relatedPromiseIds.includes(promiseId)) {
      event.relatedPromiseIds.push(promiseId)
    }
  }

  if (kind === 'NOMINATIONS_LOCKED' && event.actorId) {
    for (const promise of activePromises()) {
      if (promise.promisorId !== event.actorId || promise.kind !== 'protect') continue
      const beneficiaryId = promise.beneficiaryIds[0]
      if (!beneficiaryId) continue
      if (
        input.automaticTargetIds?.includes(beneficiaryId) ||
        (event.targetIds.includes(beneficiaryId) && input.eligibleAlternativeIds?.length === 0) ||
        (input.eligibleAlternativeIds &&
          !event.targetIds.includes(beneficiaryId) &&
          !input.eligibleAlternativeIds.includes(beneficiaryId)) ||
        getActiveFacadeAgreement(
          state,
          event.actorId,
          beneficiaryId,
          event.day,
          input.nominationStage ?? 'INITIAL_NOMINATION'
        )
      ) {
        resolveAndAttach(promise.id, 'VOID')
        continue
      }
      resolveAndAttach(promise.id, event.targetIds.includes(beneficiaryId) ? 'BROKEN' : 'KEPT')
    }
  }

  if ((kind === 'SAFETY_USED' || kind === 'SAFETY_DECLINED') && event.actorId) {
    const latestNomination = [...state.events]
      .reverse()
      .find(
        (candidate) =>
          candidate.day === event.day && candidate.type === 'CEREMONY_NOMINATIONS_LOCKED'
      )

    for (const promise of activePromises()) {
      if (promise.promisorId !== event.actorId) continue
      if (
        input.safetyDecisionComplete === false &&
        !event.targetIds.some((id) => promise.beneficiaryIds.includes(id))
      )
        continue

      const safetyBeneficiary = promise.beneficiaryIds[0]
      if (
        ['protect', 'use_safety_on_player'].includes(promise.kind) &&
        safetyBeneficiary &&
        input.safetyEligibleTargetIds &&
        !input.safetyEligibleTargetIds.includes(safetyBeneficiary)
      ) {
        resolveAndAttach(promise.id, 'VOID')
        continue
      }

      if (promise.kind === 'use_safety_on_player') {
        const beneficiaryId = promise.beneficiaryIds[0]
        if (!beneficiaryId) continue
        resolveAndAttach(
          promise.id,
          kind === 'SAFETY_USED' && event.targetIds.includes(beneficiaryId) ? 'KEPT' : 'BROKEN'
        )
        continue
      }

      if (promise.kind === 'hold_safety') {
        resolveAndAttach(promise.id, kind === 'SAFETY_DECLINED' ? 'KEPT' : 'BROKEN')
        continue
      }

      if (promise.kind === 'protect') {
        const beneficiaryId = promise.beneficiaryIds[0]
        if (!beneficiaryId) continue
        if (kind === 'SAFETY_USED' && event.targetIds.includes(beneficiaryId)) {
          resolveAndAttach(promise.id, 'KEPT')
        } else if (
          (kind === 'SAFETY_DECLINED' && event.targetIds.includes(beneficiaryId)) ||
          (kind === 'SAFETY_USED' &&
            (input.safetyEligibleTargetIds ?? latestNomination?.targetIds)?.includes(beneficiaryId))
        ) {
          resolveAndAttach(promise.id, 'BROKEN')
        }
      }
    }
  }

  if (kind === 'EVICTION') {
    for (const promise of activePromises()) {
      if (
        promise.deadline &&
        compareRealityClock(promise.deadline, {
          day: event.day,
          phase: event.phase,
        }) <= 0
      ) {
        // No relevant power/vote opportunity ever resolved this promise. Do not
        // reward or punish a contestant for an obligation the game never gave
        // them a chance to act on, but never leave it active into future days.
        resolveAndAttach(promise.id, 'VOID')
      }
    }
  }
}

function applyAllianceSafetyCommitment(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind
): void {
  const actorId = event.actorId
  if (!actorId || (kind !== 'SAFETY_USED' && kind !== 'SAFETY_DECLINED')) return

  const affectedByAlliance = new Map<string, Set<string>>()
  for (const targetId of event.targetIds) {
    if (targetId === actorId) continue
    if (event.tags.includes(`consented_safety:${targetId}`)) continue
    if (
      kind === 'SAFETY_USED' &&
      state.events.some(
        (candidate) =>
          candidate.id !== event.id &&
          candidate.type === 'CEREMONY_SAFETY_USED' &&
          candidate.day === event.day &&
          candidate.actorId === actorId &&
          candidate.targetIds.includes(targetId)
      )
    )
      continue
    for (const alliance of Object.values(state.alliances)) {
      if (
        alliance.status === 'DISSOLVED' ||
        !alliance.memberIds.includes(actorId) ||
        !alliance.memberIds.includes(targetId)
      ) {
        continue
      }
      const targets = affectedByAlliance.get(alliance.id) ?? new Set<string>()
      targets.add(targetId)
      affectedByAlliance.set(alliance.id, targets)
    }
  }

  for (const [allianceId, targetIds] of affectedByAlliance) {
    if (
      state.events.some(
        (candidate) =>
          candidate.type === 'ALLIANCE_BETRAYAL' &&
          candidate.actorId === actorId &&
          candidate.reason.endsWith(`:${event.id}`) &&
          candidate.reason.includes(`:${allianceId}:`)
      )
    )
      continue
    adjustRealityAllianceCommitment(
      state,
      allianceId,
      actorId,
      kind === 'SAFETY_USED' ? 0.08 : -0.06
    )
    for (const targetId of targetIds) {
      if (
        kind === 'SAFETY_USED' &&
        state.events.some(
          (candidate) =>
            candidate.id !== event.id &&
            candidate.type === 'CEREMONY_SAFETY_USED' &&
            candidate.day === event.day &&
            candidate.actorId === actorId &&
            candidate.targetIds.includes(targetId)
        )
      )
        continue
      adjustRealityAllianceCommitment(
        state,
        allianceId,
        targetId,
        kind === 'SAFETY_USED' ? 0.04 : -0.03
      )
    }
  }
}

function hasAcceptedProtectionPromise(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  kinds: string[]
): boolean {
  return Object.values(state.promises).some(
    (promise) =>
      promise.status === 'ACTIVE' &&
      promise.promisorId === actorId &&
      promise.beneficiaryIds.includes(targetId) &&
      kinds.includes(promise.kind)
  )
}

function applyDecisionFallout(
  state: RealityDomainState,
  event: Pick<RealitySocialEvent, 'id' | 'actorId' | 'day' | 'phase'>,
  targetId: string,
  kind: 'NOMINATION' | 'SAFETY_ABANDON' | 'VOTE',
  violation: ReturnType<typeof evaluateRelationshipViolation>
): void {
  if (!event.actorId || violation.classification === 'NONE') return
  if (violation.classification === 'BETRAYAL') {
    const affected = recordRealityAllianceBetrayal(state, {
      actorId: event.actorId,
      targetId,
      kind,
      at: { day: event.day, phase: event.phase },
      sourceEventId: event.id,
    })
    // The pact handler owns both commitment and relationship fallout. Romance
    // and promises without a shared pact still need one relationship consequence.
    if (affected.length > 0) return
  }
  const severe =
    violation.classification === 'BETRAYAL' || violation.classification === 'BROKEN_PROMISE'
  const scale = severe ? 1 : violation.forcedChoice ? 0.35 : 0.55
  applyRealityRelationshipChange(state, {
    sourceId: targetId,
    targetId: event.actorId,
    eventId: event.id,
    day: event.day,
    phase: event.phase,
    anchor: severe ? 'negative' : undefined,
    deltas: {
      warmth: -8 * scale,
      trust: -18 * scale,
      loyalty: severe ? -20 : 0,
      resentment: 20 * scale,
      suspicion: 12 * scale,
      reliability: severe ? -18 : 0,
    },
  })
}

function applyCeremonyAftermath(
  state: RealityDomainState,
  event: RealitySocialEvent,
  kind: RealityCeremonyKind,
  input: RealityCeremonyInput
): void {
  const actorId = event.actorId
  if (kind === 'POWER_WON' && actorId) {
    const winner = contestant(state, actorId)
    winner.confidence = clamp(winner.confidence + 14)
    winner.emotions.joy = clamp(winner.emotions.joy + 18, 0, 100)
    winner.primaryGoalId = 'USE_POWER_WITHOUT_CREATING_UNNECESSARY_ENEMIES'
    if (event.publicEligible) {
      for (const witnessId of event.witnessIds) {
        if (witnessId === actorId) continue
        applyRealityRelationshipChange(state, {
          sourceId: witnessId,
          targetId: actorId,
          day: event.day,
          phase: event.phase,
          eventId: event.id,
          deltas: { respect: 5 },
        })
      }
    }
  }

  if (kind === 'NOMINATIONS_LOCKED') {
    if (actorId) contestant(state, actorId).primaryGoalId = 'MANAGE_NOMINATION_FALLOUT'
    for (const targetId of event.targetIds) {
      const nominee = contestant(state, targetId)
      nominee.stress = clamp(nominee.stress + 24, 0, 100)
      nominee.emotions.fear = clamp(nominee.emotions.fear + 20, 0, 100)
      nominee.primaryGoalId = 'SURVIVE_THE_VOTE'
      if (!actorId || input.automaticTargetIds?.includes(targetId)) continue
      const tags = (id: string) =>
        getDecisionRelationshipTags(state, actorId, id, input.relationshipTagsByTarget?.[id])
      const consent = getActiveFacadeAgreement(
        state,
        actorId,
        targetId,
        event.day,
        input.nominationStage ?? 'INITIAL_NOMINATION'
      )
      const violation = evaluateRelationshipViolation({
        actorId,
        targetId,
        actionType: 'NOMINATION',
        relationshipTags: tags(targetId),
        eligibleAlternatives: input.eligibleAlternativeIds?.map((id) => ({
          id,
          relationshipTags: tags(id),
        })),
        facadeAgreement: consent,
        promiseBroken:
          hasAcceptedProtectionPromise(state, actorId, targetId, ['protect']) ||
          input.acceptedPromiseTargetIds?.includes(targetId),
      })
      if (violation.consentProtected) event.tags.push(`consented_nominee:${targetId}`)
      if (violation.forcedChoice) event.tags.push(`forced_nominee:${targetId}`)
      applyDecisionFallout(state, event, targetId, 'NOMINATION', violation)
    }
  }

  if (kind === 'SAFETY_USED' && actorId) {
    contestant(state, actorId).primaryGoalId = 'MANAGE_SAFETY_FALLOUT'
    for (const savedId of event.targetIds) {
      if (savedId === actorId) continue
      if (
        state.events.some(
          (candidate) =>
            candidate.id !== event.id &&
            candidate.type === 'CEREMONY_SAFETY_USED' &&
            candidate.day === event.day &&
            candidate.actorId === actorId &&
            candidate.targetIds.includes(savedId)
        )
      )
        continue
      const saved = contestant(state, savedId)
      saved.stress = clamp(saved.stress - 22, 0, 100)
      saved.emotions.gratitude = clamp(saved.emotions.gratitude + 25, 0, 100)
      saved.primaryGoalId = 'REPAY_SAFETY_DEBT'
      applyRealityRelationshipChange(state, {
        sourceId: savedId,
        targetId: actorId,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor: 'positive',
        deltas: {
          // Gratitude is intentionally much stronger than the visible
          // relationship movement: a save creates a debt, not instant best
          // friends or an implicit alliance.
          warmth: 5,
          trust: 6,
          loyalty: 5,
          gratitude: 35,
          reliability: 4,
        },
      })
      applyRealityRelationshipChange(state, {
        sourceId: actorId,
        targetId: savedId,
        day: event.day,
        phase: event.phase,
        eventId: event.id,
        anchor: 'positive',
        deltas: { warmth: 3, trust: 4, loyalty: 3, reliability: 2 },
      })
    }
  }

  if (
    (kind === 'SAFETY_DECLINED' || kind === 'SAFETY_USED') &&
    actorId &&
    input.safetyDecisionComplete !== false
  ) {
    const candidates =
      input.safetyEligibleTargetIds ?? (kind === 'SAFETY_DECLINED' ? event.targetIds : [])
    contestant(state, actorId).primaryGoalId = 'DEFEND_SAFETY_DECISION'
    for (const targetId of candidates) {
      if (targetId === actorId || (kind === 'SAFETY_USED' && event.targetIds.includes(targetId)))
        continue
      contestant(state, targetId).primaryGoalId = 'FIND_LAST_MINUTE_VOTES'
      const tags = (id: string) =>
        getDecisionRelationshipTags(state, actorId, id, input.relationshipTagsByTarget?.[id])
      const promised =
        hasAcceptedProtectionPromise(state, actorId, targetId, [
          'protect',
          'use_safety_on_player',
        ]) || input.acceptedPromiseTargetIds?.includes(targetId)
      const chosenIds = kind === 'SAFETY_USED' ? event.targetIds : candidates
      const violation = evaluateRelationshipViolation({
        actorId,
        targetId,
        actionType: 'SAFETY_ABANDON',
        relationshipTags: tags(targetId),
        eligibleAlternatives: chosenIds.map((id) => ({
          id,
          relationshipTags: id === actorId ? ['ride_or_die'] : tags(id),
        })),
        promiseBroken: promised,
        actionConsented:
          kind === 'SAFETY_DECLINED' &&
          hasAcceptedProtectionPromise(state, actorId, targetId, ['hold_safety']),
      })
      if (violation.consentProtected) event.tags.push(`consented_safety:${targetId}`)
      applyDecisionFallout(state, event, targetId, 'SAFETY_ABANDON', violation)
    }
  }

  if (kind === 'VOTES_REVEALED') {
    for (const actor of Object.values(state.contestants)) {
      actor.primaryGoalId = event.targetIds.includes(actor.actorId)
        ? 'PROCESS_VOTE_OUTCOME'
        : 'REASSESS_HOUSE_AFTER_VOTE'
    }
  }

  if (kind === 'EVICTION') {
    for (const targetId of event.targetIds) {
      const evictee = contestant(state, targetId)
      evictee.stress = clamp(evictee.stress + 28, 0, 100)
      evictee.emotions.sadness = clamp(evictee.emotions.sadness + 35, 0, 100)
      evictee.primaryGoalId = 'EVALUATE_JURY_VOTE'
    }
    removeRealityAllianceMembers(state, {
      memberIds: event.targetIds,
      at: { day: event.day, phase: event.phase },
      sourceEventId: event.id,
    })
    for (const witnessId of event.witnessIds) {
      if (event.targetIds.includes(witnessId)) continue
      contestant(state, witnessId).primaryGoalId = 'REPLAN_AFTER_EVICTION'
    }
  }
}

export function recordRealityCeremonyOutcome(
  state: RealityDomainState,
  input: RealityCeremonyInput
): RealitySocialEvent {
  const expectedType = `CEREMONY_${input.kind}`
  const targetKey = [...new Set(input.targetIds)].sort().join('|')
  const duplicate = [...state.events]
    .reverse()
    .find(
      (event) =>
        event.day === input.day &&
        event.type === expectedType &&
        event.actorId === input.actorId &&
        (input.kind !== 'NOMINATIONS_LOCKED' ||
          (event.tags.find((tag) => tag.startsWith('nomination_stage:')) ??
            'nomination_stage:INITIAL_NOMINATION') ===
            `nomination_stage:${input.nominationStage ?? 'INITIAL_NOMINATION'}`) &&
        (!input.kind.startsWith('SAFETY_') ||
          (event.tags.find((tag) => tag.startsWith('safety_decision:')) ??
            'safety_decision:complete') ===
            `safety_decision:${input.safetyDecisionComplete === false ? 'partial' : 'complete'}`) &&
        [...event.targetIds].sort().join('|') === targetKey
    )
  if (duplicate) return duplicate
  const sequence = state.nextSequence
  const eventId = `reality-event-${sequence}`
  const factId = `fact:ceremony:${sequence}`
  const participants = [
    ...(input.participantIds ?? []),
    ...(input.actorId ? [input.actorId] : []),
    ...input.targetIds,
  ]
  const event = appendRealityEvent(state, {
    day: input.day,
    phase: input.phase,
    type: expectedType,
    actorId: input.actorId,
    targetIds: input.targetIds,
    participantIds: participants,
    witnessIds: input.witnessIds,
    visibility: 'CEREMONY_PUBLIC',
    outcome: 'SYSTEM',
    reason: input.reason ?? input.kind.toLowerCase().replaceAll('_', ' '),
    tags: [
      ...(input.tags ?? []),
      'ceremony',
      input.kind.toLowerCase(),
      ...(input.automaticTargetIds ?? []).map((id) => `automatic_nominee:${id}`),
      ...(input.nominationStage ? [`nomination_stage:${input.nominationStage}`] : []),
      ...(input.kind.startsWith('SAFETY_')
        ? [`safety_decision:${input.safetyDecisionComplete === false ? 'partial' : 'complete'}`]
        : []),
    ],
    relatedFactIds: [factId],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: input.publicEligible,
    juryEligible: true,
  })
  addRealityFact(state, {
    id: factId,
    propositionType: `CEREMONY_${input.kind}`,
    subjectIds: input.actorId ? [input.actorId, ...input.targetIds] : input.targetIds,
    value: input.reason ?? true,
    day: input.day,
    phase: input.phase,
    visibility: 'CEREMONY_PUBLIC',
    participantIds: event.participantIds,
    witnessIds: event.witnessIds,
    viewerVisible: true,
    publicVisible: input.publicEligible,
    juryVisible: true,
    sourceEventId: eventId,
  })
  rememberOfficialCeremony(state, event, factId)
  applyCeremonyAftermath(state, event, input.kind, input)
  resolveCeremonyPromises(state, event, input.kind, input)
  applyAllianceSafetyCommitment(state, event, input.kind)
  if (input.kind === 'SAFETY_USED') {
    reconcileNemesisWithVoluntarySafety(state, {
      actorId: input.actorId,
      savedIds: input.targetIds,
      eventId: event.id,
      at: { day: input.day, phase: input.phase },
    })
  }
  projectPublicCeremony(state, event, input.kind)
  return event
}

function reinforceAllianceVotePlan(
  state: RealityDomainState,
  actorId: string,
  targetId: string
): void {
  for (const alliance of Object.values(state.alliances)) {
    if (
      (alliance.status !== 'ACTIVE' && alliance.status !== 'PROBATIONARY') ||
      !alliance.memberIds.includes(actorId) ||
      alliance.memberIds.includes(targetId) ||
      !alliance.currentTargetIds.includes(targetId)
    ) {
      continue
    }
    const knowsPlan =
      alliance.leaderIds.includes(actorId) ||
      (alliance.memberPlanBeliefs[actorId] ?? []).some((planId) => planId.includes(targetId))
    if (!knowsPlan) continue
    adjustRealityAllianceCommitment(state, alliance.id, actorId, 0.04)
  }
}

function voteIntent(state: RealityDomainState, actorId: string, day: number): RealityVoteIntent {
  state.voteIntents[actorId] ??= {
    actorId,
    confidence: 0,
    reasonEventIds: [],
    day,
  }
  return state.voteIntents[actorId]
}

export function setRealityStatedVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  day: number,
  reasonEventId?: string
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, day)
  intent.statedTargetId = targetId
  intent.day = day
  if (reasonEventId) intent.reasonEventIds = [...new Set([...intent.reasonEventIds, reasonEventId])]
  return intent
}

export function setRealityIntendedVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  day: number,
  confidence: number,
  reasonEventId?: string
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, day)
  intent.intendedTargetId = targetId
  intent.confidence = clamp01(confidence)
  intent.day = day
  if (reasonEventId) intent.reasonEventIds = [...new Set([...intent.reasonEventIds, reasonEventId])]
  return intent
}

export function finalizeRealityVote(
  state: RealityDomainState,
  actorId: string,
  targetId: string,
  at: RealityClock,
  eventId: string,
  eligibleTargetIds?: string[],
  options: {
    revealed?: boolean
    relationshipTagsByTarget?: Record<string, string[]>
    acceptedPromiseTargetIds?: string[]
  } = {}
): RealityVoteIntent {
  const intent = voteIntent(state, actorId, at.day)
  const consequenceKey = `vote-consequence:${at.day}:${targetId}`
  const alreadyRecordedSameVote = intent.reasonEventIds.includes(consequenceKey)
  intent.actualTargetId = targetId
  intent.day = at.day
  intent.reasonEventIds = [...new Set([...intent.reasonEventIds, eventId])]
  // Actual ballots are private truth. Tally announcements do not reveal who
  // cast them; relationships and alliance knowledge wait for evidence.
  if (options.revealed === false || alreadyRecordedSameVote) return intent
  intent.reasonEventIds.push(consequenceKey)
  recordRealityCeremonyOutcome(state, {
    kind: 'VOTE_CAST',
    actorId,
    targetIds: [targetId],
    day: at.day,
    phase: at.phase,
    witnessIds: [],
    reason: 'An individual eviction vote was revealed.',
    publicEligible: false,
  })
  const relationshipTags = (candidateId: string) =>
    getDecisionRelationshipTags(
      state,
      actorId,
      candidateId,
      options.relationshipTagsByTarget?.[candidateId]
    )
  const promiseBroken =
    options.acceptedPromiseTargetIds?.includes(targetId) ||
    Object.values(state.promises).some(
      (promise) =>
        promise.promisorId === actorId &&
        promise.beneficiaryIds.includes(targetId) &&
        ['protect', 'vote_to_keep', 'tie_break_keep'].includes(promise.kind) &&
        promise.status === 'ACTIVE'
    )
  const violation = evaluateRelationshipViolation({
    actorId,
    targetId,
    actionType: 'VOTE',
    relationshipTags: relationshipTags(targetId),
    ...(eligibleTargetIds
      ? {
          eligibleAlternatives: eligibleTargetIds.map((id) => ({
            id,
            relationshipTags: relationshipTags(id),
          })),
        }
      : {}),
    promiseBroken,
  })
  applyDecisionFallout(
    state,
    { id: eventId, actorId, day: at.day, phase: at.phase },
    targetId,
    'VOTE',
    violation
  )
  if (!alreadyRecordedSameVote) {
    recordRealityAlliancePlanDefiance(state, {
      actorId,
      actualTargetId: targetId,
      at,
      sourceEventId: eventId,
      eligibleTargetIds,
    })
    reinforceAllianceVotePlan(state, actorId, targetId)
  }
  for (const promise of Object.values(state.promises)) {
    if (promise.promisorId !== actorId || promise.status !== 'ACTIVE') {
      continue
    }

    if (['protect', 'vote_to_keep', 'tie_break_keep'].includes(promise.kind)) {
      const beneficiaryId = promise.beneficiaryIds[0]
      if (!beneficiaryId) continue
      const unavailable =
        eligibleTargetIds !== undefined && !eligibleTargetIds.includes(beneficiaryId)
      resolveRealityPromise(
        state,
        promise.id,
        unavailable ? 'VOID' : targetId === beneficiaryId ? 'BROKEN' : 'KEPT',
        at,
        eventId,
        {
          skipAllianceConsequence:
            targetId === beneficiaryId && violation.classification === 'BETRAYAL',
        }
      )
      continue
    }

    if (!promise.kind.toLowerCase().includes('vote')) continue
    const promisedTarget =
      typeof promise.scope.targetId === 'string'
        ? promise.scope.targetId
        : typeof promise.scope.voteTargetId === 'string'
          ? promise.scope.voteTargetId
          : undefined
    if (!promisedTarget) continue
    resolveRealityPromise(
      state,
      promise.id,
      promisedTarget === targetId ? 'KEPT' : 'BROKEN',
      at,
      eventId
    )
  }
  return intent
}

export function scoreRealityNominationCandidate(
  state: RealityDomainState,
  actorId: string,
  targetId: string
): number {
  const edge = getRealityRelationship(state, actorId, targetId)
  const reverse = getRealityRelationship(state, targetId, actorId)
  const allianceProtection = Object.values(state.alliances).some(
    (alliance) =>
      alliance.status === 'ACTIVE' &&
      alliance.memberIds.includes(actorId) &&
      alliance.memberIds.includes(targetId)
  )
  const promiseProtection = Object.values(state.promises).some(
    (promise) =>
      promise.promisorId === actorId &&
      promise.beneficiaryIds.includes(targetId) &&
      promise.status === 'ACTIVE'
  )
  const beliefThreat = Object.values(state.beliefsByOwner[actorId] ?? {})
    .filter(
      (belief) =>
        belief.subjectIds.includes(targetId) &&
        belief.status === 'ACTIVE' &&
        /threat|target|power/i.test(belief.propositionType)
    )
    .reduce((sum, belief) => sum + belief.confidence * 12, 0)
  return (
    edge.perceivedThreat * 0.55 +
    edge.suspicion * 0.25 +
    edge.resentment * 0.2 -
    edge.trust * 0.28 -
    edge.loyalty * 0.35 -
    reverse.reliability * 0.08 +
    beliefThreat -
    (allianceProtection ? 32 : 0) -
    (promiseProtection ? 28 : 0)
  )
}

export function scoreRealitySafetyDecision(
  state: RealityDomainState,
  holderId: string,
  nomineeId: string
): number {
  const edge = getRealityRelationship(state, holderId, nomineeId)
  const reciprocal = getRealityRelationship(state, nomineeId, holderId)
  const alliance = Object.values(state.alliances).some(
    (entry) =>
      entry.status === 'ACTIVE' &&
      entry.memberIds.includes(holderId) &&
      entry.memberIds.includes(nomineeId)
  )
  const debt = Object.values(state.debts).some(
    (entry) =>
      entry.status === 'OPEN' && entry.debtorId === holderId && entry.creditorId === nomineeId
  )
  return (
    edge.loyalty * 0.42 +
    edge.trust * 0.25 +
    edge.gratitude * 0.18 +
    reciprocal.strategicValue * 0.12 -
    edge.perceivedThreat * 0.28 -
    edge.resentment * 0.2 +
    (alliance ? 24 : 0) +
    (debt ? 18 : 0)
  )
}

function eventKnownToJuror(event: RealitySocialEvent, jurorId: string): boolean {
  if (event.participantIds.includes(jurorId) || event.witnessIds.includes(jurorId)) return true
  return (
    event.visibility === 'HOUSE_PUBLIC' ||
    event.visibility === 'CEREMONY_PUBLIC' ||
    event.visibility === 'JURY_ONLY'
  )
}

function automaticGoodbyeQuality(
  state: RealityDomainState,
  jurorId: string,
  finalistId: string
): number {
  const eviction = [...state.events]
    .reverse()
    .find((event) => event.type === 'CEREMONY_EVICTION' && event.targetIds.includes(jurorId))
  if (!eviction) return 0

  const relationship = getRealityRelationship(state, jurorId, finalistId)
  let score =
    relationship.warmth * 0.08 +
    relationship.trust * 0.08 +
    relationship.reliability * 0.06 +
    relationship.gratitude * 0.05 -
    relationship.resentment * 0.1

  const exitWindow = state.events.filter(
    (event) =>
      event.day >= Math.max(1, eviction.day - 1) &&
      event.day <= eviction.day &&
      event.actorId === finalistId &&
      eventKnownToJuror(event, jurorId)
  )

  if (
    exitWindow.some(
      (event) =>
        event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
        event.targetIds.includes(jurorId) &&
        !event.tags.includes(`automatic_nominee:${jurorId}`) &&
        !event.tags.includes(`consented_nominee:${jurorId}`)
    )
  ) {
    score -= 14
  }
  if (
    exitWindow.some(
      (event) => event.type === 'CEREMONY_SAFETY_USED' && event.targetIds.includes(jurorId)
    )
  ) {
    score += 18
  }
  if (
    exitWindow.some(
      (event) => event.type === 'CEREMONY_SAFETY_DECLINED' && event.targetIds.includes(jurorId)
    )
  ) {
    score -= 8
  }
  if (
    exitWindow.some(
      (event) =>
        event.targetIds.includes(jurorId) &&
        (event.type === 'ALLIANCE_BETRAYAL' ||
          event.tags.some((tag) => /betray|blindside|lie|broken/i.test(tag)))
    )
  ) {
    score -= 12
  }

  const voteIntent = state.voteIntents[finalistId]
  if (
    voteIntent?.day === eviction.day &&
    voteIntent.actualTargetId === jurorId &&
    exitWindow.some(
      (event) => event.type === 'CEREMONY_VOTE_CAST' && event.targetIds.includes(jurorId)
    )
  ) {
    score -= 16
  }

  for (const promise of Object.values(state.promises)) {
    if (
      promise.promisorId !== finalistId ||
      !promise.beneficiaryIds.includes(jurorId) ||
      promise.resolvedAt?.day !== eviction.day
    ) {
      continue
    }
    const stake = Math.max(0, Math.min(1, promise.stakes))
    if (promise.status === 'KEPT') score += 5 + stake * 7
    if (promise.status === 'BROKEN') score -= 8 + stake * 10
  }

  return clamp(score, -100, 100)
}

export function computeRealityJuryEvaluation(
  state: RealityDomainState,
  jurorId: string,
  finalistId: string,
  persist = true
): RealityJuryEvaluation {
  // Scorecard reads commonly run while building a Redux action from a frozen
  // store snapshot. Do not create a missing relationship edge on that read
  // path; only the persisted evaluation below is allowed to mutate state.
  const relationship = persist
    ? getRealityRelationship(state, jurorId, finalistId)
    : (state.relationships[jurorId]?.[finalistId] ??
      createDirectedRelationship(jurorId, finalistId))
  const sourceEvents = state.events.filter(
    (event) =>
      event.juryEligible &&
      eventKnownToJuror(event, jurorId) &&
      (event.actorId === finalistId || event.targetIds.includes(finalistId))
  )
  const betrayalEvents = sourceEvents.filter(
    (event) =>
      event.actorId === finalistId &&
      event.targetIds.includes(jurorId) &&
      event.tags.some((tag) => /betray|blindside|lie|broken/i.test(tag))
  )
  const ownedMoves = sourceEvents.filter(
    (event) =>
      event.actorId === finalistId && event.outcome !== 'FAILURE' && event.outcome !== 'IGNORED'
  )
  const competitionWins = sourceEvents.filter(
    (event) => event.actorId === finalistId && event.type === 'CEREMONY_POWER_WON'
  )
  const grievance = Object.values(state.grievances)
    .filter(
      (entry) =>
        entry.holderId === jurorId && entry.againstId === finalistId && entry.status !== 'RESOLVED'
    )
    .reduce((sum, entry) => sum + entry.severity, 0)
  const evaluation: RealityJuryEvaluation = {
    jurorId,
    finalistId,
    personalAffinity: clamp(
      relationship.warmth * 0.45 +
        relationship.trust * 0.35 +
        relationship.respect * 0.2 -
        relationship.resentment * 0.45
    ),
    strategicRespect: clamp(
      relationship.respect * 0.35 + relationship.perceivedThreat * 0.25 + ownedMoves.length * 5
    ),
    competitionRespect: clamp(competitionWins.length * 16),
    betrayalResentment: clamp(
      relationship.resentment * 0.6 + betrayalEvents.length * 16 + grievance * 0.35,
      0,
      100
    ),
    fairness: clamp(
      relationship.reliability * 0.5 + relationship.trust * 0.35 - betrayalEvents.length * 12
    ),
    ownership: clamp(ownedMoves.length * 7),
    goodbyeQuality: automaticGoodbyeQuality(state, jurorId, finalistId),
    finalAnswerQuality: 0,
    sourceEventIds: sourceEvents.map((event) => event.id).slice(-80),
  }
  const existingIndex = state.juryEvaluations.findIndex(
    (entry) => entry.jurorId === jurorId && entry.finalistId === finalistId
  )
  if (existingIndex >= 0) {
    const previous = state.juryEvaluations[existingIndex]
    evaluation.finalAnswerQuality = previous.finalAnswerQuality
    if (persist) state.juryEvaluations[existingIndex] = evaluation
  } else if (persist) {
    state.juryEvaluations.push(evaluation)
  }
  return evaluation
}

export function realityJuryEvaluationScore(evaluation: RealityJuryEvaluation): number {
  return (
    evaluation.personalAffinity * 0.24 +
    evaluation.strategicRespect * 0.24 +
    evaluation.competitionRespect * 0.12 +
    evaluation.fairness * 0.12 +
    evaluation.ownership * 0.14 +
    evaluation.goodbyeQuality * 0.06 +
    evaluation.finalAnswerQuality * 0.08 -
    evaluation.betrayalResentment * 0.22
  )
}

export function generateRealityJuryQuestion(evaluation: RealityJuryEvaluation): string {
  const weaknesses = [
    {
      value: evaluation.betrayalResentment,
      text: 'Which betrayal do you regret most, and why should the jury forgive it?',
    },
    {
      value: 100 - evaluation.ownership,
      text: 'Name the move that was truly yours and explain how it changed the season.',
    },
    {
      value: 100 - evaluation.fairness,
      text: 'Why should we reward your game when some of us felt disposable to you?',
    },
    {
      value: 100 - evaluation.strategicRespect,
      text: 'What was your strategy beyond surviving one round at a time?',
    },
  ]
  return weaknesses.sort((left, right) => right.value - left.value)[0].text
}
