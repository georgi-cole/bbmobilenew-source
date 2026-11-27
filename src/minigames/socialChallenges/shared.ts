import { normalizeAffinity } from '../../social/affinityUtils'
import { mulberry32 } from '../../store/rng'
import type { ReactMinigameCompletion } from '../competitionResult'
import type { GenericMinigameProps } from '../reactComponents'

export type ChallengePlayer = NonNullable<GenericMinigameProps['participants']>[number]

const SOCIAL_CHALLENGE_GAME_KEYS = ['rockPaperScissors', 'lastLight', 'riskWheelAbyss'] as const
type SocialChallengeGameKey = (typeof SOCIAL_CHALLENGE_GAME_KEYS)[number]

export function isSocialChallengeGameKey(key: string): key is SocialChallengeGameKey {
  return SOCIAL_CHALLENGE_GAME_KEYS.some((game) => game === key)
}

export function getChallengePlayers(props: GenericMinigameProps): ChallengePlayer[] {
  const players =
    props.participants ??
    props.participantIds?.map((id) => ({
      id,
      name: id,
      isHuman: false,
      precomputedScore: 0,
      previousPR: null,
    })) ??
    []
  return [...new Map(players.map((player) => [player.id, player])).values()]
}

/** Give every round and every actor a repeatable, separately seeded draw. */
export function challengeRng(seed: number | undefined, ...keys: (string | number)[]): () => number {
  let mixed = ((seed ?? 0) ^ 0x811c9dc5) >>> 0
  for (const character of JSON.stringify(keys)) {
    mixed = Math.imul(mixed ^ character.charCodeAt(0), 0x01000193)
  }
  return mulberry32(mixed)
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1))
    ;[shuffled[other], shuffled[index]] = [shuffled[index], shuffled[other]]
  }
  return shuffled
}

export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rng: () => number
): T | undefined {
  const weights = items.map((item) => {
    const value = weight(item)
    return Number.isFinite(value) ? Math.max(0.01, value) : 0.01
  })
  let ticket = rng() * weights.reduce((sum, value) => sum + value, 0)
  for (let index = 0; index < items.length; index += 1) {
    ticket -= weights[index]
    if (ticket < 0) return items[index]
  }
  return items.at(-1)
}

/**
 * Read only the selecting contestant's relationship and shared commitments.
 * Membership moves a choice without overriding suspicion or tactical incentives.
 */
export function socialPreference(props: GenericMinigameProps, from: string, to: string): number {
  if (from === to) return 0
  const relationship = props.relationships?.[from]?.[to]
  const tags = new Set(relationship?.tags)
  const feelings = relationship?.reality
  const hasAlliance = props.alliances?.some(
    (alliance) =>
      (alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY') &&
      alliance.memberIds.includes(from) &&
      alliance.memberIds.includes(to)
  )
  const commitment = tags.has('pact') ? 0.34 : hasAlliance || tags.has('alliance') ? 0.23 : 0
  const bond = ['romance', 'bromance', 'friendship'].some((tag) => tags.has(tag)) ? 0.14 : 0
  const conflict = ['rivalry', 'conflict', 'betrayal', 'target', 'unreliable'].some((tag) =>
    tags.has(tag)
  )
    ? 0.17
    : 0
  const affinity = normalizeAffinity(relationship?.affinity ?? 0)
  const trust = normalizeAffinity(feelings?.trust ?? 0)
  const loyalty = normalizeAffinity(feelings?.loyalty ?? 0)
  const suspicion = Math.max(
    tags.has('suspicious') ? 0.55 : 0,
    normalizeAffinity(feelings?.suspicion ?? 0)
  )
  const preference =
    affinity * 0.36 + commitment + bond + trust * 0.26 + loyalty * 0.12 - suspicion * 0.5 - conflict
  return Math.max(-1, Math.min(1, preference))
}

export function buildChallengeCompletion(
  rankedGroups: string[][],
  rawResults: Record<string, number>,
  humanId?: string,
  lastPlaceType: 'scored' | 'survival' = 'scored'
): ReactMinigameCompletion {
  const rankedIds = rankedGroups.flat()
  const lastPlaceIds = rankedGroups.at(-1) ?? []
  return {
    authoritativeWinnerId: rankedIds[0] ?? null,
    authoritativeWinnerIds: rankedGroups[0] ?? [],
    authoritativeLastPlaceId: lastPlaceIds.length === 1 ? lastPlaceIds[0] : null,
    authoritativeLastPlaceIds: lastPlaceIds,
    authoritativeRankedIds: rankedIds,
    authoritativeTiedGroups: rankedGroups,
    lastPlaceType,
    rawValue: humanId ? (rawResults[humanId] ?? 0) : 0,
    rawResults,
  }
}
