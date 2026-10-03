import type { GameState } from '../../types'

export interface HoldTheWallRelationshipRead {
  affinity: number
  tags: readonly string[]
}

export interface HoldTheWallSafetyDeal {
  week: number
  promisorId: string
  beneficiaryId: string
  source: 'hold_the_wall'
  affinityAtDeal: number
  tagsAtDeal: string[]
}

const CLOSE_TAGS = new Set([
  'ride_or_die',
  'romance',
  'bromance',
  'primary_alliance',
  'alliance',
  'protection',
  'shield',
])

const HOSTILE_TAGS = new Set([
  'betrayal',
  'rivalry',
  'target',
  'strained',
  'unreliable',
  'suspicious',
])

export const FINAL_DUEL_AI_DROP_INTERVAL_MS = 5_000
export const FINAL_DUEL_AI_DROP_CHANCE = 0.1

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hashStringU32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function seededUnit(value: string): number {
  return hashStringU32(value) / 0x1_0000_0000
}

function hasAnyTag(tags: readonly string[], vocabulary: ReadonlySet<string>): boolean {
  return tags.some((tag) => vocabulary.has(tag))
}

export function getHoldTheWallRelationshipRead(
  state: Pick<GameState, 'strategicRelationships'>,
  actorId: string,
  targetId: string
): HoldTheWallRelationshipRead {
  const relationship = state.strategicRelationships?.[actorId]?.[targetId]
  return {
    affinity: relationship?.affinity ?? 0,
    tags: relationship?.tags ?? [],
  }
}

export function getFinalTwoAiDealOfferChance(
  relationship: HoldTheWallRelationshipRead
): number {
  const tags = relationship.tags
  if (hasAnyTag(tags, HOSTILE_TAGS) || relationship.affinity <= -35) return 0.22
  if (hasAnyTag(tags, CLOSE_TAGS) || relationship.affinity >= 55) return 0.72
  if (relationship.affinity >= 20) return 0.6
  return 0.48
}

export function getFinalTwoAiDealAcceptanceChance(
  relationship: HoldTheWallRelationshipRead
): number {
  const tags = relationship.tags
  if (tags.includes('betrayal') || relationship.affinity <= -55) return 0.12
  if (hasAnyTag(tags, HOSTILE_TAGS) || relationship.affinity <= -25) return 0.28
  if (hasAnyTag(tags, CLOSE_TAGS) || relationship.affinity >= 60) return 0.94
  if (relationship.affinity >= 25) return 0.82
  return 0.62
}

export function shouldAiOfferHoldTheWallDeal(
  seed: number,
  aiId: string,
  humanId: string,
  relationship: HoldTheWallRelationshipRead
): boolean {
  return (
    seededUnit(`${seed}:${aiId}:${humanId}:hold-wall-offer`) <
    getFinalTwoAiDealOfferChance(relationship)
  )
}

export function shouldAiAcceptHoldTheWallDeal(
  seed: number,
  aiId: string,
  humanId: string,
  relationship: HoldTheWallRelationshipRead
): boolean {
  return (
    seededUnit(`${seed}:${aiId}:${humanId}:hold-wall-accept`) <
    getFinalTwoAiDealAcceptanceChance(relationship)
  )
}

export function shouldFinalDuelAiDrop(
  seed: number,
  aiId: string,
  rollIndex: number
): boolean {
  if (rollIndex < 1) return false
  return (
    seededUnit(`${seed}:${aiId}:hold-wall-final-duel:${rollIndex}`) <
    FINAL_DUEL_AI_DROP_CHANCE
  )
}

export function getHoldTheWallDealBetrayalChance(
  state: Pick<GameState, 'strategicRelationships'>,
  deal: Pick<
    HoldTheWallSafetyDeal,
    'promisorId' | 'beneficiaryId' | 'affinityAtDeal' | 'tagsAtDeal'
  >
): number {
  const current = getHoldTheWallRelationshipRead(
    state,
    deal.promisorId,
    deal.beneficiaryId
  )
  const currentTags = current.tags
  const closeNow = hasAnyTag(currentTags, CLOSE_TAGS)

  let chance =
    closeNow || current.affinity >= 60
      ? 0.035
      : current.affinity >= 35
        ? 0.07
        : current.affinity >= 10
          ? 0.12
          : current.affinity >= -15
            ? 0.2
            : current.affinity >= -40
              ? 0.32
              : 0.48

  if (hasAnyTag(currentTags, HOSTILE_TAGS)) chance += 0.16
  if (currentTags.includes('betrayal')) chance += 0.16

  const affinityDrop = deal.affinityAtDeal - current.affinity
  if (affinityDrop >= 50) chance += 0.22
  else if (affinityDrop >= 30) chance += 0.15
  else if (affinityDrop >= 15) chance += 0.08

  const wasClose = hasAnyTag(deal.tagsAtDeal, CLOSE_TAGS) || deal.affinityAtDeal >= 55
  if (wasClose && !closeNow && current.affinity < 45) chance += 0.12

  return clamp(chance, 0.02, 0.72)
}

export function getHoldTheWallDealDisposition(
  state: Pick<GameState, 'gameId' | 'seed' | 'week' | 'strategicRelationships'>,
  deal: HoldTheWallSafetyDeal
): 'honor' | 'betray' {
  const chance = getHoldTheWallDealBetrayalChance(state, deal)
  const roll = seededUnit(
    `${state.gameId}:${state.seed}:${state.week}:${deal.promisorId}:${deal.beneficiaryId}:hold-wall-betrayal`
  )
  return roll < chance ? 'betray' : 'honor'
}
