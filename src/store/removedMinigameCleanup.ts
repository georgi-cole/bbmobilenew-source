import { getGame } from '../minigames/registryBase'
import type { GameState } from '../types'
import type { ChallengeState } from './challengeSlice'

export function isRemovedMinigameKey(key: string): boolean {
  return key === 'laneRacers'
}

/** Remove obsolete personal records without mutating a saved or Redux payload. */
export function removeObsoleteGameData(game: GameState): GameState {
  let recordsRemoved = false
  const players = Array.isArray(game.players)
    ? game.players.map((player) => {
        const records = player.stats?.gamePRs
        if (!records || !Object.prototype.hasOwnProperty.call(records, 'laneRacers')) return player
        recordsRemoved = true
        const gamePRs = { ...records }
        delete gamePRs.laneRacers
        return { ...player, stats: { ...player.stats!, gamePRs } }
      })
    : game.players
  const pending = game.pendingMinigame
  const replacePending = pending && isRemovedMinigameKey(pending.key)
  const removeResult =
    game.lastCompetitionResolution && isRemovedMinigameKey(game.lastCompetitionResolution.gameKey)
  if (!recordsRemoved && !replacePending && !removeResult) return game
  return {
    ...game,
    players: recordsRemoved ? players : game.players,
    ...(replacePending
      ? { pendingMinigame: { ...pending, key: 'quickTap', quickTapVariant: 'classic' as const } }
      : {}),
    ...(removeResult ? { lastCompetitionResolution: null, minigameResult: null } : {}),
  }
}

/** Resume an old pending race through Quick Tap and discard obsolete score history. */
export function removeObsoleteChallengeData(challenge: ChallengeState): ChallengeState {
  const pending = challenge.pending
  const replacePending = pending && isRemovedMinigameKey(pending.game.key)
  const history = (challenge.history ?? []).filter((run) => !isRemovedMinigameKey(run.gameKey))
  const removeDebugOverride =
    challenge.debug?.forceGameKey && isRemovedMinigameKey(challenge.debug.forceGameKey)
  if (!replacePending && history.length === challenge.history?.length && !removeDebugOverride)
    return challenge
  return {
    ...challenge,
    history,
    ...(replacePending
      ? {
          pending: {
            ...pending,
            game: { ...getGame('quickTap')!, timeLimitMs: pending.game.timeLimitMs },
            phase: 'rules' as const,
            musicVariant: 'normal' as const,
          },
        }
      : {}),
    ...(removeDebugOverride ? { debug: { ...challenge.debug, forceGameKey: undefined } } : {}),
  }
}
