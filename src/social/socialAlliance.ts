import { socialConfig } from './socialConfig'
import { normalizeAffinity } from './affinityUtils'
import type { RelationshipEntry, RelationshipsMap } from './types'

export const ALLIANCE_TAG = 'alliance'
export const BETRAYAL_TAG = 'betrayal'
export const MIN_ALLIANCE_AFFINITY = 10

export function hasAllianceTag(relationship?: RelationshipEntry): boolean {
  return relationship?.tags.includes(ALLIANCE_TAG) ?? false
}

export function hasAllianceBetween(
  relationships: RelationshipsMap,
  actorId: string,
  targetId: string
): boolean {
  return (
    hasAllianceTag(relationships[actorId]?.[targetId]) ||
    hasAllianceTag(relationships[targetId]?.[actorId])
  )
}

export function shouldDropAllianceTag(affinity: number): boolean {
  return normalizeAffinity(affinity) < socialConfig.relationshipThresholds.allyThreshold
}

export function tagsAfterAllianceDecay(
  tags: string[],
  _affinity: number,
  _preserveIncomingAlliance: boolean
): string[] {
  // Membership ends through a canonical lifecycle command, never sentiment decay.
  return tags.includes(BETRAYAL_TAG)
    ? tags.filter((tag) => !['romance', 'bromance', 'romance_seed', 'bromance_seed'].includes(tag))
    : tags
}

export const RELATIONSHIP_TAG_AFFINITY_BOUNDS: Record<string, { min?: number; max?: number }> = {
  bromance: { min: 40 },
  romance: { min: 30 },
  rivalry: { max: -30 },
  betrayal: { max: -40 },
}

/**
 * Keep named relationship states mathematically credible. Tags still decay
 * normally, but creating one can no longer leave an Ally chip at 0%.
 */
export function enforceRelationshipTagAffinity(affinity: number, tags: string[]): number {
  let next = affinity
  if (tags.includes(BETRAYAL_TAG)) return Math.max(-100, Math.min(-40, next))
  for (const tag of tags) {
    const bound = RELATIONSHIP_TAG_AFFINITY_BOUNDS[tag]
    if (tag === BETRAYAL_TAG) continue
    if (!bound) continue
    if (typeof bound.min === 'number') next = Math.max(next, bound.min)
    if (typeof bound.max === 'number') next = Math.min(next, bound.max)
  }
  return Math.max(-100, Math.min(100, next))
}

export function normalizeRelationshipsForTags(relationships: RelationshipsMap): RelationshipsMap {
  return Object.fromEntries(
    Object.entries(relationships).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, relationship]) => [
          targetId,
          {
            ...relationship,
            affinity: enforceRelationshipTagAffinity(relationship.affinity, relationship.tags),
          },
        ])
      ),
    ])
  )
}
