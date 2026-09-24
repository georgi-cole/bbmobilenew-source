import type { PlayerPublicProfile, PublicFeedEntry } from './types'

export type PublicSaveDecisiveReason =
  | 'audience_mix'
  | 'momentum'
  | 'storyline'
  | 'underdog'
  | 'poll_noise'
  | 'tiebreak'

export interface PublicSaveResult {
  savedId: string
  tieBreakUsed: boolean
  voteShareByPlayerId: Record<string, number>
  winningShare: number
  winningMargin: number
  scoreByPlayerId: Record<string, number>
  decisiveReason: PublicSaveDecisiveReason
  audienceMix: {
    charisma: number
    gameplay: number
    integrity: number
  }
}

export interface PublicSaveContext {
  seed?: number
  week?: number
  feed?: readonly PublicFeedEntry[]
  nominationCounts?: Record<string, number>
}

/** Floating-point tolerance for score comparisons. */
const FLOAT_EQUALITY_EPSILON = 0.001
/** Store shares as tenths of one percent while allocating the remainder. */
const SHARE_UNITS = 1000

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

function seasonAverage(profile: PlayerPublicProfile): number {
  if (profile.seasonApprovals.length === 0) return profile.approval
  return (
    profile.seasonApprovals.reduce((sum, value) => sum + value, 0) / profile.seasonApprovals.length
  )
}

function stableHash(text: string): number {
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function unitNoise(key: string): number {
  return (stableHash(key) / 0xffffffff) * 2 - 1
}

/**
 * Each save has a slightly different active audience composition. This makes
 * Charisma, Gameplay and Integrity matter differently from week to week without
 * changing after a reload.
 */
export function getPublicSaveAudienceMix(
  seed = 0,
  week = 1
): {
  charisma: number
  gameplay: number
  integrity: number
} {
  const raw = {
    charisma: 1 + unitNoise(`${seed}:${week}:charisma`) * 0.28,
    gameplay: 1 + unitNoise(`${seed}:${week}:gameplay`) * 0.28,
    integrity: 1 + unitNoise(`${seed}:${week}:integrity`) * 0.28,
  }
  const total = raw.charisma + raw.gameplay + raw.integrity
  return {
    charisma: raw.charisma / total,
    gameplay: raw.gameplay / total,
    integrity: raw.integrity / total,
  }
}

function audienceWeightedScore(
  profile: PlayerPublicProfile | undefined,
  mix: ReturnType<typeof getPublicSaveAudienceMix>
): number {
  const approval = profile?.approval ?? 50
  const breakdown = profile?.audienceBreakdown
  const charisma = breakdown?.charisma ?? approval
  const gameplay = breakdown?.gameplay ?? approval
  const integrity = breakdown?.integrity ?? approval
  return charisma * mix.charisma + gameplay * mix.gameplay + integrity * mix.integrity
}

function momentumScore(profile: PlayerPublicProfile | undefined): number {
  if (!profile) return 50
  const momentum = clamp(profile.approval - profile.previousApproval, -12, 12)
  return clamp(50 + momentum * 3, 0, 100)
}

function storylineScore(
  playerId: string,
  feed: readonly PublicFeedEntry[] | undefined,
  week: number
): number {
  if (!feed?.length) return 50
  const visibleImpact = feed
    .filter((entry) => entry.playerId === playerId && entry.week === week)
    .slice(0, 6)
    .reduce((sum, entry) => sum + entry.delta, 0)
  return clamp(50 + clamp(visibleImpact, -12, 12) * 2.5, 0, 100)
}

function underdogScore(
  playerId: string,
  nominationCounts: Record<string, number> | undefined
): number {
  const count = nominationCounts?.[playerId] ?? 0
  return clamp(50 + Math.max(0, count - 1) * 6, 0, 70)
}

function pollNoise(seed: number, week: number, playerId: string): number {
  // Maximum ±3 score points. It can swing a close race but cannot erase a large lead.
  return unitNoise(`${seed}:${week}:public-save:${playerId}`) * 3
}

interface PublicSaveComponents {
  audienceMix: number
  momentum: number
  storyline: number
  underdog: number
  approval: number
  noise: number
}

function buildComponents(params: {
  nomineeIds: string[]
  profiles: Record<string, PlayerPublicProfile>
  context?: PublicSaveContext
}): {
  mix: ReturnType<typeof getPublicSaveAudienceMix>
  componentsByPlayerId: Record<string, PublicSaveComponents>
} {
  const { nomineeIds, profiles, context } = params
  const seed = context?.seed ?? 0
  const week = context?.week ?? 1
  const mix = getPublicSaveAudienceMix(seed, week)

  const componentsByPlayerId = Object.fromEntries(
    nomineeIds.map((playerId) => {
      const profile = profiles[playerId]
      return [
        playerId,
        {
          audienceMix: audienceWeightedScore(profile, mix),
          momentum: momentumScore(profile),
          storyline: storylineScore(playerId, context?.feed, week),
          underdog: underdogScore(playerId, context?.nominationCounts),
          approval: clamp(profile?.approval ?? 50, 0, 100),
          noise: context ? pollNoise(seed, week, playerId) : 0,
        },
      ]
    })
  )

  return { mix, componentsByPlayerId }
}

export function buildPublicSaveScores(params: {
  nomineeIds: string[]
  profiles: Record<string, PlayerPublicProfile>
  context?: PublicSaveContext
}): Record<string, number> {
  const { nomineeIds } = params
  const { componentsByPlayerId } = buildComponents(params)

  return Object.fromEntries(
    nomineeIds.map((playerId) => {
      const component = componentsByPlayerId[playerId]
      const score =
        component.audienceMix * 0.62 +
        component.momentum * 0.12 +
        component.storyline * 0.11 +
        component.underdog * 0.07 +
        component.approval * 0.08 +
        component.noise
      return [playerId, clamp(score, 0, 100)]
    })
  )
}

/**
 * Convert arbitrary non-negative audience scores into a deterministic vote
 * distribution that totals exactly 100.0%.
 */
export function normalisePublicSaveVoteShares(
  playerIds: string[],
  scores: Record<string, number>
): Record<string, number> {
  if (playerIds.length === 0) return {}

  const safeScores = playerIds.map((playerId) => {
    const score = scores[playerId]
    return Number.isFinite(score) ? Math.max(0, score) : 0
  })
  const scoreTotal = safeScores.reduce((sum, value) => sum + value, 0)
  const weightedScores = scoreTotal > 0 ? safeScores : safeScores.map(() => 1)
  const weightedTotal = weightedScores.reduce((sum, value) => sum + value, 0)
  const exactUnits = weightedScores.map((value) => (value / weightedTotal) * SHARE_UNITS)
  const allocatedUnits = exactUnits.map(Math.floor)
  let remainingUnits = SHARE_UNITS - allocatedUnits.reduce((sum, value) => sum + value, 0)

  const remainderOrder = playerIds
    .map((playerId, index) => ({
      playerId,
      index,
      remainder: exactUnits[index] - allocatedUnits[index],
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.playerId.localeCompare(right.playerId)
    )

  for (let index = 0; remainingUnits > 0; index = (index + 1) % remainderOrder.length) {
    allocatedUnits[remainderOrder[index].index] += 1
    remainingUnits -= 1
  }

  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, allocatedUnits[index] / 10])
  )
}

export function buildPublicSaveVoteShares(params: {
  nomineeIds: string[]
  profiles: Record<string, PlayerPublicProfile>
  context?: PublicSaveContext
}): Record<string, number> {
  return normalisePublicSaveVoteShares(params.nomineeIds, buildPublicSaveScores(params))
}

function decisiveReason(
  winnerId: string,
  runnerUpId: string | undefined,
  componentsByPlayerId: Record<string, PublicSaveComponents>,
  tied: boolean
): PublicSaveDecisiveReason {
  if (!runnerUpId || tied) return tied ? 'tiebreak' : 'audience_mix'
  const winner = componentsByPlayerId[winnerId]
  const runnerUp = componentsByPlayerId[runnerUpId]
  const advantages: Array<[PublicSaveDecisiveReason, number]> = [
    ['audience_mix', (winner.audienceMix - runnerUp.audienceMix) * 0.62],
    ['momentum', (winner.momentum - runnerUp.momentum) * 0.12],
    ['storyline', (winner.storyline - runnerUp.storyline) * 0.11],
    ['underdog', (winner.underdog - runnerUp.underdog) * 0.07],
    ['poll_noise', winner.noise - runnerUp.noise],
  ]
  return advantages.sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'audience_mix'
}

/**
 * Resolve a Public Save ballot.
 *
 * Visible overall approval remains important, but it is no longer the ballot.
 * The save uses a seeded audience mix, current momentum, visible story beats,
 * repeated-nomination underdog support and a small stable polling uncertainty.
 */
export function resolvePublicSaveNominee(params: {
  nomineeIds: string[]
  profiles: Record<string, PlayerPublicProfile>
  context?: PublicSaveContext
}): PublicSaveResult {
  const { nomineeIds, profiles } = params
  const { mix, componentsByPlayerId } = buildComponents(params)
  const scoreByPlayerId = buildPublicSaveScores(params)
  const voteShareByPlayerId = normalisePublicSaveVoteShares(nomineeIds, scoreByPlayerId)

  if (nomineeIds.length === 0) {
    return {
      savedId: '',
      tieBreakUsed: false,
      voteShareByPlayerId,
      winningShare: 0,
      winningMargin: 0,
      scoreByPlayerId,
      decisiveReason: 'tiebreak',
      audienceMix: mix,
    }
  }

  if (nomineeIds.length === 1) {
    const savedId = nomineeIds[0]
    return {
      savedId,
      tieBreakUsed: false,
      voteShareByPlayerId,
      winningShare: voteShareByPlayerId[savedId] ?? 100,
      winningMargin: voteShareByPlayerId[savedId] ?? 100,
      scoreByPlayerId,
      decisiveReason: 'audience_mix',
      audienceMix: mix,
    }
  }

  const sorted = [...nomineeIds].sort((leftId, rightId) => {
    const scoreDifference = scoreByPlayerId[rightId] - scoreByPlayerId[leftId]
    if (Math.abs(scoreDifference) > FLOAT_EQUALITY_EPSILON) return scoreDifference

    const left = profiles[leftId]
    const right = profiles[rightId]
    if (!left && !right) return leftId.localeCompare(rightId)
    if (!left) return 1
    if (!right) return -1

    const averageDifference = seasonAverage(right) - seasonAverage(left)
    if (Math.abs(averageDifference) > FLOAT_EQUALITY_EPSILON) return averageDifference
    if (right.completedDirectionCount !== left.completedDirectionCount) {
      return right.completedDirectionCount - left.completedDirectionCount
    }
    return leftId.localeCompare(rightId)
  })

  const savedId = sorted[0]
  const runnerUpId = sorted[1]
  const tieBreakUsed =
    Math.abs(scoreByPlayerId[savedId] - scoreByPlayerId[runnerUpId]) <= FLOAT_EQUALITY_EPSILON
  const winningShare = voteShareByPlayerId[savedId] ?? 0
  const winningMargin = Math.max(0, winningShare - (voteShareByPlayerId[runnerUpId] ?? 0))

  return {
    savedId,
    tieBreakUsed,
    voteShareByPlayerId,
    winningShare,
    winningMargin,
    scoreByPlayerId,
    decisiveReason: decisiveReason(savedId, runnerUpId, componentsByPlayerId, tieBreakUsed),
    audienceMix: mix,
  }
}
