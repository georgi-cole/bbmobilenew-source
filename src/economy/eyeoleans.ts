import type { PlayerSeasonSummary } from '../store/seasonArchive'

export const EYEOLEAN_REWARD_AMOUNTS = {
  lohWin: 5_000,
  posWin: 4_000,
  tribunalMember: 2_000,
  battleBackWin: 6_000,
  survivedDoubleEviction: 3_000,
  survivedTripleEviction: 5_000,
  publicFavorite: 25_000,
  finalLohWin: 10_000,
  seasonWinner: 100_000,
  runnerUp: 50_000,
} as const

/**
 * Forecasting the Public Favorite correctly is a smaller meta-game reward.
 * It is deliberately meaningful because the prediction is difficult, while still
 * remaining well below the 25k Public Favorite prize itself.
 */
export const PUBLIC_FAVORITE_FORECAST_EYEOLEANS = 5_000

export type EyeoleanRewardCode =
  | 'season_winner'
  | 'runner_up'
  | 'public_favorite'
  | 'final_loh'
  | 'loh_win'
  | 'pos_win'
  | 'battle_back_win'
  | 'tribunal_member'
  | 'survived_double_eviction'
  | 'survived_triple_eviction'

export interface EyeoleanRewardLine {
  code: EyeoleanRewardCode
  label: string
  quantity: number
  unitAmount: number
  amount: number
}

export interface SeasonEyeoleanOptions {
  /** Public Favorite remains admin-configurable; defaults to the canonical 25k prize. */
  publicFavoriteAwardAmount?: number
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function addReward(
  rewards: EyeoleanRewardLine[],
  code: EyeoleanRewardCode,
  label: string,
  quantity: number,
  unitAmount: number
): void {
  const safeQuantity = positiveInteger(quantity)
  const safeUnitAmount = positiveInteger(unitAmount)
  if (safeQuantity <= 0 || safeUnitAmount <= 0) return

  rewards.push({
    code,
    label,
    quantity: safeQuantity,
    unitAmount: safeUnitAmount,
    amount: safeQuantity * safeUnitAmount,
  })
}

/**
 * Converts already-authoritative season results into persistent soft-currency rewards.
 *
 * Important: this intentionally rewards outcomes rather than raw minigame scores,
 * social-action volume, or repeatable clicks. Those inputs are too easy to farm and
 * would make the future store economy impossible to balance.
 */
export function computeSeasonEyeoleanRewards(
  summary: PlayerSeasonSummary | null | undefined,
  options: SeasonEyeoleanOptions = {}
): EyeoleanRewardLine[] {
  if (!summary) return []

  const rewards: EyeoleanRewardLine[] = []
  const placement = positiveInteger(summary.finalPlacement)

  if (placement === 1) {
    addReward(rewards, 'season_winner', 'Season winner', 1, EYEOLEAN_REWARD_AMOUNTS.seasonWinner)
  } else if (placement === 2) {
    addReward(rewards, 'runner_up', 'Runner-up', 1, EYEOLEAN_REWARD_AMOUNTS.runnerUp)
  }

  if (summary.wonPublicFavorite) {
    addReward(
      rewards,
      'public_favorite',
      'Public favorite',
      1,
      options.publicFavoriteAwardAmount ?? EYEOLEAN_REWARD_AMOUNTS.publicFavorite
    )
  }

  if (summary.wonFinalHoh) {
    addReward(rewards, 'final_loh', 'Final LOH', 1, EYEOLEAN_REWARD_AMOUNTS.finalLohWin)
  }

  addReward(
    rewards,
    'loh_win',
    'LOH win',
    positiveInteger(summary.lohWins),
    EYEOLEAN_REWARD_AMOUNTS.lohWin
  )
  addReward(
    rewards,
    'pos_win',
    'Safety win',
    positiveInteger(summary.posWins),
    EYEOLEAN_REWARD_AMOUNTS.posWin
  )
  addReward(
    rewards,
    'battle_back_win',
    'Back 2 the Game win',
    positiveInteger(summary.battleBackWins),
    EYEOLEAN_REWARD_AMOUNTS.battleBackWin
  )

  if (summary.madeJury) {
    addReward(
      rewards,
      'tribunal_member',
      'Tribunal member',
      1,
      EYEOLEAN_REWARD_AMOUNTS.tribunalMember
    )
  }
  if (summary.survivedDoubleEviction) {
    addReward(
      rewards,
      'survived_double_eviction',
      'Survived double eviction',
      1,
      EYEOLEAN_REWARD_AMOUNTS.survivedDoubleEviction
    )
  }
  if (summary.survivedTripleEviction) {
    addReward(
      rewards,
      'survived_triple_eviction',
      'Survived triple eviction',
      1,
      EYEOLEAN_REWARD_AMOUNTS.survivedTripleEviction
    )
  }

  return rewards
}

export function totalEyeoleanRewards(rewards: readonly EyeoleanRewardLine[]): number {
  return rewards.reduce((sum, reward) => sum + positiveInteger(reward.amount), 0)
}

export function formatEyeoleans(amount: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    positiveInteger(amount)
  )
}

/**
 * Stable across reloads so opening the final modal twice cannot pay the same season twice.
 */
export function buildEyeoleanSeasonSettlementId(
  season: number,
  gameId: string | null | undefined,
  seed: number
): string {
  return `eyeoleans:season:${positiveInteger(season)}:${gameId ?? seed}`
}
