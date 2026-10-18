import { normalizeAffinity } from './affinityUtils'
import { selectIntelFactForActor } from './intelligenceSystem'
import type { DramaAIMove, DramaAIMoveInput } from './dramaModeEngine'
import { DRAMA_MODE_CONFIG } from './dramaModeConfig'
import { getSocialPersonality } from './socialPersonalityBank'
import { getSocialRuntimeConfig } from './socialRuntimeConfig'
import { getPublicDramaActionAvailability, isPublicDramaAction } from './dramaPacing'
import type { SocialActionLogEntry } from './types'
import { isExposableRealitySecretType, resolveRealityAllianceIdForFact } from './reality/knowledge'

const RECENT_ACTION_WINDOW = 64
const RECENT_CONFLICT_EVENT_WINDOW = 48
const CONFLICT_ACTIONS = new Set(['confront', 'startFight', 'public_callout'])

interface DramaCandidate extends DramaAIMove {
  utility: number
  motive:
    | 'survival'
    | 'power'
    | 'loyalty'
    | 'romance'
    | 'conflict'
    | 'intel'
    | 'repair'
    | 'deception'
}

function relation(input: DramaAIMoveInput, sourceId: string, targetId: string): number {
  return normalizeAffinity(input.relationships[sourceId]?.[targetId]?.affinity ?? 0)
}

function hashUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (Math.abs(hash) % 1_000_003) / 1_000_003
}

function recentActionTail(input: DramaAIMoveInput): SocialActionLogEntry[] {
  return (input.recentActions ?? []).slice(-RECENT_ACTION_WINDOW)
}

function conflictCooldownOpen(input: DramaAIMoveInput): boolean {
  const recent = recentActionTail(input)
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const entry = recent[index]
    if (entry.actorId !== input.actorId || !CONFLICT_ACTIONS.has(entry.actionId)) continue
    if (entry.week === undefined) continue
    return input.week - entry.week >= 2
  }
  return true
}

function repeatedThisWeek(input: DramaAIMoveInput, actionId: string, targetId: string): number {
  return recentActionTail(input).filter(
    (entry) =>
      entry.actorId === input.actorId &&
      entry.actionId === actionId &&
      entry.targetId === targetId &&
      entry.week === input.week
  ).length
}

function usedThisWeek(input: DramaAIMoveInput, actionId: string, limit: number): boolean {
  return (
    recentActionTail(input).filter(
      (entry) =>
        entry.actorId === input.actorId && entry.actionId === actionId && entry.week === input.week
    ).length >= limit
  )
}

function hasActiveAlliance(input: DramaAIMoveInput, targetId: string): boolean {
  return Object.values(input.reality?.alliances ?? {}).some(
    (alliance) =>
      (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
      alliance.memberIds.includes(input.actorId) &&
      alliance.memberIds.includes(targetId)
  )
}

function canTradeWith(input: DramaAIMoveInput, targetId: string): boolean {
  if (!input.reality) return false
  return Boolean(
    selectIntelFactForActor(input.reality, input.actorId, targetId, input.week, input.players) ||
    selectIntelFactForActor(input.reality, targetId, input.actorId, input.week, input.players)
  )
}

function bestExposureTarget(
  input: DramaAIMoveInput
):
  | { targetId: string; confidence: number; propositionType: string; allianceId?: string }
  | undefined {
  const domain = input.reality
  if (!domain) return undefined
  const activeAiIds = new Set(
    input.players
      .filter((player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  const exposedFactIds = new Set<string>()
  const exposedAllianceIds = new Set<string>()
  for (const event of domain.events) {
    if (event.actionId !== 'expose_secret') continue
    for (const factId of event.relatedFactIds) {
      exposedFactIds.add(factId)
      const exposedAllianceId = domain.facts[factId]?.objectId
      if (exposedAllianceId) exposedAllianceIds.add(exposedAllianceId)
    }
  }
  const candidates = Object.values(domain.beliefsByOwner[input.actorId] ?? [])
    .filter(
      (belief) =>
        belief.status !== 'DISPROVEN' &&
        belief.status !== 'STALE' &&
        belief.confidence >= DRAMA_MODE_CONFIG.intelligenceStrategy.minExposureConfidence &&
        isExposableRealitySecretType(belief.propositionType)
    )
    .map((belief) => {
      const fact = domain.facts[belief.id.replace(`belief:${input.actorId}:`, '')]
      const durableAllianceFact = Boolean(fact?.objectId && domain.alliances[fact.objectId])
      const allianceId = fact ? resolveRealityAllianceIdForFact(domain, fact) : undefined
      if (
        !fact ||
        (!durableAllianceFact && input.week - belief.lastUpdatedDay > 4) ||
        fact.publicVisible ||
        fact.visibility === 'HOUSE_PUBLIC' ||
        fact.visibility === 'CEREMONY_PUBLIC' ||
        exposedFactIds.has(fact.id) ||
        Boolean(allianceId && exposedAllianceIds.has(allianceId))
      ) {
        return null
      }
      const targetId = fact.subjectIds
        .filter((id) => id !== input.actorId && activeAiIds.has(id))
        .sort(
          (left, right) =>
            relation(input, input.actorId, left) - relation(input, input.actorId, right) ||
            left.localeCompare(right)
        )[0]
      if (!targetId) return null
      return {
        targetId,
        confidence: belief.confidence,
        propositionType: belief.propositionType,
        allianceId,
      }
    })
    .filter(
      (
        entry
      ): entry is {
        targetId: string
        confidence: number
        propositionType: string
        allianceId: string | undefined
      } => entry !== null
    )
  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      Number(Boolean(right.allianceId)) - Number(Boolean(left.allianceId)) ||
      left.targetId.localeCompare(right.targetId)
  )[0]
}

interface RecentConflictSignal {
  targetId: string
  reason: string
  pressure: number
  leadingCausePressure: number
}

function isRecentConflictEvent(
  input: DramaAIMoveInput,
  event: NonNullable<DramaAIMoveInput['reality']>['events'][number],
  maxAge = 14
): boolean {
  const age = input.week - event.day
  return age >= 0 && age <= maxAge
}

function isKnownToActor(
  event: NonNullable<DramaAIMoveInput['reality']>['events'][number],
  actorId: string
): boolean {
  return (
    event.participantIds.includes(actorId) ||
    event.witnessIds.includes(actorId) ||
    (event.publicEligible && ['HOUSE_PUBLIC', 'CEREMONY_PUBLIC'].includes(event.visibility))
  )
}

function addConflictSignal(
  signals: Map<string, RecentConflictSignal>,
  targetId: string | undefined,
  reason: string,
  pressure: number
): void {
  if (!targetId) return
  const current = signals.get(targetId)
  if (!current) {
    signals.set(targetId, { targetId, reason, pressure, leadingCausePressure: pressure })
    return
  }
  current.pressure = Math.min(1.3, current.pressure + Math.min(0.16, pressure * 0.18))
  if (pressure >= current.leadingCausePressure) {
    current.reason = reason
    current.leadingCausePressure = pressure
  }
}

function recentKnownConflictSignals(
  input: DramaAIMoveInput,
  nominees: Set<string>
): RecentConflictSignal[] {
  const events = input.reality?.events.slice(-RECENT_CONFLICT_EVENT_WINDOW) ?? []
  const signals = new Map<string, RecentConflictSignal>()
  const targetingDaysByHoh = new Map<string, Set<number>>()
  const latestNominationByTarget = new Map<string, (typeof events)[number]>()
  for (const event of events) {
    if (event.type !== 'CEREMONY_NOMINATIONS_LOCKED' || !event.actorId) continue
    for (const targetId of event.targetIds) {
      latestNominationByTarget.set(targetId, event)
    }
  }
  for (const event of events) {
    if (
      event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
      isRecentConflictEvent(input, event) &&
      event.actorId &&
      event.targetIds.includes(input.actorId) &&
      !event.tags.includes('automatic_nominee:' + input.actorId) &&
      isKnownToActor(event, input.actorId)
    ) {
      const days = targetingDaysByHoh.get(event.actorId) ?? new Set<number>()
      if (!days.has(event.day)) {
        days.add(event.day)
        targetingDaysByHoh.set(event.actorId, days)
        addConflictSignal(
          signals,
          event.actorId,
          days.size > 1
            ? 'they repeatedly kept you as a target'
            : 'their nomination put you on the block',
          0.68
        )
      }
    }
    if (
      event.type === 'ALLIANCE_BETRAYAL' &&
      isRecentConflictEvent(input, event) &&
      event.actorId &&
      event.actorId !== input.actorId &&
      event.targetIds.includes(input.actorId) &&
      isKnownToActor(event, input.actorId)
    ) {
      addConflictSignal(signals, event.actorId, 'they betrayed your alliance directly', 0.94)
    }
    if (
      event.type === 'ALLIANCE_PLAN_DEFIED' &&
      isRecentConflictEvent(input, event) &&
      event.actorId &&
      event.actorId !== input.actorId &&
      isKnownToActor(event, input.actorId)
    ) {
      addConflictSignal(signals, event.actorId, 'their vote broke a plan you were part of', 0.82)
    }
  }

  const returnEvents = events.filter(
    (event) =>
      event.type === 'ALLIANCE_REENTRY_RECONCILED' &&
      event.actorId === input.actorId &&
      isRecentConflictEvent(input, event)
  )
  for (const returnEvent of returnEvents) {
    for (const targetId of returnEvent.targetIds.slice(0, 2)) {
      addConflictSignal(signals, targetId, 'you returned after they publicly targeted you', 0.94)
    }
    if (returnEvent.targetIds.length === 0) {
      const nomination = latestNominationByTarget.get(input.actorId)
      if (
        nomination?.actorId &&
        isRecentConflictEvent(input, nomination) &&
        !nomination.tags.includes('automatic_nominee:' + input.actorId) &&
        isKnownToActor(nomination, input.actorId)
      ) {
        addConflictSignal(
          signals,
          nomination.actorId,
          'you returned after they publicly targeted you',
          0.88
        )
      }
    }
  }

  for (let index = 0; index < events.length; index += 1) {
    const eviction = events[index]
    if (
      eviction.type !== 'CEREMONY_EVICTION' ||
      !isRecentConflictEvent(input, eviction, 7) ||
      !isKnownToActor(eviction, input.actorId)
    )
      continue
    const evicteeId = eviction.targetIds.find((id) => id !== input.actorId)
    if (!evicteeId) continue
    const romanticArc = input.network.arcs.find(
      (arc) =>
        arc.type === 'romance' &&
        (arc.public || ['established', 'climax'].includes(arc.stage)) &&
        arc.participantIds.includes(input.actorId) &&
        arc.participantIds.includes(evicteeId)
    )
    if (!romanticArc) continue
    const nomination = latestNominationByTarget.get(evicteeId)
    if (
      nomination?.actorId &&
      nomination.actorId !== input.actorId &&
      isRecentConflictEvent(input, nomination) &&
      !nomination.tags.includes('automatic_nominee:' + evicteeId) &&
      isKnownToActor(nomination, input.actorId)
    ) {
      addConflictSignal(
        signals,
        nomination.actorId,
        'the HOH nominated your partner before they were evicted',
        0.86
      )
    }
  }

  if (
    input.phase === 'social_2' &&
    nominees.has(input.actorId) &&
    input.posWinnerId &&
    input.posWinnerId !== input.actorId &&
    !(input.povProtectedIds ?? []).includes(input.actorId) &&
    input.lohId &&
    input.lohId !== input.actorId
  ) {
    const nomination = latestNominationByTarget.get(input.actorId)
    const stillTargetedByLoh =
      nomination?.actorId === input.lohId &&
      isRecentConflictEvent(input, nomination) &&
      !nomination.tags.includes('automatic_nominee:' + input.actorId) &&
      isKnownToActor(nomination, input.actorId)
    if (stillTargetedByLoh) {
      addConflictSignal(signals, input.lohId, 'you are still nominated after missing Safety', 0.94)
    }
  }

  const activeIds = new Set(
    input.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  return [...signals.values()]
    .filter((signal) => activeIds.has(signal.targetId))
    .sort(
      (left, right) =>
        right.pressure - left.pressure ||
        relation(input, input.actorId, left.targetId) -
          relation(input, input.actorId, right.targetId) ||
        left.targetId.localeCompare(right.targetId)
    )
}

function addCausalConflictCandidates(
  candidates: DramaCandidate[],
  input: DramaAIMoveInput,
  nominees: Set<string>,
  personality: ReturnType<typeof getSocialPersonality>
): void {
  const identity = input.players.find((player) => player.id === input.actorId)?.aiGameIdentity
  const archetypeBias =
    identity?.archetype === 'chaos_agent'
      ? 0.16
      : ['aggressive_competitor', 'antihero', 'opportunist', 'risk_taker'].includes(
            identity?.archetype ?? ''
          )
        ? 0.07
        : 0
  const temperamentBias =
    identity?.temperament === 'impulsive' ? 0.1 : identity?.temperament === 'emotional' ? 0.06 : 0
  const willingness =
    personality.dramaSeeking * 0.42 +
    personality.assertiveness * 0.2 +
    personality.emotionalReactivity * 0.16 +
    (1 - personality.forgiveness) * 0.1 +
    personality.publicConflictComfort * 0.12 +
    archetypeBias +
    temperamentBias
  const signals = recentKnownConflictSignals(input, nominees)
  const canGoPublic = getPublicDramaActionAvailability(input.network, input.week).available
  for (const signal of signals.slice(0, 2)) {
    const resentment = input.memory[input.actorId]?.[signal.targetId]?.resentment ?? 0
    const pressure = Math.min(1.4, signal.pressure + Math.max(0, Math.min(0.16, resentment / 250)))
    if (willingness < 0.46 && pressure < 0.94) continue
    const actionId =
      canGoPublic &&
      pressure >= 1.08 &&
      personality.emotionalReactivity >= 0.82 &&
      personality.assertiveness >= 0.76 &&
      personality.publicConflictComfort >= 0.78
        ? 'startFight'
        : canGoPublic &&
            pressure >= 0.94 &&
            personality.dramaSeeking >= 0.5 &&
            personality.publicConflictComfort >= 0.7
          ? 'public_callout'
          : 'confront'
    addCandidate(candidates, input, {
      actionId,
      targetId: signal.targetId,
      reason: signal.reason + '; pressure ' + pressure.toFixed(2),
      motive: 'conflict',
      utility:
        0.36 +
        pressure * 0.64 +
        personality.dramaSeeking * 0.34 +
        personality.assertiveness * 0.18 +
        personality.emotionalReactivity * 0.15 +
        personality.publicConflictComfort * 0.1 -
        personality.forgiveness * 0.16,
    })
  }

  if (willingness >= 0.66 && personality.publicConflictComfort >= 0.6) {
    const activeIds = new Set(
      input.players
        .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
        .map((player) => player.id)
    )
    const opportunity = input.reality?.events
      .slice(-RECENT_CONFLICT_EVENT_WINDOW)
      .reverse()
      .find(
        (event) =>
          event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
          isRecentConflictEvent(input, event, 7) &&
          event.actorId !== input.actorId &&
          Boolean(event.actorId && activeIds.has(event.actorId)) &&
          !event.targetIds.includes(input.actorId) &&
          event.targetIds.some((id) => !event.tags.includes('automatic_nominee:' + id)) &&
          event.visibility === 'CEREMONY_PUBLIC' &&
          event.publicEligible
      )
    if (opportunity?.actorId) {
      const actionId =
        canGoPublic && personality.publicConflictComfort >= 0.72 ? 'public_callout' : 'confront'
      addCandidate(candidates, input, {
        actionId,
        targetId: opportunity.actorId,
        reason: 'stirring up a public nomination dispute for the fun of it',
        motive: 'conflict',
        utility:
          0.62 +
          willingness * 0.55 +
          personality.dramaSeeking * 0.28 +
          personality.gossipPropensity * 0.1,
      })
    }
  }
}

function addCandidate(
  candidates: DramaCandidate[],
  input: DramaAIMoveInput,
  candidate: Omit<DramaCandidate, 'utility'> & { utility: number }
): void {
  if (!candidate.targetId || candidate.targetId === input.actorId) return
  if (candidate.motive === 'conflict' && !conflictCooldownOpen(input)) return
  if (
    isPublicDramaAction(candidate.actionId) &&
    !getPublicDramaActionAvailability(input.network, input.week).available
  ) {
    return
  }
  const repeats = repeatedThisWeek(input, candidate.actionId, candidate.targetId)
  const repetitionPenalty = getSocialRuntimeConfig().ai.repetitionPenalty
  const noise =
    hashUnit(
      `${input.seed}:${input.week}:${input.phase}:${input.tick}:${input.actorId}:${candidate.actionId}:${candidate.targetId}`
    ) * getSocialRuntimeConfig().ai.noveltyWeight
  candidates.push({
    ...candidate,
    utility: Math.max(0, candidate.utility / (1 + repeats * repetitionPenalty) + noise),
  })
}

function weightedChoice(
  input: DramaAIMoveInput,
  candidates: DramaCandidate[]
): DramaCandidate | null {
  if (candidates.length === 0) return null
  const personality = getSocialPersonality(input.actorId)
  const ordered = [...candidates].sort(
    (left, right) =>
      right.utility - left.utility ||
      left.actionId.localeCompare(right.actionId) ||
      left.targetId.localeCompare(right.targetId)
  )
  const top = ordered.slice(0, 5)
  const maxUtility = top[0]?.utility ?? 0
  // Calculated players choose close to the optimum. Reactive, impulsive players
  // retain more believable variance among several strong motives.
  const temperature = Math.max(
    0.12,
    0.52 - personality.strategicCalculation * 0.3 + personality.emotionalReactivity * 0.12
  )
  const weights = top.map((candidate) => Math.exp((candidate.utility - maxUtility) / temperature))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let roll =
    hashUnit(
      `${input.seed}:${input.week}:${input.phase}:${input.tick}:${input.actorId}:drama-choice`
    ) * total
  for (let index = 0; index < top.length; index += 1) {
    roll -= weights[index]
    if (roll <= 0) return top[index]
  }
  return top[0] ?? null
}

/**
 * Compare every currently plausible Drama motive rather than returning the
 * first active arc or first rumour in array order. The shared execution guard
 * remains authoritative for legality and affordability after selection.
 */
export function chooseUtilityDramaAIMove(input: DramaAIMoveInput): DramaAIMove | null {
  const alive = input.players.filter(
    (player) =>
      player.id !== input.actorId && player.status !== 'evicted' && player.status !== 'jury'
  )
  if (alive.length === 0) return null

  const personality = getSocialPersonality(input.actorId)
  const candidates: DramaCandidate[] = []
  const nominees = new Set(input.nomineeIds ?? [])
  const byAffinity = [...alive].sort(
    (left, right) =>
      relation(input, input.actorId, right.id) - relation(input, input.actorId, left.id) ||
      left.id.localeCompare(right.id)
  )
  const closest = byAffinity[0]
  const rival = byAffinity.at(-1) ?? alive[0]

  for (const arc of input.network.arcs.filter(
    (entry) => entry.status === 'active' && entry.participantIds.includes(input.actorId)
  )) {
    const otherId = arc.participantIds.find((id) => id !== input.actorId)
    if (!otherId) continue
    const affinity = relation(input, input.actorId, otherId)
    const intensity = arc.intensity / 100

    if (arc.type === 'rivalry' || arc.type === 'betrayal') {
      if (personality.forgiveness > 0.62 && intensity < 0.72) {
        addCandidate(candidates, input, {
          actionId: 'repair_bond',
          targetId: otherId,
          reason: `repairing a ${arc.type} before it hardens`,
          motive: 'repair',
          utility:
            0.5 + personality.forgiveness * 0.65 + Math.max(0, affinity) * 0.25 - intensity * 0.28,
        })
      }
      const publicConflict = arc.intensity >= 80 && personality.publicConflictComfort >= 0.42
      addCandidate(candidates, input, {
        actionId: publicConflict ? 'public_callout' : 'confront',
        targetId: otherId,
        reason: `${arc.type} pressure at ${arc.intensity}`,
        motive: 'conflict',
        utility:
          0.58 +
          intensity * 0.72 +
          personality.assertiveness * 0.28 +
          personality.emotionalReactivity * 0.2 +
          (publicConflict ? personality.publicConflictComfort * 0.2 : 0),
      })
    }

    if (arc.type === 'romance') {
      const actionId =
        arc.stage === 'spark'
          ? 'private_flirt'
          : arc.stage === 'building'
            ? 'late_night_talk'
            : arc.stage === 'climax' && !arc.public && personality.riskTolerance > 0.58
              ? 'go_public'
              : arc.stage === 'climax'
                ? 'spend_night'
                : input.tick % 2 === 0
                  ? 'kiss_under_covers'
                  : 'cuddle'
      addCandidate(candidates, input, {
        actionId,
        targetId: otherId,
        reason: `${arc.stage} romance seeking its next beat`,
        motive: 'romance',
        utility:
          0.52 +
          intensity * 0.52 +
          personality.warmth * 0.28 +
          Math.max(0, affinity) * 0.35 +
          (actionId === 'go_public' ? personality.riskTolerance * 0.22 : 0),
      })
    }

    if (arc.type === 'bromance') {
      addCandidate(candidates, input, {
        actionId: 'ride_or_die',
        targetId: otherId,
        reason: 'loyal partnership becoming strategically useful',
        motive: 'loyalty',
        utility: 0.56 + intensity * 0.46 + personality.loyalty * 0.38 + Math.max(0, affinity) * 0.3,
      })
    }
  }

  const strategy = DRAMA_MODE_CONFIG.intelligenceStrategy
  if (!usedThisWeek(input, 'trade_secrets', strategy.maxTradesPerWeek)) {
    const shareTargets = byAffinity.slice(0, strategy.maxShareRecipients).map((player) => player.id)
    if (input.lohId && input.lohId !== input.actorId && !shareTargets.includes(input.lohId)) {
      shareTargets.push(input.lohId)
    }
    for (const targetId of shareTargets) {
      if (!alive.some((player) => player.id === targetId)) continue
      const affinity = relation(input, input.actorId, targetId)
      const isPreNominationWindow = ['loh_results', 'social_1', 'nominations'].includes(input.phase)
      const isLeverageTarget =
        targetId === input.lohId && (nominees.has(input.actorId) || isPreNominationWindow)
      const closePact = hasActiveAlliance(input, targetId)
      if (affinity < strategy.minShareAffinity && !isLeverageTarget && !closePact) continue
      if (!canTradeWith(input, targetId)) continue
      const target = alive.find((player) => player.id === targetId)
      if (
        target?.isUser &&
        (!input.reality ||
          !selectIntelFactForActor(
            input.reality,
            input.actorId,
            targetId,
            input.week,
            input.players
          ))
      ) {
        continue
      }
      const utility =
        0.25 +
        personality.gossipPropensity * 0.32 +
        personality.deceptionComfort * 0.12 +
        personality.strategicCalculation * 0.18 +
        personality.loyalty * (isLeverageTarget ? -0.18 : 0.16) +
        Math.max(0, affinity) * 0.5 +
        (closePact ? 0.18 : 0) +
        (isLeverageTarget
          ? nominees.has(input.actorId)
            ? 0.7
            : 0.58 +
              personality.strategicCalculation * 0.14 +
              personality.deceptionComfort * 0.1 -
              personality.loyalty * 0.22
          : 0)
      addCandidate(candidates, input, {
        actionId: 'trade_secrets',
        targetId,
        reason: isLeverageTarget
          ? nominees.has(input.actorId)
            ? 'offering the LOH a private lead while bargaining from nomination danger'
            : 'bringing a useful private lead to the LOH before nominations'
          : 'sharing one fresh lead with a trusted strategic partner',
        motive: isLeverageTarget ? 'survival' : 'intel',
        utility,
      })
    }
  }

  const human = alive.find((player) => player.isUser)
  if (human && !usedThisWeek(input, 'protect', strategy.maxProtectionDealsPerWeek)) {
    const humanIsNominee = nominees.has(human.id)
    const humanHasSafety =
      input.posWinnerId === human.id || (input.povProtectedIds ?? []).includes(human.id)
    const actorCanKeepHumanOffBlock =
      input.lohId === input.actorId &&
      !humanIsNominee &&
      !humanHasSafety &&
      !human.status.includes('pos') &&
      ['loh_results', 'social_1', 'nominations'].includes(input.phase)
    const actorCanUseSafetyOnHuman =
      input.posWinnerId === input.actorId &&
      humanIsNominee &&
      ['pos_results', 'pos_ceremony'].includes(input.phase)
    const alreadyPromisedProtection = Object.values(input.reality?.promises ?? {}).some(
      (promise) =>
        promise.status === 'ACTIVE' &&
        promise.kind === 'protect' &&
        promise.promisorId === input.actorId &&
        promise.beneficiaryIds.includes(human.id)
    )
    if ((actorCanKeepHumanOffBlock || actorCanUseSafetyOnHuman) && !alreadyPromisedProtection) {
      const availableLead = input.reality
        ? selectIntelFactForActor(input.reality, input.actorId, human.id, input.week, input.players)
        : null
      const relevantLead =
        availableLead &&
        ((availableLead.fact.propositionType === 'TARGETING' &&
          availableLead.fact.objectId === human.id) ||
          (availableLead.fact.propositionType.startsWith('ALLIANCE_') &&
            availableLead.fact.subjectIds.includes(human.id)))
          ? availableLead
          : null
      const affinity = relation(input, input.actorId, human.id)
      const utility =
        0.42 +
        Math.max(0, affinity) * 0.4 +
        personality.loyalty * 0.3 +
        personality.warmth * 0.18 +
        personality.strategicCalculation * 0.16 +
        (humanIsNominee ? 0.5 : 0) +
        (relevantLead ? 0.16 : 0)
      if (utility >= 0.92) {
        addCandidate(candidates, input, {
          actionId: 'protect',
          targetId: human.id,
          intelFactId: relevantLead?.fact.id,
          reason: actorCanUseSafetyOnHuman
            ? 'offering a concrete Safety rescue with a reciprocal vote deal'
            : 'offering a concrete week of nomination protection with a reciprocal vote deal',
          motive: 'loyalty',
          utility,
        })
      }
    }
  }

  const exposureTarget = bestExposureTarget(input)
  const exposureEventsThisWeek =
    input.reality?.events.filter(
      (event) => event.day === input.week && event.actionId === 'expose_secret'
    ).length ?? 0
  if (
    exposureTarget &&
    !usedThisWeek(input, 'expose_secret', strategy.maxExposuresPerWeek) &&
    strategy.exposurePhases.includes(input.phase as (typeof strategy.exposurePhases)[number]) &&
    input.network.pacing.publicEventsThisWeek < DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek &&
    exposureEventsThisWeek < DRAMA_MODE_CONFIG.pacing.maxPublicEventsPerWeek
  ) {
    const strategicMoment =
      nominees.has(input.actorId) ||
      (input.lohId === input.actorId &&
        [
          'SECRET_ALLIANCE',
          'ALLIANCE_PUBLIC_CLAIM',
          'ALLIANCE_EXPOSED',
          'ALLIANCE_FRACTURE',
        ].includes(exposureTarget.propositionType))
    const selfInvolvedAlliance = Boolean(
      exposureTarget.allianceId &&
      input.reality?.alliances[exposureTarget.allianceId]?.memberIds.includes(input.actorId)
    )
    const utility =
      0.24 +
      exposureTarget.confidence * 0.28 +
      personality.gossipPropensity * 0.3 +
      personality.riskTolerance * 0.24 +
      personality.publicConflictComfort * 0.18 +
      personality.strategicCalculation * 0.16 +
      (strategicMoment ? 0.34 : 0) -
      personality.loyalty * (selfInvolvedAlliance ? 0.42 : 0.18)
    if (strategicMoment && utility >= strategy.minExposureUtility) {
      addCandidate(candidates, input, {
        actionId: 'expose_secret',
        targetId: exposureTarget.targetId,
        reason: nominees.has(input.actorId)
          ? 'using credible private knowledge to change the house read under nomination pressure'
          : 'putting credible alliance intelligence into play while holding power',
        motive: 'deception',
        utility,
      })
    }
  }

  const safetyDecisionAlreadyMissed =
    input.phase === 'social_2' &&
    Boolean(
      input.lohId &&
      input.reality?.events
        .slice(-RECENT_CONFLICT_EVENT_WINDOW)
        .some(
          (event) =>
            event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
            event.actorId === input.lohId &&
            event.targetIds.includes(input.actorId) &&
            !event.tags.includes('automatic_nominee:' + input.actorId) &&
            isKnownToActor(event, input.actorId)
        )
    )
  if (
    nominees.has(input.actorId) &&
    input.posWinnerId &&
    input.posWinnerId !== input.actorId &&
    !safetyDecisionAlreadyMissed &&
    !usedThisWeek(input, 'ask_use_safety', 1)
  ) {
    addCandidate(candidates, input, {
      actionId: 'ask_use_safety',
      targetId: input.posWinnerId,
      subjectId: input.actorId,
      reason: 'immediate survival lobbying',
      motive: 'survival',
      utility: 1.5 + personality.assertiveness * 0.2 + personality.strategicCalculation * 0.2,
    })
  }

  if (input.lohId === input.actorId) {
    for (const nomineeId of nominees) {
      if (nomineeId === input.actorId) continue
      addCandidate(candidates, input, {
        actionId: 'reassure',
        targetId: nomineeId,
        reason: 'managing nomination fallout while holding power',
        motive: 'power',
        utility:
          0.72 +
          personality.strategicCalculation * 0.36 +
          Math.max(0, relation(input, input.actorId, nomineeId)) * 0.2,
      })
    }
  }

  if (input.posWinnerId === input.actorId && input.lohId && input.lohId !== input.actorId) {
    addCandidate(candidates, input, {
      actionId: 'whisper',
      targetId: input.lohId,
      reason: 'coordinating Safety with the LOH',
      motive: 'power',
      utility: 0.82 + personality.strategicCalculation * 0.38,
    })
  }

  const existingPact = input.network.alliances.some(
    (alliance) =>
      alliance.status === 'active' &&
      alliance.participantIds.includes(input.actorId) &&
      alliance.participantIds.includes(closest.id)
  )
  const closestAffinity = relation(input, input.actorId, closest.id)
  if (input.week >= 2 && !existingPact && closestAffinity > 0.28) {
    addCandidate(candidates, input, {
      actionId: 'proposeAlliance',
      targetId: closest.id,
      reason: 'formalising a strategically valuable relationship',
      motive: 'loyalty',
      utility:
        0.48 +
        closestAffinity * 0.64 +
        personality.loyalty * 0.24 +
        personality.strategicCalculation * 0.28,
    })
  }

  const hiddenArc = input.network.arcs
    .filter(
      (entry) =>
        entry.status === 'active' &&
        !entry.public &&
        !entry.participantIds.includes(input.actorId) &&
        !(entry.discoveredByIds ?? []).includes(input.actorId)
    )
    .sort((left, right) => right.intensity - left.intensity)[0]
  if (hiddenArc) {
    const investigateId = hiddenArc.participantIds
      .map((id) => ({ id, affinity: relation(input, input.actorId, id) }))
      .sort((left, right) => right.affinity - left.affinity)[0]?.id
    if (investigateId) {
      addCandidate(candidates, input, {
        actionId: 'snoop_around',
        targetId: investigateId,
        reason: 'investigating a specific hidden relationship',
        motive: 'intel',
        utility:
          0.36 +
          (hiddenArc.intensity / 100) * 0.35 +
          personality.gossipPropensity * 0.3 +
          personality.strategicCalculation * 0.22,
      })
    }
  }

  const gratitude = input.memory[input.actorId]?.[closest.id]?.gratitude ?? 0
  if (gratitude > 3 || closestAffinity > 0.42) {
    addCandidate(candidates, input, {
      actionId: 'ride_or_die',
      targetId: closest.id,
      reason: 'gratitude and trust becoming durable loyalty',
      motive: 'loyalty',
      utility:
        0.42 +
        Math.min(1, gratitude / 10) * 0.42 +
        closestAffinity * 0.42 +
        personality.loyalty * 0.28,
    })
  }

  const rivalAffinity = relation(input, input.actorId, rival.id)
  if (rivalAffinity < -0.18 && personality.deceptionComfort > 0.3) {
    addCandidate(candidates, input, {
      actionId: 'plant_lie',
      targetId: closest.id,
      subjectId: rival.id,
      reason: 'weaponising resentment through a trusted listener',
      motive: 'deception',
      utility:
        0.28 +
        Math.abs(rivalAffinity) * 0.55 +
        personality.deceptionComfort * 0.4 +
        personality.gossipPropensity * 0.18,
    })
  }

  addCausalConflictCandidates(candidates, input, nominees, personality)

  const selected = weightedChoice(input, candidates)
  return selected
    ? {
        actionId: selected.actionId,
        targetId: selected.targetId,
        subjectId: selected.subjectId,
        reason: `${selected.motive}: ${selected.reason} (utility ${selected.utility.toFixed(2)})`,
      }
    : null
}
