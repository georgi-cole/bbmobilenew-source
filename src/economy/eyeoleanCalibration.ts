import type { PlayerSeasonSummary, SeasonArchive } from '../store/seasonArchive'
import {
  computeSeasonEyeoleanRewards,
  EYEOLEAN_REWARD_AMOUNTS,
  type EyeoleanRewardCode,
  type EyeoleanRewardLine,
  totalEyeoleanRewards,
} from './eyeoleans'

export interface EyeoleanCalibrationSample {
  summary: PlayerSeasonSummary
  /** Optional non-default Public Favorite prize used for this season. */
  publicFavoriteAwardAmount?: number
  /** Optional trace labels supplied by a simulator or archive importer. */
  seasonId?: string
  personaId?: string
  mode?: string
}

export interface EyeoleanDistributionStats {
  count: number
  min: number | null
  max: number | null
  mean: number | null
  p25: number | null
  median: number | null
  p75: number | null
  p90: number | null
  p95: number | null
}

export interface EyeoleanRewardSourceStats {
  code: EyeoleanRewardCode
  awards: number
  total: number
  shareOfMinted: number
}

export interface EyeoleanThresholdMetric {
  count: number
  share: number
}

export interface EyeoleanCalibrationReport {
  sampleSize: number
  totalMinted: number
  overall: EyeoleanDistributionStats
  segments: {
    nonFinalist: EyeoleanDistributionStats
    finalist: EyeoleanDistributionStats
    runnerUp: EyeoleanDistributionStats
    winner: EyeoleanDistributionStats
    publicFavorite: EyeoleanDistributionStats
    comeback: EyeoleanDistributionStats
    competitionHeavy: EyeoleanDistributionStats
  }
  rewardSources: EyeoleanRewardSourceStats[]
  pressure: {
    /** How often a non-finalist reaches the 50k runner-up anchor through secondary rewards. */
    nonFinalistAtOrAboveRunnerUp: EyeoleanThresholdMetric
    /** How often a non-finalist reaches the 25k Public Favorite anchor. */
    nonFinalistAtOrAbovePublicFavorite: EyeoleanThresholdMetric
    /** Share of all minted season currency coming from non-anchor rewards. */
    secondaryRewardShareOfMinted: number
  }
}

interface EvaluatedSample {
  input: EyeoleanCalibrationSample
  rewards: EyeoleanRewardLine[]
  total: number
}

const ANCHOR_CODES = new Set<EyeoleanRewardCode>(['season_winner', 'runner_up', 'public_favorite'])

function finitePositiveInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]

  const bounded = Math.max(0, Math.min(1, fraction))
  const index = (sorted.length - 1) * bounded
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]

  const weight = index - lower
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * weight)
}

function distribution(values: readonly number[]): EyeoleanDistributionStats {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, Math.floor(value)))
    .sort((left, right) => left - right)

  if (sorted.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      p25: null,
      median: null,
      p75: null,
      p90: null,
      p95: null,
    }
  }

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
  }
}

function thresholdMetric(values: readonly number[], threshold: number): EyeoleanThresholdMetric {
  if (values.length === 0) return { count: 0, share: 0 }
  const count = values.filter((value) => value >= threshold).length
  return { count, share: count / values.length }
}

function placement(summary: PlayerSeasonSummary): number | null {
  const value = summary.finalPlacement
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null
}

function isCompetitionHeavy(summary: PlayerSeasonSummary): boolean {
  return finitePositiveInt(summary.lohWins) + finitePositiveInt(summary.posWins) >= 3
}

function evaluate(sample: EyeoleanCalibrationSample): EvaluatedSample {
  const rewards = computeSeasonEyeoleanRewards(sample.summary, {
    publicFavoriteAwardAmount: sample.publicFavoriteAwardAmount,
  })
  return {
    input: sample,
    rewards,
    total: totalEyeoleanRewards(rewards),
  }
}

function segment(
  samples: readonly EvaluatedSample[],
  predicate: (sample: EvaluatedSample) => boolean
): EyeoleanDistributionStats {
  return distribution(samples.filter(predicate).map((sample) => sample.total))
}

/**
 * Converts real or simulated season summaries into an economy calibration report.
 *
 * This layer intentionally does not invent gameplay outcomes. Feed it authoritative
 * summaries from completed seasons, the human-like season simulator, or archive exports.
 */
export function buildEyeoleanCalibrationReport(
  samples: readonly EyeoleanCalibrationSample[]
): EyeoleanCalibrationReport {
  const evaluated = samples.map(evaluate)
  const allTotals = evaluated.map((sample) => sample.total)
  const nonFinalists = evaluated.filter((sample) => {
    const rank = placement(sample.input.summary)
    return rank !== 1 && rank !== 2
  })
  const rewardSourceMap = new Map<EyeoleanRewardCode, { awards: number; total: number }>()

  let secondaryMinted = 0
  for (const sample of evaluated) {
    for (const reward of sample.rewards) {
      const current = rewardSourceMap.get(reward.code) ?? { awards: 0, total: 0 }
      current.awards += reward.quantity
      current.total += reward.amount
      rewardSourceMap.set(reward.code, current)
      if (!ANCHOR_CODES.has(reward.code)) secondaryMinted += reward.amount
    }
  }

  const totalMinted = allTotals.reduce((sum, value) => sum + value, 0)
  const rewardSources = [...rewardSourceMap.entries()]
    .map(
      ([code, value]): EyeoleanRewardSourceStats => ({
        code,
        awards: value.awards,
        total: value.total,
        shareOfMinted: totalMinted > 0 ? value.total / totalMinted : 0,
      })
    )
    .sort((left, right) => right.total - left.total || left.code.localeCompare(right.code))

  const nonFinalistTotals = nonFinalists.map((sample) => sample.total)

  return {
    sampleSize: evaluated.length,
    totalMinted,
    overall: distribution(allTotals),
    segments: {
      nonFinalist: distribution(nonFinalistTotals),
      finalist: segment(evaluated, (sample) => {
        const rank = placement(sample.input.summary)
        return rank === 1 || rank === 2
      }),
      runnerUp: segment(evaluated, (sample) => placement(sample.input.summary) === 2),
      winner: segment(evaluated, (sample) => placement(sample.input.summary) === 1),
      publicFavorite: segment(
        evaluated,
        (sample) => sample.input.summary.wonPublicFavorite === true
      ),
      comeback: segment(
        evaluated,
        (sample) => finitePositiveInt(sample.input.summary.battleBackWins) > 0
      ),
      competitionHeavy: segment(evaluated, (sample) => isCompetitionHeavy(sample.input.summary)),
    },
    rewardSources,
    pressure: {
      nonFinalistAtOrAboveRunnerUp: thresholdMetric(
        nonFinalistTotals,
        EYEOLEAN_REWARD_AMOUNTS.runnerUp
      ),
      nonFinalistAtOrAbovePublicFavorite: thresholdMetric(
        nonFinalistTotals,
        EYEOLEAN_REWARD_AMOUNTS.publicFavorite
      ),
      secondaryRewardShareOfMinted: totalMinted > 0 ? secondaryMinted / totalMinted : 0,
    },
  }
}

/**
 * Extract one player's completed-season summaries from persisted archives.
 * Keeping playerId explicit prevents accidentally treating the entire AI cast as
 * equivalent to the human wallet economy.
 */
export function buildEyeoleanCalibrationSamplesFromArchives(
  archives: readonly SeasonArchive[],
  playerId: string,
  publicFavoriteAwardAmount = EYEOLEAN_REWARD_AMOUNTS.publicFavorite
): EyeoleanCalibrationSample[] {
  if (!playerId) return []

  return archives.flatMap((archive) => {
    const summary = archive.playerSummaries.find((candidate) => candidate.playerId === playerId)
    if (!summary) return []
    return [
      {
        summary,
        seasonId: archive.seasonId,
        publicFavoriteAwardAmount,
      },
    ]
  })
}
