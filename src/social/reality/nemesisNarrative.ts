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
function hasWitnessedOrigin(
  domain: RealityDomainState,
  objective: RealityNemesisObjective
): boolean {
  const event = knownCauseEvent(domain, objective)
  return Boolean(
    event &&
      event.actorId === objective.ownerId &&
      event.targetIds.includes(objective.targetId) &&
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
  if (trigger.includes('provocateur_nomination')) {
    return `Being nominated on Day ${source?.day ?? objective.createdAt.day} left them angry about your decision.`
  }
  if (trigger.includes('provocateur_betrayal')) {
    return `A recorded betrayal on Day ${source?.day ?? objective.createdAt.day} made them stop trusting your partnership.`
  }
  if (trigger.includes('provocateur_plan_defied')) {
    return `A shared plan was defied on Day ${source?.day ?? objective.createdAt.day}, and they blamed you for it.`
  }
  if (source?.type === 'ALLIANCE_BETRAYAL') {
    return `The broken alliance commitment on Day ${source.day} turned the relationship into a conflict.`
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
  // The antagonist makes a real private move. The player receives an anonymous
  // production clue, not a disclosure of that actor's private intention.
  const pressure = appendRealityEvent(domain, {
    ...at,
    type: 'NEMESIS_PRIVATE_PRESSURE',
    actorId: objective.ownerId,
    targetIds: [objective.targetId],
    participantIds: [objective.ownerId],
    witnessIds: [],
    visibility: 'PRIVATE',
    outcome: 'SYSTEM',
    reason: 'Privately challenged the target’s position with another housemate.',
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
  const text =
    'THE BIG EYE: Someone in the Hub has begun quietly questioning your game behind your back. The source is still unknown.'
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
  postExit: boolean
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
  const text = postExit
    ? `THE BIG EYE — REVEALED: After ${name}'s departure, their private campaign against you comes to light. Why? ${motive}`
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

  if (postExit) {
    // The opponent has already left. Preserve the reveal in history without
    // creating an opponent that can keep influencing the Hub from outside.
    objective.status = 'ENDED'
    const intent = domain.relationshipAutonomy.intents[
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
      (context.day === objective.createdAt.day &&
        context.phase === objective.createdAt.phase)
    ) {
      continue
    }

    const ownerActive = context.activePlayerIds.has(objective.ownerId)
    if (!ownerActive && (leavingWindow || closing || activeWindow)) {
      beats.push(createReveal(domain, objective, context, true))
      continue
    }
    if (closing) {
      beats.push(createReveal(domain, objective, context, false))
      continue
    }
    if (!activeWindow) continue

    if (objective.clueEventId || objective.clueAt) {
      if (objective.clueAt && context.day > objective.clueAt.day) {
        beats.push(createReveal(domain, objective, context, false))
      }
    } else if (hasWitnessedOrigin(domain, objective)) {
      beats.push(createReveal(domain, objective, context, false))
    } else {
      beats.push(createClue(domain, objective, context))
    }
  }
  return beats
}
