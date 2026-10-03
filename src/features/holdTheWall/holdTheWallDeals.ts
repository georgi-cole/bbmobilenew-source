import type { RelationshipsMap } from '../../social/types'
import { mulberry32 } from '../../store/rng'

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

function seededDecision(seed: number, key: string): number {
  return mulberry32((seed ^ hashText(key)) >>> 0)()
}

function relationshipSnapshot(
  relationships: RelationshipsMap | undefined,
  actorId: string,
  targetId: string
): { affinity: number; tags: Set<string> } {
  const outward = relationships?.[actorId]?.[targetId]
  const inward = relationships?.[targetId]?.[actorId]
  return {
    affinity: outward?.affinity ?? 0,
    tags: new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])]),
  }
}

function hasAny(tags: Set<string>, values: readonly string[]): boolean {
  return values.some((value) => tags.has(value))
}

const CLOSE_TAGS = [
  'alliance',
  'primary_alliance',
  'ride_or_die',
  'romance',
  'bromance',
  'protection',
] as const

const STRAINED_TAGS = [
  'strained',
  'enemy',
  'rivalry',
  'betrayal',
  'broken_alliance',
  'unreliable',
] as const

export function getHoldTheWallDealAcceptanceChance(
  relationships: RelationshipsMap | undefined,
  aiId: string,
  humanId: string
): number {
  const { affinity, tags } = relationshipSnapshot(relationships, aiId, humanId)
  let chance = 0.58 + Math.max(-0.24, Math.min(0.24, affinity / 300))
  if (hasAny(tags, CLOSE_TAGS)) chance += 0.14
  if (hasAny(tags, STRAINED_TAGS)) chance -= 0.24
  return Math.max(0.12, Math.min(0.94, chance))
}

export function getHoldTheWallDealOfferChance(
  relationships: RelationshipsMap | undefined,
  aiId: string,
  humanId: string
): number {
  const { affinity, tags } = relationshipSnapshot(relationships, aiId, humanId)
  let chance = 0.34 + Math.max(-0.16, Math.min(0.2, affinity / 400))
  if (hasAny(tags, CLOSE_TAGS)) chance += 0.2
  if (hasAny(tags, STRAINED_TAGS)) chance -= 0.12
  return Math.max(0.1, Math.min(0.82, chance))
}

/**
 * Promise reliability is deliberately re-evaluated against the live relationship
 * graph when nominations happen. The random draw stays stable, so a relationship
 * that deteriorates after the wall deal can cross the same threshold and turn a
 * previously safe promise into a believable betrayal.
 */
export function getHoldTheWallDealHonorChance(
  relationships: RelationshipsMap | undefined,
  promisorId: string,
  beneficiaryId: string
): number {
  const { affinity, tags } = relationshipSnapshot(relationships, promisorId, beneficiaryId)
  let chance = 0.68 + Math.max(-0.3, Math.min(0.26, affinity / 260))
  if (hasAny(tags, CLOSE_TAGS)) chance += 0.18
  if (tags.has('romance') || tags.has('ride_or_die') || tags.has('primary_alliance')) {
    chance += 0.08
  }
  if (hasAny(tags, STRAINED_TAGS)) chance -= 0.32
  if (tags.has('betrayal') || tags.has('enemy')) chance -= 0.12
  return Math.max(0.06, Math.min(0.98, chance))
}

export function shouldAiOfferHoldTheWallDeal(input: {
  seed: number
  week: number
  relationships: RelationshipsMap | undefined
  aiId: string
  humanId: string
}): boolean {
  return (
    seededDecision(input.seed, `hold-wall-offer:${input.week}:${input.aiId}:${input.humanId}`) <
    getHoldTheWallDealOfferChance(input.relationships, input.aiId, input.humanId)
  )
}

export function shouldAiAcceptHoldTheWallDeal(input: {
  seed: number
  week: number
  relationships: RelationshipsMap | undefined
  aiId: string
  humanId: string
}): boolean {
  return (
    seededDecision(input.seed, `hold-wall-accept:${input.week}:${input.aiId}:${input.humanId}`) <
    getHoldTheWallDealAcceptanceChance(input.relationships, input.aiId, input.humanId)
  )
}

export function shouldAiHonorHoldTheWallDeal(input: {
  seed: number
  week: number
  relationships: RelationshipsMap | undefined
  promisorId: string
  beneficiaryId: string
}): boolean {
  return (
    seededDecision(
      input.seed,
      `hold-wall-honor:${input.week}:${input.promisorId}:${input.beneficiaryId}`
    ) <
    getHoldTheWallDealHonorChance(
      input.relationships,
      input.promisorId,
      input.beneficiaryId
    )
  )
}
