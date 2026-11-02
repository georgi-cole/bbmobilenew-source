import { allianceKind, isCurrentAlliance } from './allianceIdentity'
import { appendRealityEvent } from './events'
import { applyRealityRelationshipChange } from './relationships'
import type {
  RealityClock,
  RealityDomainState,
  RealityNemesisObjective,
  RealitySocialEvent,
} from './types'

export type NemesisStoryBeat = {
  objectiveId: string
  eventId: string
  kind: 'clue' | 'reveal'
  text: string
}

export interface NemesisStoryContext extends RealityClock {
  humanId: string
  playerNames: Readonly<Record<string, string>>
  activePlayerIds: ReadonlySet<string>
}

/** Only social windows carry a normal new beat; endgame and departures close an unfinished arc. */
const STORY_PHASES = new Set(['social_1', 'social_2'])
const CLOSING_PHASES = new Set(['final3', 'final_hoh', 'season_end', 'game_over'])

function isClosingPhase(phase: string): boolean {
  return CLOSING_PHASES.has(phase) || phase.startsWith('final3_')
}

function knownCauseEvent(domain: RealityDomainState, objective: RealityNemesisObjective) {
  return domain.events.find((event) => event.id === objective.sourceEventId)
}

function isVisibleTo(event: RealitySocialEvent, viewerId: string): boolean {
  return (
    event.visibility === 'HOUSE_PUBLIC' ||
    event.visibility === 'CEREMONY_PUBLIC' ||
    (event.visibility !== 'PRIVATE' &&
      event.visibility !== 'JURY_ONLY' &&
      (event.participantIds.includes(viewerId) || event.witnessIds.includes(viewerId)))
  )
}

/** An already witnessed confrontation is the first clue; there is no need to fabricate another. */
function hasWitnessedConflict(
  domain: RealityDomainState,
  objective: RealityNemesisObjective
): boolean {
  return domain.events.some(
    (event) =>
      event.actorId === objective.ownerId &&
      event.targetIds.includes(objective.targetId) &&
      event.day >= objective.createdAt.day - 2 &&
      isVisibleTo(event, objective.targetId) &&
      (event.tags.includes('CONFLICT') ||
        event.type === 'PROVOCATEUR_CONFLICT_STARTED' ||
        event.type === 'ALLIANCE_BETRAYAL')
  )
}

/** Source-specific copy takes precedence over the general, persisted AI motive. */
export function explainNemesisMotive(
  domain: RealityDomainState,
  objective: RealityNemesisObjective
): string {
  const source = knownCauseEvent(domain, objective)
  const trigger = source?.reason?.toLowerCase() ?? ''
  // Only cite a real, recorded action on its actual day. A later provocation
  // can reflect an earlier nomination or betrayal, not necessarily a new one.
  const pairEvents = domain.events
    .filter(
      (event) =>
        event.day <= objective.createdAt.day &&
        (event.participantIds.includes(objective.ownerId) ||
          event.targetIds.includes(objective.ownerId)) &&
        (event.participantIds.includes(objective.targetId) ||
          event.targetIds.includes(objective.targetId))
    )
    .sort((a, b) => b.sequence - a.sequence)
  const nomination = pairEvents.find(
    (event) =>
      event.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
      event.actorId === objective.targetId &&
      event.targetIds.includes(objective.ownerId)
  )
  const betrayal = pairEvents.find(
    (event) =>
      event.type === 'ALLIANCE_BETRAYAL' &&
      (event.actorId === objective.ownerId || event.actorId === objective.targetId)
  )
  const planDefied = pairEvents.find((event) => event.type === 'ALLIANCE_PLAN_DEFIED')

  if (trigger.includes('provocateur_nomination') || nomination) {
    return nomination
      ? `You nominated them on Day ${nomination.day}, and they decided not to forgive that choice.`
      : 'They blamed you for a nomination decision that put their place in the game at risk.'
  }
  if (trigger.includes('provocateur_betrayal') || betrayal) {
    if (betrayal?.actorId === objective.targetId) {
      return `They felt betrayed after you broke an alliance commitment on Day ${betrayal.day}.`
    }
    if (betrayal?.actorId === objective.ownerId) {
      return `They broke an alliance commitment on Day ${betrayal.day} and continued treating you as an opponent.`
    }
    return 'They felt a shared commitment had been broken, and their distrust hardened into hostility.'
  }
  if (trigger.includes('provocateur_plan_defied') || planDefied) {
    return planDefied
      ? `A shared plan was defied on Day ${planDefied.day}, and they blamed you for the fallout.`
      : 'They believed you had abandoned a shared game plan.'
  }

  switch (objective.reason) {
    case 'COMPETITION_THREAT':
      return 'They saw your ability to win power as a threat to their survival in the Hub.'
    case 'SOCIAL_REACH':
      return 'They felt threatened by your growing influence and connections with other hubmates.'
    case 'JEALOUSY':
      return 'Jealousy about their standing alongside you turned into resentment.'
    case 'PERSONAL_FRICTION':
      return 'Unresolved friction and distrust between you made them decide to work against you.'
    case 'VOLATILE_READ':
      return 'Their growing suspicions about your intentions hardened into an opposition strategy.'
  }
}

function createClue(
  domain: RealityDomainState,
  objective: RealityNemesisObjective,
  context: NemesisStoryContext
): NemesisStoryBeat {
  const at = { day: context.day, phase: context.phase }
  // Choose a real recipient for the covert pressure. A conversation without a
  // counterpart must not quietly mutate some unspecified housemate's opinion.
  const availableListeners = [...context.activePlayerIds]
    .filter((id) => id !== objective.ownerId && id !== objective.targetId)
    .sort()
  const selector = `${objective.id}:${context.day}`
    .split('')
    .reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261)
  const listenerId =
    availableListeners.length > 0
      ? availableListeners[(selector >>> 0) % availableListeners.length]
      : undefined

  // The antagonist makes a real private move. The player receives an anonymous
  // production clue, not a disclosure of that actor's private intention.
  const pressure = appendRealityEvent(domain, {
    ...at,
    type: 'NEMESIS_PRIVATE_PRESSURE',
    actorId: objective.ownerId,
    targetIds: [objective.targetId],
    participantIds: listenerId ? [objective.ownerId, listenerId] : [objective.ownerId],
    witnessIds: listenerId ? [listenerId] : [],
    visibility: 'PRIVATE',
    outcome: 'SYSTEM',
    reason: listenerId
      ? 'Privately challenged the target’s position with a specific housemate.'
      : 'Privately planned to undermine the target’s position.',
    tags: ['NEMESIS', 'UNDERMINE'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [`nemesis-thread:${objective.ownerId}:${objective.targetId}`],
    publicEligible: false,
    juryEligible: false,
  })
  applyRealityRelationshipChange(domain, {
    sourceId: objective.ownerId,
    targetId: objective.targetId,
    deltas: { trust: -4, resentment: 4, suspicion: 3 },
    anchor: 'negative',
    day: context.day,
    phase: context.phase,
    eventId: pressure.id,
  })
  if (listenerId) {
    applyRealityRelationshipChange(domain, {
      sourceId: listenerId,
      targetId: objective.targetId,
      deltas: { trust: -2, suspicion: 4 },
      day: context.day,
      phase: context.phase,
      eventId: pressure.id,
    })
  }
  const text = listenerId
    ? 'THE BIG EYE: Someone in the Hub has begun quietly questioning your game behind your back. The source is still unknown.'
    : 'THE BIG EYE: Someone in the Hub is privately planning to undermine your game. Their identity is still unknown.'
  const clue = appendRealityEvent(domain, {
    ...at,
    type: 'NEMESIS_ANONYMOUS_CLUE',
    targetIds: [objective.targetId],
    participantIds: [objective.targetId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SYSTEM',
    reason: text,
    tags: ['NEMESIS_CLUE'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [],
    publicEligible: false,
    juryEligible: false,
  })
  objective.clueAt = at
  objective.clueEventId = clue.id
  return { objectiveId: objective.id, eventId: clue.id, kind: 'clue', text }
}

function createReveal(
  domain: RealityDomainState,
  objective: RealityNemesisObjective,
  context: NemesisStoryContext,
  exitWho: 'owner' | 'target' | null
): NemesisStoryBeat {
  const at = { day: context.day, phase: context.phase }
  const name = context.playerNames[objective.ownerId] ?? 'A hubmate'
  const motive = explainNemesisMotive(domain, objective)
  const shared = Object.values(domain.alliances).filter(
    (alliance) =>
      isCurrentAlliance(alliance) &&
      alliance.memberIds.includes(objective.ownerId) &&
      alliance.memberIds.includes(objective.targetId)
  )
  const text =
    exitWho === 'owner'
      ? `THE BIG EYE — REVEALED: After ${name}'s departure, their private campaign against you comes to light. Why? ${motive}`
      : exitWho === 'target'
        ? `THE BIG EYE — REVEALED: After your elimination, the reason ${name} opposed you comes to light. Why? ${motive}`
        : `THE BIG EYE — NEMESIS REVEALED: ${name} has been working against you. Why? ${motive}`
  const event = appendRealityEvent(domain, {
    ...at,
    type: 'NEMESIS_REVEALED',
    actorId: objective.ownerId,
    targetIds: [objective.targetId],
    participantIds: [objective.ownerId, objective.targetId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: 'SYSTEM',
    reason: text,
    tags: ['NEMESIS_REVEALED', 'CONFLICT'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [`nemesis-thread:${objective.ownerId}:${objective.targetId}`],
    publicEligible: false,
    juryEligible: true,
  })
  objective.revealedAt = at
  objective.revealEventId = event.id

  if (exitWho) {
    // The rivalry has ended through an elimination. Preserve the reveal in
    // history without keeping an executable anti-player objective.
    objective.status = 'ENDED'
    const intent =
      domain.relationshipAutonomy.intents[
        `relationship-intent:${objective.ownerId}:${objective.targetId}:UNDERMINE`
      ]
    if (intent) {
      intent.status = 'CLOSED'
      intent.continuationPressure = 0
    }
    const thread = domain.threads[`nemesis-thread:${objective.ownerId}:${objective.targetId}`]
    if (thread) {
      thread.status = 'RESOLVED'
      thread.stage = 'ENDED_BY_EVICTION'
      thread.urgency = 0
    }
  } else {
    applyRealityRelationshipChange(domain, {
      sourceId: objective.targetId,
      targetId: objective.ownerId,
      deltas: { trust: -12, warmth: -5, suspicion: 12, resentment: 6 },
      anchor: 'negative',
      day: context.day,
      phase: context.phase,
      eventId: event.id,
    })
    for (const alliance of shared) {
      if (allianceKind(alliance) === 'PACT') alliance.status = 'FRACTURED'
      alliance.fractureRisk = Math.max(alliance.fractureRisk, 0.6)
    }
  }
  return { objectiveId: objective.id, eventId: event.id, kind: 'reveal', text }
}

/**
 * Persistent story progression. The ordinary arc is one anonymized, observable
 * pressure beat followed by a cause-specific reveal on a later game day.
 * A witnessed feud already supplies the clue, while eviction/endgame forces
 * a final disclosure instead of abandoning the unfinished story.
 *
 * This is idempotent at the domain level: the saved event IDs gate replay.
 */
export function advanceNemesisNarrative(
  domain: RealityDomainState,
  context: NemesisStoryContext
): NemesisStoryBeat[] {
  const beats: NemesisStoryBeat[] = []
  const activeWindow = STORY_PHASES.has(context.phase)
  const closing = isClosingPhase(context.phase)
  const leavingWindow = context.phase === 'week_end'

  for (const objective of Object.values(domain.relationshipAutonomy.nemeses)) {
    if (objective.status !== 'ACTIVE' || objective.targetId !== context.humanId) continue
    if (objective.revealEventId || objective.revealedAt) continue
    if (
      context.day < objective.createdAt.day ||
      (context.day === objective.createdAt.day && context.phase === objective.createdAt.phase)
    ) {
      continue
    }

    const ownerActive = context.activePlayerIds.has(objective.ownerId)
    const humanActive = context.activePlayerIds.has(objective.targetId)
    if (!humanActive && (leavingWindow || closing)) {
      beats.push(createReveal(domain, objective, context, 'target'))
      continue
    }
    if (!ownerActive && (leavingWindow || closing || activeWindow)) {
      beats.push(createReveal(domain, objective, context, 'owner'))
      continue
    }
    if (closing) {
      beats.push(createReveal(domain, objective, context, null))
      continue
    }
    if (!activeWindow) continue

    if (objective.clueEventId || objective.clueAt) {
      if (objective.clueAt && context.day > objective.clueAt.day) {
        beats.push(createReveal(domain, objective, context, null))
      }
    } else if (hasWitnessedConflict(domain, objective)) {
      beats.push(createReveal(domain, objective, context, null))
    } else {
      beats.push(createClue(domain, objective, context))
    }
  }
  return beats
}
