import type { RootState } from '../../../src/store/store'
import type { PlayerSeasonSummary } from '../../../src/store/seasonArchive'
import {
  computeSeasonEyeoleanRewards,
  EYEOLEAN_REWARD_AMOUNTS,
  totalEyeoleanRewards,
} from '../../../src/economy/eyeoleans'
import type { SimulationEyeoleanSample } from './types'

type GameState = RootState['game']

function rewardSummaryFromLiveGame(game: GameState): PlayerSeasonSummary | null {
  const user = game.players.find((player) => player.isUser)
  if (!user) return null

  const lohWins = user.stats?.lohWins ?? 0
  const posWins = user.stats?.posWins ?? 0
  const timesNominated = user.stats?.timesNominated ?? 0

  return {
    playerId: user.id,
    displayName: user.name,
    finalPlacement: user.finalRank ?? user.seasonPlacement ?? null,
    isEvicted: user.status === 'evicted' || user.status === 'jury',
    lohWins,
    posWins,
    compsWon: lohWins + posWins,
    timesNominated,
    noms: timesNominated,
    madeJury: user.status === 'jury',
    battleBackWins: user.stats?.battleBackWins ?? 0,
    wonPublicFavorite:
      game.favoritePlayer?.winnerId != null && game.favoritePlayer.winnerId === user.id,
    wonFinalHoh: user.stats?.wonFinalHoh ?? false,
    survivedDoubleEviction: user.stats?.survivedDoubleEviction ? true : undefined,
  }
}

/**
 * Produces a calibration sample only from a completed authoritative outcome.
 *
 * Early-elimination simulations first look for the resolved archive written by the
 * eliminated-season middleware. Finale simulations can fall back to live final state
 * after the season-complete phase. Partial/action-budget runs are deliberately excluded.
 */
export function buildSimulationEyeoleanSample(game: GameState): SimulationEyeoleanSample | null {
  const user = game.players.find((player) => player.isUser)
  if (!user) return null

  const archivedSeason = (game.seasonArchives ?? []).find(
    (archive) =>
      archive.seasonIndex === game.season &&
      archive.playerSummaries.some((summary) => summary.playerId === user.id)
  )
  const archivedSummary = archivedSeason?.playerSummaries.find(
    (summary) => summary.playerId === user.id
  )

  const source: SimulationEyeoleanSample['source'] = archivedSummary ? 'archive' : 'season-complete'
  const summary =
    archivedSummary ??
    (game.seasonFinale?.phase === 'seasonComplete' ? rewardSummaryFromLiveGame(game) : null)

  if (!summary) return null

  const publicFavoriteAwardAmount =
    game.favoritePlayer?.awardAmount ?? EYEOLEAN_REWARD_AMOUNTS.publicFavorite
  const rewards = computeSeasonEyeoleanRewards(summary, { publicFavoriteAwardAmount })

  return {
    source,
    season: game.season,
    seasonId: archivedSeason?.seasonId,
    playerId: summary.playerId,
    summary,
    rewards,
    total: totalEyeoleanRewards(rewards),
  }
}
