import { computeScores, type RawResult } from '../minigames/scoring'
import { rankPressurePlankResults } from '../components/PressurePlank/pressurePlankLogic'
import type { CompetitionResult } from '../minigames/competitionResult'
import type { PendingChallenge } from './challengeSlice'
import type { GameState } from '../types'

export type RankedChallengeResult = RawResult & { score: number; points: number; rank: number }

export function rankChallengeResults(
  challenge: PendingChallenge,
  rawResults: RawResult[],
  options: { partial?: boolean; humanId?: string; authoritativeRankedIds?: string[] } = {}
): RankedChallengeResult[] {
  const ranked =
    challenge.game.key === 'pressurePlank'
      ? rankPressurePlankResults(
          challenge.participants,
          Object.fromEntries(rawResults.map((result) => [result.playerId, result.rawValue])),
          challenge.seed
        ).map((result) => ({
          ...rawResults.find((raw) => raw.playerId === result.playerId),
          playerId: result.playerId,
          rawValue: result.survivalSeconds,
          score: result.survivalSeconds,
          points: Math.round(result.survivalSeconds),
          rank: result.rank,
        }))
      : computeScores(challenge.game.scoringAdapter, rawResults, challenge.game.scoringParams ?? {})

  const reported = options.authoritativeRankedIds
  if (
    reported &&
    (challenge.game.key !== 'pressurePlank' || options.partial) &&
    reported.length === ranked.length &&
    new Set(reported).size === ranked.length &&
    ranked.every((result) => reported.includes(result.playerId))
  ) {
    ranked.sort((left, right) => reported.indexOf(left.playerId) - reported.indexOf(right.playerId))
  }

  if (options.partial && options.humanId) {
    const human = ranked.find((result) => result.playerId === options.humanId)
    if (human) {
      human.score = 0
      human.points = 0
      ranked.splice(ranked.indexOf(human), 1)
      ranked.push(human)
    }
  }
  return ranked.map((result, index) => ({ ...result, rank: index + 1 }))
}

/** The same losing outcome is used for a deliberate exit and an interrupted process. */
export function createAbandonedChallengeResult(
  challenge: PendingChallenge,
  humanId: string | undefined
): CompetitionResult {
  const rawResults = challenge.participants.map((playerId) => ({
    playerId,
    rawValue: playerId === humanId ? 0 : (challenge.aiScores[playerId] ?? 0),
    ...(challenge.aiTiebreakers?.[playerId] != null
      ? { tiebreaker: challenge.aiTiebreakers[playerId] }
      : {}),
  }))
  const ranked = rankChallengeResults(challenge, rawResults, { partial: true, humanId })
  const winnerId =
    challenge.forcedWinnerId &&
    challenge.forcedWinnerId !== humanId &&
    challenge.participants.includes(challenge.forcedWinnerId)
      ? challenge.forcedWinnerId
      : ranked.find((result) => result.playerId !== humanId)?.playerId
  const orderedIds = ranked.map((result) => result.playerId)
  if (winnerId) {
    orderedIds.splice(orderedIds.indexOf(winnerId), 1)
    orderedIds.unshift(winnerId)
  }
  return {
    rawValue: 0,
    partial: true,
    completion: {
      rawValue: 0,
      rawResults: Object.fromEntries(
        rawResults.map((result) => [result.playerId, result.rawValue])
      ),
      authoritativeWinnerId: winnerId,
      authoritativeLastPlaceId: humanId,
      authoritativeRankedIds: orderedIds,
    },
  }
}

/** A feature may have committed its winner before its visual callback ran. */
export function recoverCommittedChallengeResult(
  challenge: PendingChallenge,
  game: GameState
): CompetitionResult | null {
  const phase = challenge.origin?.phase
  if (!phase || (phase !== 'loh_comp' && phase !== 'pos_comp') || game.phase === phase) return null
  const winnerId = phase === 'pos_comp' ? game.posWinnerId : game.lohId
  if (!winnerId || !challenge.participants.includes(winnerId)) return null
  const receipt = game.lastCompetitionResolution
  if (
    !receipt ||
    receipt.status !== 'completed' ||
    receipt.week !== game.week ||
    receipt.winnerId !== winnerId
  )
    return null
  const humanId = game.players.find((player) => player.isUser)?.id
  const rawValue = receipt.humanScore ?? 0
  return {
    rawValue,
    partial: false,
    completion: {
      authoritativeWinnerId: winnerId,
      ...(receipt?.week === game.week && receipt.winnerId === winnerId
        ? {
            authoritativeLastPlaceId: receipt.lastPlaceId,
            authoritativeRankedIds: receipt.placements,
          }
        : {}),
      rawResults: { ...challenge.aiScores, ...(humanId ? { [humanId]: rawValue } : {}) },
    },
  }
}
