import type { PlayerPublicProfile } from './types'
import type { DramaArc, RelationshipsMap, SocialActionLogEntry } from '../social/types'

export interface AudienceStoryReaction {
  playerId: string
  delta: number
  reason: string
  eventType: string
  attributedToId?: string
}

const CONFLICT_ACTIONS = new Set([
  'startFight',
  'confront',
  'public_callout',
  'rumor',
  'spread_rumor',
  'betray',
  'break_alliance',
  'break_bromance',
])

const DRAMA_ACTIONS = new Set(['startFight', 'confront', 'public_callout', 'rumor', 'spread_rumor'])
const ROMANCE_ACTIONS = new Set(['flirt', 'cuddle'])
const PRIVATE_ROMANCE_ACTIONS = new Set(['private_flirt', 'late_night_talk', 'kiss_under_covers'])
const BROMANCE_ACTIONS = new Set(['ride_or_die', 'trade_secrets', 'reassure', 'protect'])
const WARM_ACTIONS = new Set(['compliment', 'reassure', 'apologize', 'repair_bond', 'protect'])

function approvalOf(
  profiles: Record<string, PlayerPublicProfile>,
  playerId: string,
  fallback = 50
): number {
  return profiles[playerId]?.approval ?? fallback
}

function hasPublicArc(
  arcs: readonly DramaArc[] | undefined,
  actorId: string,
  targetId: string,
  type: 'romance' | 'bromance'
): boolean {
  return Boolean(
    arcs?.some(
      (arc) =>
        arc.type === type &&
        arc.status === 'active' &&
        arc.public &&
        arc.participantIds.includes(actorId) &&
        arc.participantIds.includes(targetId)
    )
  )
}

function hasBondTag(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string,
  tag: 'romance' | 'bromance'
): boolean {
  const outward = relationships?.[actorId]?.[targetId]?.tags ?? []
  const inward = relationships?.[targetId]?.[actorId]?.tags ?? []
  return outward.includes(tag) || inward.includes(tag)
}

function recentEntries(
  history: readonly SocialActionLogEntry[],
  week: number
): SocialActionLogEntry[] {
  return history.filter((entry) => {
    const entryWeek = entry.week ?? week
    return entryWeek >= Math.max(1, week - 1) && entryWeek <= week
  })
}

function pairBeatCount(
  history: readonly SocialActionLogEntry[],
  actorId: string,
  targetId: string,
  actionIds: ReadonlySet<string>,
  week: number
): number {
  return history.filter(
    (entry) =>
      (entry.week ?? week) === week &&
      entry.outcome === 'success' &&
      actionIds.has(entry.actionId) &&
      ((entry.actorId === actorId && entry.targetId === targetId) ||
        (entry.actorId === targetId && entry.targetId === actorId))
  ).length
}

function pressureAgainst(
  history: readonly SocialActionLogEntry[],
  targetId: string,
  week: number
): { total: number; distinctActors: number } {
  const pressure = recentEntries(history, week).filter(
    (entry) =>
      entry.targetId === targetId &&
      entry.outcome === 'success' &&
      (CONFLICT_ACTIONS.has(entry.actionId) || entry.delta < 0)
  )
  return {
    total: pressure.length,
    distinctActors: new Set(pressure.map((entry) => entry.actorId)).size,
  }
}

function pushUnique(
  reactions: AudienceStoryReaction[],
  reaction: AudienceStoryReaction
): void {
  const existing = reactions.find(
    (candidate) =>
      candidate.playerId === reaction.playerId &&
      candidate.reason === reaction.reason &&
      candidate.attributedToId === reaction.attributedToId
  )
  if (existing) {
    existing.delta += reaction.delta
  } else {
    reactions.push(reaction)
  }
}

/**
 * Convert a recorded social action into audience consequences.
 *
 * The same evaluator is used for manual human actions and simulated AI actions.
 * It deliberately reacts to story context rather than actor type: fan favourites
 * draw backlash when attacked, repeated pile-ons create underdogs, visible
 * romances/bromances can charm viewers, and conflict is entertaining until it
 * starts reading as cruelty or repetitive bullying.
 */
export function computeSocialAudienceStoryReactions(params: {
  entry: SocialActionLogEntry
  profiles: Record<string, PlayerPublicProfile>
  actionHistory?: readonly SocialActionLogEntry[]
  relationships?: RelationshipsMap
  dramaArcs?: readonly DramaArc[]
  week: number
}): AudienceStoryReaction[] {
  const {
    entry,
    profiles,
    actionHistory = [],
    relationships,
    dramaArcs,
    week,
  } = params

  if (!entry.actorId || !entry.targetId) return []

  const reactions: AudienceStoryReaction[] = []
  const actorApproval = approvalOf(profiles, entry.actorId)
  const targetApproval = approvalOf(profiles, entry.targetId)
  const history = actionHistory.length > 0 ? actionHistory : [entry]
  const pressure = pressureAgainst(history, entry.targetId, week)
  const isConflict = CONFLICT_ACTIONS.has(entry.actionId) || entry.delta < 0
  const successful = entry.outcome === 'success'
  const score = typeof entry.score === 'number' ? entry.score : 0

  // Shared Human/AI social-performance signal. This replaces the old manual-human-only bonus.
  if (!isConflict && successful && (WARM_ACTIONS.has(entry.actionId) || score >= 0.3 || entry.delta >= 4)) {
    pushUnique(reactions, {
      playerId: entry.actorId,
      delta: 1,
      reason: 'audience_social_warmth',
      eventType: 'social_story',
      attributedToId: entry.targetId,
    })
  } else if (entry.outcome === 'failure' && (score <= -0.3 || entry.delta < 0)) {
    pushUnique(reactions, {
      playerId: entry.actorId,
      delta: -1,
      reason: 'audience_social_misfire',
      eventType: 'social_story',
      attributedToId: entry.targetId,
    })
  }

  // Visible romance moments can create a couple fandom, but repeated use stops paying out.
  const romanceIsPublic =
    ROMANCE_ACTIONS.has(entry.actionId) ||
    (PRIVATE_ROMANCE_ACTIONS.has(entry.actionId) &&
      hasPublicArc(dramaArcs, entry.actorId, entry.targetId, 'romance')) ||
    hasBondTag(relationships, entry.actorId, entry.targetId, 'romance')
  if (
    successful &&
    romanceIsPublic &&
    pairBeatCount(history, entry.actorId, entry.targetId, new Set([...ROMANCE_ACTIONS, ...PRIVATE_ROMANCE_ACTIONS]), week) <= 2
  ) {
    for (const playerId of [entry.actorId, entry.targetId]) {
      pushUnique(reactions, {
        playerId,
        delta: 1,
        reason: 'audience_romance',
        eventType: 'relationship_story',
        attributedToId: playerId === entry.actorId ? entry.targetId : entry.actorId,
      })
    }
  }

  // Bromances / ride-or-die bonds receive the same bounded treatment.
  const bromanceIsVisible =
    BROMANCE_ACTIONS.has(entry.actionId) &&
    (hasPublicArc(dramaArcs, entry.actorId, entry.targetId, 'bromance') ||
      hasBondTag(relationships, entry.actorId, entry.targetId, 'bromance') ||
      entry.actionId === 'ride_or_die' ||
      entry.actionId === 'protect')
  if (
    successful &&
    bromanceIsVisible &&
    pairBeatCount(history, entry.actorId, entry.targetId, BROMANCE_ACTIONS, week) <= 2
  ) {
    for (const playerId of [entry.actorId, entry.targetId]) {
      pushUnique(reactions, {
        playerId,
        delta: 1,
        reason: 'audience_bromance',
        eventType: 'relationship_story',
        attributedToId: playerId === entry.actorId ? entry.targetId : entry.actorId,
      })
    }
  }

  if (successful && isConflict) {
    // Viewers often enjoy conflict and decisive gameplay, but not an endless pile-on.
    if (DRAMA_ACTIONS.has(entry.actionId) && pressure.total <= 2 && targetApproval < 70) {
      pushUnique(reactions, {
        playerId: entry.actorId,
        delta: 1,
        reason: 'audience_drama_value',
        eventType: 'social_story',
        attributedToId: entry.targetId,
      })
    }

    // Going after an established favourite creates backlash and sympathy.
    if (targetApproval >= 60) {
      pushUnique(reactions, {
        playerId: entry.actorId,
        delta: targetApproval >= 80 ? -3 : -2,
        reason: 'fan_favorite_backlash',
        eventType: 'social_story',
        attributedToId: entry.targetId,
      })
      pushUnique(reactions, {
        playerId: entry.targetId,
        delta: targetApproval >= 80 ? 2 : 1,
        reason: 'fan_favorite_sympathy',
        eventType: 'social_story',
        attributedToId: entry.actorId,
      })
    } else if (targetApproval < 35 && pressure.total <= 2 && DRAMA_ACTIONS.has(entry.actionId)) {
      // Calling out a genuinely disliked player can be popular before it turns into a pile-on.
      pushUnique(reactions, {
        playerId: entry.actorId,
        delta: 1,
        reason: 'audience_villain_callout',
        eventType: 'social_story',
        attributedToId: entry.targetId,
      })
    }

    // Repeated pressure from several people can manufacture an underdog regardless
    // of whether the target began the week as a favourite.
    if (
      (pressure.total === 3 || pressure.total === 5) &&
      pressure.distinctActors >= 2 &&
      targetApproval >= 40
    ) {
      pushUnique(reactions, {
        playerId: entry.targetId,
        delta: targetApproval >= 60 ? 2 : 1,
        reason: 'audience_underdog_rally',
        eventType: 'social_story',
        attributedToId: entry.actorId,
      })
      pushUnique(reactions, {
        playerId: entry.actorId,
        delta: targetApproval >= 60 ? -2 : -1,
        reason: 'audience_pile_on_backlash',
        eventType: 'social_story',
        attributedToId: entry.targetId,
      })
    }

    // Betrayal is entertaining but still costs integrity unless the target is already disliked.
    if (entry.actionId === 'betray' && targetApproval >= 40) {
      pushUnique(reactions, {
        playerId: entry.actorId,
        delta: -1,
        reason: 'audience_betrayal',
        eventType: 'social_story',
        attributedToId: entry.targetId,
      })
    }
  }

  // Avoid a high-rated actor receiving unlimited positive social drift from tiny actions.
  if (actorApproval >= 80) {
    for (const reaction of reactions) {
      if (reaction.playerId === entry.actorId && reaction.delta > 1) {
        reaction.delta = 1
      }
    }
  }

  return reactions.filter((reaction) => reaction.delta !== 0)
}
