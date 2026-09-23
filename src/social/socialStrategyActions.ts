import {
  applyRealityRelationshipDelta,
  learnRealityKnowledge,
  recordIntelligenceDelivery,
} from './socialSlice'
import { makeIntelMemory, selectIntelFactForActor } from './intelligenceSystem'
import type { SocialActionLogEntry } from './types'
import {
  seededUnit,
  strategyAffinity,
  strategyHumanPlayer,
  strategyTags,
  type StrategyApi,
  type StrategyState,
} from './socialStrategyShared'

const REPAIR_ACTIONS = new Set([
  'compliment',
  'reassure',
  'whisper',
  'build_quiet_bond',
  'share_personal_story',
  'group_chat',
])

const STRATEGIC_NUDGES: Record<
  string,
  { suspicion: number; perceivedThreat: number; trust: number; warmth?: number }
> = {
  pitch_target: { suspicion: 8, perceivedThreat: 12, trust: -4, warmth: -2 },
  suggest_replacement: { suspicion: 6, perceivedThreat: 10, trust: -3, warmth: -1 },
  rally_votes_against: { suspicion: 7, perceivedThreat: 11, trust: -4, warmth: -2 },
  warn_about_player: { suspicion: 10, perceivedThreat: 7, trust: -3, warmth: -1 },
}

function repairSuspicion(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  if (!REPAIR_ACTIONS.has(entry.actionId) || entry.outcome !== 'success') return

  const targetIds = entry.targetIds?.length ? entry.targetIds : [entry.targetId]
  for (const targetId of [...new Set(targetIds)]) {
    if (!targetId || targetId === entry.actorId) continue
    const edge = state.social.reality?.relationships?.[targetId]?.[entry.actorId]
    if (!edge || ((edge.suspicion ?? 0) <= 4 && (edge.reliability ?? 0) >= 0)) continue

    const groupScale = entry.actionId === 'group_chat' ? 0.55 : 1
    api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: targetId,
        targetId: entry.actorId,
        day: entry.week ?? state.game.week,
        phase: entry.phase ?? state.game.phase,
        eventId: `social-strategy:repair:${entry.timestamp}:${targetId}:${entry.actorId}`,
        meaningful: false,
        deltas: {
          suspicion: -Math.round(10 * groupScale),
          perceivedThreat: -Math.round(3 * groupScale),
          trust: Math.round(4 * groupScale),
          reliability: Math.round(5 * groupScale),
          warmth: Math.round(3 * groupScale),
        },
      })
    )
  }
}

function applyStrategicNudge(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  const nudge = STRATEGIC_NUDGES[entry.actionId]
  if (!nudge || entry.outcome !== 'success' || !entry.subjectId || !entry.targetId) return
  if (entry.subjectId === entry.targetId) return

  api.dispatch(
    applyRealityRelationshipDelta({
      sourceId: entry.targetId,
      targetId: entry.subjectId,
      day: entry.week ?? state.game.week,
      phase: entry.phase ?? state.game.phase,
      eventId: `social-strategy:nudge:${entry.timestamp}:${entry.actionId}:${entry.targetId}:${entry.subjectId}`,
      meaningful: false,
      deltas: nudge,
    })
  )
}

export function getSuggestedReplacementAcceptanceChance(
  state: StrategyState,
  entry: SocialActionLogEntry
): number {
  const lohId = entry.targetId
  const trust = strategyAffinity(state, lohId, entry.actorId)
  const requesterTags = strategyTags(state, lohId, entry.actorId)
  const candidateTags = strategyTags(state, lohId, entry.subjectId ?? '')
  const candidateAffinity = strategyAffinity(state, lohId, entry.subjectId ?? '')
  const influence = Math.min(5, state.social.influenceBank[entry.actorId] ?? 0)
  const allianceBonus =
    requesterTags.has('alliance') || requesterTags.has('primary_alliance') ? 0.24 : 0
  const promiseBonus =
    requesterTags.has('protection') || requesterTags.has('safety_promise') ? 0.1 : 0
  const candidateResistance =
    candidateTags.has('alliance') || candidateTags.has('protection') ? -0.24 : 0
  const candidatePressure = Math.max(-0.08, Math.min(0.22, -candidateAffinity / 450))
  return Math.max(
    0.05,
    Math.min(
      0.92,
      0.12 +
        ((trust + 100) / 200) * 0.38 +
        allianceBonus +
        promiseBonus +
        influence * 0.03 +
        candidatePressure +
        candidateResistance
    )
  )
}

function adoptSuggestedReplacement(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  if (
    entry.actionId !== 'suggest_replacement' ||
    entry.outcome !== 'success' ||
    !entry.subjectId ||
    entry.targetId !== state.game.lohId
  ) {
    return
  }
  const plan = state.game.lohNominationPlan
  const candidate = state.game.players.find((player) => player.id === entry.subjectId)
  if (
    !plan ||
    plan.week !== state.game.week ||
    plan.strategy === 'backdoor' ||
    !candidate ||
    candidate.status !== 'active' ||
    state.game.nomineeIds.includes(candidate.id) ||
    candidate.id === state.game.posWinnerId ||
    (state.game.povProtectedIds ?? []).includes(candidate.id)
  ) {
    return
  }

  const chance = getSuggestedReplacementAcceptanceChance(state, entry)
  const draw = seededUnit(
    state.game.seed,
    `replacement-suggestion:${entry.timestamp}:${entry.actorId}:${candidate.id}`
  )
  if (draw > chance) return

  api.dispatch({
    type: 'game/adoptSuggestedReplacementTarget',
    payload: { lohId: entry.targetId, targetId: candidate.id, suggestedById: entry.actorId },
  })
}

function deliverKnownIntel(input: {
  api: StrategyApi
  state: StrategyState
  sourceId: string
  recipientId: string
  day: number
  phase: string
  timestamp: number
  confidenceScale: number
  deliveryKind: 'shared' | 'whispered'
}): boolean {
  const selected = selectIntelFactForActor(
    input.state.social.reality,
    input.sourceId,
    input.recipientId,
    input.day
  )
  if (!selected) return false

  const confidence = Math.max(
    0.35,
    Math.min(0.9, selected.belief.confidence * input.confidenceScale)
  )
  input.api.dispatch(
    learnRealityKnowledge({
      ownerId: input.recipientId,
      factId: selected.fact.id,
      confidence,
      memory: makeIntelMemory({
        ownerId: input.recipientId,
        fact: selected.fact,
        sourceType: 'HEARSAY',
        sourceChain: [input.sourceId],
        confidence,
        day: input.day,
        phase: input.phase,
      }),
    })
  )
  input.api.dispatch(
    recordIntelligenceDelivery({
      id: `intel-delivery:${input.deliveryKind}:${input.timestamp}:${input.recipientId}:${selected.fact.id}`,
      factId: selected.fact.id,
      channel: 'social_action',
      day: input.day,
      recipientId: input.recipientId,
    })
  )

  if (
    selected.fact.propositionType === 'TARGETING' &&
    selected.fact.objectId === input.recipientId &&
    selected.fact.subjectIds[0] &&
    selected.fact.subjectIds[0] !== input.recipientId
  ) {
    input.api.dispatch(
      applyRealityRelationshipDelta({
        sourceId: input.recipientId,
        targetId: selected.fact.subjectIds[0],
        day: input.day,
        phase: input.phase,
        eventId: `social-strategy:intel-reaction:${input.timestamp}:${selected.fact.id}`,
        meaningful: false,
        deltas: {
          suspicion: 12,
          perceivedThreat: 10,
          trust: -6,
          warmth: -3,
        },
      })
    )
  }

  return true
}

function applyConcreteIntelPayoff(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry,
  humanId: string
): void {
  if (entry.outcome !== 'success' || !entry.targetId) return

  const day = entry.week ?? state.game.week
  const phase = entry.phase ?? state.game.phase
  if (entry.actionId === 'share_intel') {
    deliverKnownIntel({
      api,
      state,
      sourceId: humanId,
      recipientId: entry.targetId,
      day,
      phase,
      timestamp: entry.timestamp,
      confidenceScale: 0.82,
      deliveryKind: 'shared',
    })
    return
  }

  if (entry.actionId === 'whisper') {
    deliverKnownIntel({
      api,
      state,
      sourceId: entry.targetId,
      recipientId: humanId,
      day,
      phase,
      timestamp: entry.timestamp,
      confidenceScale: 0.78,
      deliveryKind: 'whispered',
    })
  }
}

export function processHumanSocialStrategyAction(
  api: StrategyApi,
  state: StrategyState,
  entry: SocialActionLogEntry
): void {
  const human = strategyHumanPlayer(state)
  if (!human || entry.actorId !== human.id || entry.source === 'system') return

  repairSuspicion(api, state, entry)
  applyStrategicNudge(api, state, entry)
  adoptSuggestedReplacement(api, state, entry)
  applyConcreteIntelPayoff(api, state, entry, human.id)
}
