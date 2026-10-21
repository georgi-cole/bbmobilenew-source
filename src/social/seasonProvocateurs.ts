import { getSocialPersonality } from './socialPersonalityBank'
import { appendRealityEvent } from './reality/events'
import { createRealityNemesisObjective } from './reality/relationshipAutonomy'
import { applyRealityRelationshipChange } from './reality/relationships'
import type {
  RealityClock,
  RealityDomainState,
  RealityNemesisObjective,
  RealityProvocateurCause,
  RealityProvocateurRole,
  RealityProvocateurSeason,
  RealityProvocateurStyle,
} from './reality/types'
import type { AiGameIdentity } from '../ai/aiGameIdentity'

const MINIMUM_START_DAY = 3
const SECOND_ROLE_MINIMUM_CAST = 8
const MAX_CAUSE_EVENT_SCAN = 48
const ROLE_SCENE_COOLDOWN_DAYS = 2
const SEASON_SCENE_COOLDOWN_DAYS = 2

export interface ProvocateurConflictRegistration {
  eventId: string
  changedRelationshipPairs: Array<{ sourceId: string; targetId: string }>
  nemesis: RealityNemesisObjective | null
}

/** Record the durable relationship consequence of a provocateur deliberately
 * picking a fight. The role inbox path creates its own lightweight event; an
 * already-resolved AI conflict reuses that event and its relationship deltas. */
export function registerProvocateurConflict(
  domain: RealityDomainState,
  input: {
    actorId: string
    targetId: string
    at: RealityClock
    cause?: RealityProvocateurCause
    sourceEventId?: string
  }
): ProvocateurConflictRegistration | null {
  if (!input.actorId || !input.targetId || input.actorId === input.targetId) return null

  const existingRoleConflict = domain.events.some(
    (event) =>
      event.type === 'PROVOCATEUR_CONFLICT_STARTED' &&
      event.actorId === input.actorId &&
      event.targetIds.includes(input.targetId)
  )
  const actorEdge = domain.relationships[input.actorId]?.[input.targetId]
  if (
    !input.sourceEventId &&
    (existingRoleConflict ||
      actorEdge?.perceivedLabel === 'RIVAL' ||
      actorEdge?.perceivedLabel === 'ENEMY')
  ) {
    return null
  }

  let sourceEventId = input.sourceEventId
  if (!sourceEventId) {
    const event = appendRealityEvent(domain, {
      day: input.at.day,
      phase: input.at.phase,
      type: 'PROVOCATEUR_CONFLICT_STARTED',
      actionId: 'confront',
      actorId: input.actorId,
      targetIds: [input.targetId],
      participantIds: [input.actorId, input.targetId],
      witnessIds: [],
      visibility: 'PAIR_ONLY',
      outcome: 'SYSTEM',
      reason: `season_provocateur_${(input.cause ?? 'PERSONALITY_CLASH').toLowerCase()}`,
      tags: ['CONFLICT', 'PROVOCATEUR', input.cause ?? 'PERSONALITY_CLASH'],
      relatedFactIds: [],
      relatedPromiseIds: [],
      relatedThreadIds: [],
      publicEligible: false,
      juryEligible: false,
    })
    sourceEventId = event.id
  } else {
    const sourceEvent = domain.events.find((event) => event.id === sourceEventId)
    if (sourceEvent && !sourceEvent.tags.includes('PROVOCATEUR')) {
      sourceEvent.tags.push('PROVOCATEUR')
    }
  }

  const roleStartedConflict = !input.sourceEventId
  const actorRelationship = applyRealityRelationshipChange(domain, {
    sourceId: input.actorId,
    targetId: input.targetId,
    day: input.at.day,
    phase: input.at.phase,
    eventId: sourceEventId,
    anchor: 'negative',
    meaningful: roleStartedConflict,
    deltas: roleStartedConflict
      ? { warmth: -5, trust: -8, respect: -3, resentment: 18, suspicion: 6, perceivedThreat: 12 }
      : {},
  })
  const targetRelationship = applyRealityRelationshipChange(domain, {
    sourceId: input.targetId,
    targetId: input.actorId,
    day: input.at.day,
    phase: input.at.phase,
    eventId: sourceEventId,
    anchor: 'negative',
    meaningful: roleStartedConflict,
    deltas: roleStartedConflict
      ? { warmth: -2, trust: -3, resentment: 8, suspicion: 3, perceivedThreat: 4 }
      : {},
  })
  for (const edge of [actorRelationship, targetRelationship]) {
    if (edge.perceivedLabel !== 'ENEMY') edge.perceivedLabel = 'RIVAL'
    edge.labelConfidence = Math.max(edge.labelConfidence, 0.72)
  }

  const activeNemesisForTarget = Object.values(domain.relationshipAutonomy.nemeses).some(
    (nemesis) => nemesis.targetId === input.targetId && nemesis.status === 'ACTIVE'
  )
  const nemesis = activeNemesisForTarget
    ? null
    : createRealityNemesisObjective(domain, {
        ownerId: input.actorId,
        targetId: input.targetId,
        sourceEventId,
        at: input.at,
        reason:
          input.cause === 'COMPETITION_THREAT'
            ? 'COMPETITION_THREAT'
            : input.cause === 'SOCIAL_REACH'
              ? 'SOCIAL_REACH'
              : 'PERSONAL_FRICTION',
      })

  return {
    eventId: sourceEventId,
    changedRelationshipPairs: [
      { sourceId: input.actorId, targetId: input.targetId },
      { sourceId: input.targetId, targetId: input.actorId },
    ],
    nemesis,
  }
}

export interface ProvocateurCandidate {
  id: string
  status: string
  isUser?: boolean
  aiGameIdentity?: AiGameIdentity
}

function stableUnit(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

function isActive(candidate: ProvocateurCandidate): boolean {
  return candidate.status !== 'evicted' && candidate.status !== 'jury'
}

export function chooseProvocateurStyle(
  candidate: ProvocateurCandidate,
  seed: number
): RealityProvocateurStyle {
  const identity = candidate.aiGameIdentity
  if (
    ['puppet_master', 'double_agent', 'opportunist', 'media_strategist'].includes(
      identity?.archetype ?? ''
    )
  ) {
    return 'SCHEMER'
  }
  if (identity?.archetype === 'chaos_agent' || identity?.archetype === 'audience_chameleon') {
    return 'SPOTLIGHT_SEEKER'
  }
  if (['aggressive_competitor', 'antihero', 'risk_taker'].includes(identity?.archetype ?? '')) {
    return 'DOMINANCE'
  }
  if (
    identity?.emotionalVolatility !== undefined &&
    identity.emotionalVolatility >= 0.68 &&
    getSocialPersonality(candidate.id).assertiveness >= 0.68
  ) {
    return 'INTIMIDATOR'
  }
  if ((identity?.competitionDrive ?? 0) >= 0.68) return 'SORE_WINNER'
  if (stableUnit(`${seed}:${candidate.id}:accountability`) >= 0.5) return 'ACCOUNTABILITY'
  return 'SORE_WINNER'
}

function candidateScore(
  candidate: ProvocateurCandidate,
  seed: number,
  targetId: string,
  domain?: RealityDomainState
): number {
  const personality = getSocialPersonality(candidate.id)
  const identity = candidate.aiGameIdentity
  const archetypeBias =
    identity?.archetype === 'chaos_agent'
      ? 0.18
      : ['aggressive_competitor', 'antihero', 'opportunist', 'risk_taker'].includes(
            identity?.archetype ?? ''
          )
        ? 0.12
        : ['puppet_master', 'double_agent'].includes(identity?.archetype ?? '')
          ? 0.09
          : 0
  const socialAffinity = personality.dramaSeeking * 0.24
  const conflictReadiness =
    personality.assertiveness * 0.2 +
    personality.publicConflictComfort * 0.24 +
    personality.emotionalReactivity * 0.12 +
    (1 - personality.forgiveness) * 0.08
  const edge = domain?.relationships[candidate.id]?.[targetId]
  const existingFriction = edge
    ? ((edge.resentment + edge.suspicion + edge.perceivedThreat) / 300) * 0.35 -
      ((edge.warmth + edge.trust) / 200) * 0.15
    : 0
  const volatility = stableUnit(`${seed}:${targetId}:${candidate.id}:role`) * 0.08
  return archetypeBias + socialAffinity + conflictReadiness + existingFriction + volatility
}

function getSuccessorScore(
  candidate: ProvocateurCandidate,
  predecessorId: string,
  targetId: string,
  domain: RealityDomainState,
  seed: number
): number {
  const predecessorEdge = domain.relationships[candidate.id]?.[predecessorId]
  const targetEdge = domain.relationships[candidate.id]?.[targetId]
  const sharedAlliance = Object.values(domain.alliances).some(
    (alliance) =>
      alliance.status !== 'DISSOLVED' &&
      alliance.memberIds.includes(predecessorId) &&
      alliance.memberIds.includes(candidate.id)
  )
  const sharedRomance = Object.values(domain.romances).some(
    (romance) =>
      romance.status === 'ACTIVE' &&
      romance.participantIds.includes(predecessorId) &&
      romance.participantIds.includes(candidate.id)
  )
  const socialEdge = domain.relationships[predecessorId]?.[candidate.id]
  const relationshipBond = socialEdge
    ? (socialEdge.warmth * 0.06 + socialEdge.trust * 0.08 + socialEdge.loyalty * 0.09) / 100
    : 0
  const motivation = targetEdge
    ? (targetEdge.resentment * 0.08 + targetEdge.perceivedThreat * 0.05) / 100
    : 0
  return (
    candidateScore(candidate, seed, targetId, domain) +
    Number(sharedAlliance) * 0.34 +
    Number(sharedRomance) * 0.36 +
    relationshipBond +
    motivation +
    (predecessorEdge ? (predecessorEdge.trust + predecessorEdge.loyalty) * 0.002 : 0)
  )
}

function createRole(
  candidate: ProvocateurCandidate,
  day: number,
  seed: number,
  predecessorId?: string
): RealityProvocateurRole {
  return {
    actorId: candidate.id,
    style: chooseProvocateurStyle(candidate, seed),
    introducedDay: day,
    escalation: 0,
    cause: predecessorId ? 'SUCCESSOR' : 'PERSONALITY_CLASH',
    ...(predecessorId ? { predecessorId } : {}),
  }
}

function activeNemesisOwner(domain: RealityDomainState, targetId: string): string | undefined {
  return Object.values(domain.relationshipAutonomy.nemeses).find(
    (nemesis) => nemesis.status === 'ACTIVE' && nemesis.targetId === targetId
  )?.ownerId
}

/** Assign or succeed up to two drama roles without retaining a season transcript. */
export function getUpdatedProvocateurSeason(
  domain: RealityDomainState,
  input: {
    targetId: string
    players: readonly ProvocateurCandidate[]
    seed: number
    day: number
  }
): RealityProvocateurSeason | null {
  if (input.day < MINIMUM_START_DAY) return null
  const activePlayers = input.players.filter(isActive)
  const candidates = activePlayers.filter(
    (player) => !player.isUser && player.id !== input.targetId
  )
  if (candidates.length === 0) return null

  let season = domain.relationshipAutonomy.provocateurSeason
  if (!season || season.targetId !== input.targetId) {
    const nemesisId = activeNemesisOwner(domain, input.targetId)
    const primary =
      candidates.find((candidate) => candidate.id === nemesisId) ??
      [...candidates].sort(
        (left, right) =>
          candidateScore(right, input.seed, input.targetId, domain) -
            candidateScore(left, input.seed, input.targetId, domain) ||
          left.id.localeCompare(right.id)
      )[0]
    if (!primary) return null
    const roles = [createRole(primary, input.day, input.seed)]
    if (activePlayers.length >= SECOND_ROLE_MINIMUM_CAST && candidates.length > 1) {
      const secondary = [...candidates]
        .filter((candidate) => candidate.id !== primary.id)
        .sort(
          (left, right) =>
            candidateScore(right, input.seed + 1, input.targetId, domain) -
              candidateScore(left, input.seed + 1, input.targetId, domain) ||
            left.id.localeCompare(right.id)
        )[0]
      if (secondary) {
        roles.push(createRole(secondary, input.day + 2, input.seed + 1))
      }
    }
    season = {
      targetId: input.targetId,
      roles,
      observedThroughSequence: domain.nextSequence - 1,
    }
    return season
  }

  let changed = false
  const roles = season.roles.map((role) => ({ ...role }))
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index]
    if (candidates.some((candidate) => candidate.id === role.actorId)) continue
    const replacements = candidates.filter((candidate) =>
      roles.every((other, otherIndex) => otherIndex === index || other.actorId !== candidate.id)
    )
    const successor = [...replacements].sort(
      (left, right) =>
        getSuccessorScore(right, role.actorId, input.targetId, domain, input.seed) -
          getSuccessorScore(left, role.actorId, input.targetId, domain, input.seed) ||
        left.id.localeCompare(right.id)
    )[0]
    if (!successor) {
      roles.splice(index, 1)
      index -= 1
    } else {
      roles[index] = createRole(successor, input.day, input.seed, role.actorId)
    }
    changed = true
  }

  const lastSequence = domain.nextSequence - 1
  if (lastSequence > season.observedThroughSequence) {
    const recentEvents = domain.events.slice(-MAX_CAUSE_EVENT_SCAN)
    let foundRelevantEvent = false
    for (const role of roles) {
      for (let index = recentEvents.length - 1; index >= 0; index -= 1) {
        const event = recentEvents[index]
        if (event.sequence <= season.observedThroughSequence || event.day < role.introducedDay)
          continue
        const roleWasTargeted = event.targetIds.includes(role.actorId)
        let cause: RealityProvocateurCause | null = null
        if (
          event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
          event.actorId === input.targetId &&
          roleWasTargeted
        ) {
          cause = 'NOMINATION'
        }
        if (
          !cause &&
          event.type === 'ALLIANCE_BETRAYAL' &&
          event.actorId === input.targetId &&
          roleWasTargeted
        ) {
          cause = 'BETRAYAL'
        }
        if (
          !cause &&
          event.type === 'ALLIANCE_PLAN_DEFIED' &&
          event.actorId === input.targetId &&
          event.participantIds.includes(role.actorId)
        ) {
          cause = 'PLAN_DEFIED'
        }
        if (
          !cause &&
          event.type === 'ALLIANCE_REENTRY_RECONCILED' &&
          event.actorId === role.actorId &&
          event.targetIds.includes(input.targetId)
        ) {
          cause = 'RETURNED'
        }
        if (
          !cause &&
          event.actorId === input.targetId &&
          roleWasTargeted &&
          event.type.includes('COMPETITION')
        ) {
          cause = 'COMPETITION_THREAT'
        }
        if (cause) {
          role.cause = cause
          changed = true
          foundRelevantEvent = true
          break
        }
      }
    }
    // If nothing relevant happened, leave the cursor alone. The fixed 48-event
    // scan is cheap, and avoiding a whole-domain clone for unrelated events is
    // more important than advancing an otherwise unused high-water mark.
    if (foundRelevantEvent) {
      season = { ...season, observedThroughSequence: lastSequence }
      changed = true
    }
  }
  return changed ? { ...season, targetId: input.targetId, roles } : null
}

/** At most one due rival scene is selected at an eligible checkpoint. */
export function getDueProvocateurRole(
  season: RealityProvocateurSeason | null | undefined,
  day: number,
  excludedActorIds?: ReadonlySet<string>
): RealityProvocateurRole | null {
  if (!season || day < MINIMUM_START_DAY) return null
  if (season.lastSceneDay !== undefined && day - season.lastSceneDay < SEASON_SCENE_COOLDOWN_DAYS)
    return null
  return (
    season.roles
      .filter(
        (role) =>
          role.introducedDay <= day &&
          !excludedActorIds?.has(role.actorId) &&
          (role.lastSceneDay === undefined || day - role.lastSceneDay >= ROLE_SCENE_COOLDOWN_DAYS)
      )
      .sort(
        (left, right) =>
          (left.lastSceneDay ?? Number.NEGATIVE_INFINITY) -
            (right.lastSceneDay ?? Number.NEGATIVE_INFINITY) ||
          left.actorId.localeCompare(right.actorId)
      )[0] ?? null
  )
}

export function recordProvocateurSceneDelivered(
  season: RealityProvocateurSeason | null | undefined,
  actorId: string,
  day: number
): void {
  if (!season) return
  const role = season.roles.find((entry) => entry.actorId === actorId)
  if (!role) return
  role.lastSceneDay = day
  season.lastSceneDay = day
}

export function applyProvocateurResponse(
  domain: RealityDomainState,
  targetId: string,
  actorId: string,
  responseType: string
): void {
  const season = domain.relationshipAutonomy.provocateurSeason
  if (!season || season.targetId !== targetId) return
  const role = season.roles.find((entry) => entry.actorId === actorId)
  if (!role) return
  if (
    responseType === 'negative' ||
    responseType === 'decline' ||
    responseType === 'dismiss' ||
    responseType === 'ignore'
  ) {
    role.escalation = Math.min(2, role.escalation + 1) as 0 | 1 | 2
  } else if (responseType === 'positive' || responseType === 'accept') {
    role.escalation = Math.max(0, role.escalation - 1) as 0 | 1 | 2
  }
}

const CAUSE_LINES: Record<RealityProvocateurCause, string> = {
  PERSONALITY_CLASH:
    'The way you handle people rubs me the wrong way. I am done keeping that to myself.',
  NOMINATION: 'You put my name on the block and expected me to forget who made that call.',
  BETRAYAL: 'You broke the plan when it stopped working for you.',
  PLAN_DEFIED: 'You walked away from the agreement and left the rest of us to carry it.',
  RETURNED: 'You thought I would stay gone. I am back, and I remember who wanted me out.',
  COMPETITION_THREAT: 'Your last win changed the way people listen when you speak.',
  SOCIAL_REACH: 'People have started checking what you think before they decide for themselves.',
  SUCCESSOR:
    'Now that {predecessor} is gone, you seem to expect the rest of us to fall in line. I will not.',
}

const STYLE_LINES: Record<RealityProvocateurStyle, readonly [string, string, string]> = {
  ACCOUNTABILITY: [
    'You keep deciding what is fair as if the rest of us do not get a say. {cause}',
    'You made that call and now expect everyone to accept your version. {cause}',
    'Keep acting like the rules only apply when they suit you. I will make sure people notice.',
  ],
  DOMINANCE: [
    'You are getting comfortable calling the shots. {cause}',
    'Do not confuse one good week with control of the whole game. {cause}',
    'You and I are going to keep ending up on opposite sides until somebody moves.',
  ],
  SCHEMER: [
    'Interesting how your story changes depending on who is listening. {cause}',
    'I have heard two versions of that move, and both somehow leave you in the middle. {cause}',
    'Keep telling everyone they chose this for themselves. I am comparing notes.',
  ],
  INTIMIDATOR: [
    'You do not get to make that move and expect me to stay quiet. {cause}',
    'Try that again and see how many people still follow your lead. {cause}',
    'I am done giving you room. Next time your name comes up, I will be there.',
  ],
  SORE_WINNER: [
    'Everyone is treating you like the obvious star now. {cause}',
    'You got the result you wanted. That does not mean you earned everybody’s respect. {cause}',
    'Enjoy the attention while it lasts. I am not helping you keep it.',
  ],
  SPOTLIGHT_SEEKER: [
    'Somehow every room turns into your story. {cause}',
    'You keep taking the credit and leaving everyone else to explain the fallout. {cause}',
    'If you want the whole Hub focused on you, I can help with that.',
  ],
}

/** Stable, character-specific copy; no generated text call or extra simulation pass. */
export function getProvocateurMessage(
  role: RealityProvocateurRole,
  actorName: string,
  targetName: string,
  day: number,
  seed: number,
  predecessorName?: string
): { text: string; variantId: string } {
  const lines = STYLE_LINES[role.style]
  const stage = Math.min(role.escalation, 2)
  const availableLines = lines.slice(0, stage + 1)
  const variant = Math.floor(
    stableUnit(`${seed}:${role.actorId}:${day}:${stage}`) * availableLines.length
  )
  const line = availableLines[variant] ?? lines[0]
  return {
    text: `${actorName}: ${line
      .replaceAll('{cause}', CAUSE_LINES[role.cause])
      .replaceAll('{player}', targetName)
      .replaceAll('{predecessor}', predecessorName ?? 'the last person')}`,
    variantId: `provocateur_${role.style.toLowerCase()}:${stage}:${variant}`,
  }
}
