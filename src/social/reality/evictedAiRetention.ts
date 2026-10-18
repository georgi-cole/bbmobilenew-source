import type { RealityDomainState } from './types'

export interface EvictedAiRetentionGame {
  week: number
  players: readonly {
    id: string
    status: string
    isUser?: boolean
    evictedAtWeek?: number
  }[]
  battleBack?: { candidates?: readonly string[] } | null
}

/**
 * Return AI contestants whose exit is now permanent and who have been out for
 * at least one game day. Tribunal members and stored Battle Back candidates are
 * deliberately retained because they can still affect the season outcome.
 */
export function getEvictedAiIdsReadyForPrivateStatePruning(game: EvictedAiRetentionGame): string[] {
  const battleBackCandidates = new Set(game.battleBack?.candidates ?? [])
  return game.players
    .filter(
      (player) =>
        !player.isUser &&
        player.status === 'evicted' &&
        typeof player.evictedAtWeek === 'number' &&
        Number.isFinite(player.evictedAtWeek) &&
        player.evictedAtWeek < game.week &&
        !battleBackCandidates.has(player.id)
    )
    .map((player) => player.id)
}

function omitActorIds<T>(records: Record<string, T>, actorIds: ReadonlySet<string>) {
  let next: Record<string, T> | undefined
  for (const actorId of actorIds) {
    if (!Object.prototype.hasOwnProperty.call(records, actorId)) continue
    next ??= { ...records }
    delete next[actorId]
  }
  return next ?? records
}

function omitAutonomyRecords<T extends { ownerId: string; targetId: string }>(
  records: Record<string, T>,
  actorIds: ReadonlySet<string>
) {
  let next: Record<string, T> | undefined
  for (const [recordId, record] of Object.entries(records)) {
    if (!actorIds.has(record.ownerId) && !actorIds.has(record.targetId)) continue
    next ??= { ...records }
    delete next[recordId]
  }
  return next ?? records
}

function hasAutonomyRecordsForActors<T extends { ownerId: string; targetId: string }>(
  records: Record<string, T>,
  actorIds: ReadonlySet<string>
): boolean {
  return Object.values(records).some(
    (record) => actorIds.has(record.ownerId) || actorIds.has(record.targetId)
  )
}

/** Check whether an eligible exit still has any private state worth pruning. */
export function hasEvictedAiPrivateState(
  domain: RealityDomainState,
  actorIds: readonly string[]
): boolean {
  const ids = new Set(actorIds)
  if (ids.size === 0) return false
  if (
    actorIds.some(
      (actorId) =>
        Object.prototype.hasOwnProperty.call(domain.memoriesByOwner, actorId) ||
        Object.prototype.hasOwnProperty.call(domain.beliefsByOwner, actorId) ||
        Object.prototype.hasOwnProperty.call(domain.contestants, actorId) ||
        Object.prototype.hasOwnProperty.call(domain.cooldowns, actorId) ||
        Object.prototype.hasOwnProperty.call(domain.voteIntents, actorId) ||
        Object.prototype.hasOwnProperty.call(domain.reentryProfiles, actorId)
    )
  ) {
    return true
  }
  return (
    hasAutonomyRecordsForActors(domain.relationshipAutonomy.intents, ids) ||
    hasAutonomyRecordsForActors(domain.relationshipAutonomy.boundaries, ids) ||
    hasAutonomyRecordsForActors(domain.relationshipAutonomy.evidence, ids) ||
    hasAutonomyRecordsForActors(domain.relationshipAutonomy.nemeses, ids)
  )
}

/**
 * Drop only private, operational state that can no longer drive an evicted AI.
 * Shared relationships, the event feed, alliances, promises, juror evaluations,
 * and the season roster remain available for summaries and history screens.
 */
export function pruneEvictedAiPrivateState(
  domain: RealityDomainState,
  actorIds: readonly string[]
): RealityDomainState {
  const ids = new Set(actorIds)
  if (ids.size === 0) return domain

  const memoriesByOwner = omitActorIds(domain.memoriesByOwner, ids)
  const beliefsByOwner = omitActorIds(domain.beliefsByOwner, ids)
  const contestants = omitActorIds(domain.contestants, ids)
  const cooldowns = omitActorIds(domain.cooldowns, ids)
  const voteIntents = omitActorIds(domain.voteIntents, ids)
  const reentryProfiles = omitActorIds(domain.reentryProfiles, ids)
  const intents = omitAutonomyRecords(domain.relationshipAutonomy.intents, ids)
  const boundaries = omitAutonomyRecords(domain.relationshipAutonomy.boundaries, ids)
  const evidence = omitAutonomyRecords(domain.relationshipAutonomy.evidence, ids)
  const nemeses = omitAutonomyRecords(domain.relationshipAutonomy.nemeses, ids)

  if (
    memoriesByOwner === domain.memoriesByOwner &&
    beliefsByOwner === domain.beliefsByOwner &&
    contestants === domain.contestants &&
    cooldowns === domain.cooldowns &&
    voteIntents === domain.voteIntents &&
    reentryProfiles === domain.reentryProfiles &&
    intents === domain.relationshipAutonomy.intents &&
    boundaries === domain.relationshipAutonomy.boundaries &&
    evidence === domain.relationshipAutonomy.evidence &&
    nemeses === domain.relationshipAutonomy.nemeses
  ) {
    return domain
  }

  return {
    ...domain,
    memoriesByOwner,
    beliefsByOwner,
    contestants,
    cooldowns,
    voteIntents,
    reentryProfiles,
    relationshipAutonomy: {
      ...domain.relationshipAutonomy,
      intents,
      boundaries,
      evidence,
      nemeses,
    },
  }
}
