import { completeChallenge } from './challengeSlice'
import { rankChallengeResults } from './challengeResults'
import { applyMinigameWinner } from './gameSlice'
import type { AppDispatch, RootState } from './store'

/** Shared by live spectator play and condensed Tribunal viewing. */
export const resolveAiOnlyChallenge =
  (expectedId: string) =>
  (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const { game, challenge } = getState()
    const pending = challenge.pending
    if (
      !pending ||
      pending.id !== expectedId ||
      !['loh_comp', 'pos_comp'].includes(game.phase) ||
      !pending.participants.length ||
      pending.participants.some((id) => game.players.find((player) => player.id === id)?.isUser)
    )
      return false
    const rawResults = pending.participants.map((id) => ({
      playerId: id,
      rawValue: pending.aiScores[id] ?? 0,
      ...(pending.aiTiebreakers?.[id] != null ? { tiebreaker: pending.aiTiebreakers[id] } : {}),
    }))
    const scoreWinnerId = dispatch(
      completeChallenge(rawResults, {
        authoritativeWinnerId: pending.forcedWinnerId,
      })
    )
    const winnerId = pending.forcedWinnerId ?? scoreWinnerId ?? pending.participants[0]
    const ranked = rankChallengeResults(pending, rawResults)
    const lastNonWinner = [...ranked].reverse().find((result) => result.playerId !== winnerId)
    dispatch(
      applyMinigameWinner({
        winnerId,
        lastPlaceId: lastNonWinner?.playerId ?? null,
        skipSeasonUpdate: true,
        participants: pending.participants,
        scores: Object.fromEntries(ranked.map((result) => [result.playerId, result.score])),
        placements: ranked.map((result) => result.playerId),
        runId: pending.id,
        gameKey: pending.game.key,
      })
    )
    return true
  }
