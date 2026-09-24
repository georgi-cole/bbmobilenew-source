import { describe, expect, it } from 'vitest'
import type { PlayerSeasonSummary, SeasonArchive } from '../store/seasonArchive'
import {
  buildEyeoleanCalibrationReport,
  buildEyeoleanCalibrationSamplesFromArchives,
  type EyeoleanCalibrationSample,
} from './eyeoleanCalibration'

function summary(overrides: Partial<PlayerSeasonSummary> = {}): PlayerSeasonSummary {
  return {
    playerId: 'user',
    displayName: 'Player',
    finalPlacement: null,
    ...overrides,
  }
}

describe('Eyeolean economy calibration', () => {
  it('reports payout distribution, outcome segments, source mix, and anchor pressure', () => {
    const samples: EyeoleanCalibrationSample[] = [
      {
        summary: summary({
          lohWins: 2,
          posWins: 1,
          madeJury: true,
        }),
      },
      {
        summary: summary({
          finalPlacement: 2,
          lohWins: 1,
        }),
      },
      {
        summary: summary({
          finalPlacement: 1,
          wonPublicFavorite: true,
          wonFinalHoh: true,
        }),
      },
      {
        summary: summary({
          battleBackWins: 1,
          survivedDoubleEviction: true,
        }),
      },
      {
        summary: summary({
          lohWins: 10,
        }),
      },
    ]

    const report = buildEyeoleanCalibrationReport(samples)

    expect(report.sampleSize).toBe(5)
    expect(report.totalMinted).toBe(265_000)
    expect(report.overall.min).toBe(9_000)
    expect(report.overall.max).toBe(135_000)
    expect(report.segments.nonFinalist.count).toBe(3)
    expect(report.segments.finalist.count).toBe(2)
    expect(report.segments.runnerUp.median).toBe(55_000)
    expect(report.segments.winner.median).toBe(135_000)
    expect(report.segments.publicFavorite.count).toBe(1)
    expect(report.segments.comeback.median).toBe(9_000)
    expect(report.segments.competitionHeavy.count).toBe(2)
    expect(report.pressure.nonFinalistAtOrAboveRunnerUp).toEqual({
      count: 1,
      share: 1 / 3,
    })
    expect(report.pressure.nonFinalistAtOrAbovePublicFavorite).toEqual({
      count: 1,
      share: 1 / 3,
    })
    expect(report.pressure.secondaryRewardShareOfMinted).toBeCloseTo(90_000 / 265_000)

    const lohSource = report.rewardSources.find((source) => source.code === 'loh_win')
    expect(lohSource).toMatchObject({
      awards: 13,
      total: 65_000,
    })
  })

  it('does not treat Public Favorite itself as secondary reward inflation', () => {
    const report = buildEyeoleanCalibrationReport([
      {
        summary: summary({
          finalPlacement: 5,
          wonPublicFavorite: true,
        }),
      },
    ])

    expect(report.overall.median).toBe(25_000)
    expect(report.pressure.nonFinalistAtOrAbovePublicFavorite).toEqual({
      count: 0,
      share: 0,
    })
    expect(report.pressure.nonFinalistAtOrAboveRunnerUp).toEqual({
      count: 0,
      share: 0,
    })
  })

  it('extracts only the requested player from authoritative season archives', () => {
    const archives: SeasonArchive[] = [
      {
        seasonIndex: 3,
        seasonId: 'season-3',
        playerSummaries: [
          summary({ playerId: 'user', lohWins: 1 }),
          summary({ playerId: 'ai-1', finalPlacement: 1 }),
        ],
      },
      {
        seasonIndex: 4,
        seasonId: 'season-4',
        playerSummaries: [
          summary({ playerId: 'user', finalPlacement: 2 }),
          summary({ playerId: 'ai-2', finalPlacement: 1 }),
        ],
      },
    ]

    const samples = buildEyeoleanCalibrationSamplesFromArchives(archives, 'user')

    expect(samples).toHaveLength(2)
    expect(samples.map((sample) => sample.seasonId)).toEqual(['season-3', 'season-4'])
    expect(buildEyeoleanCalibrationReport(samples).totalMinted).toBe(55_000)
  })

  it('returns a stable empty report when no completed samples are available', () => {
    const report = buildEyeoleanCalibrationReport([])

    expect(report.sampleSize).toBe(0)
    expect(report.totalMinted).toBe(0)
    expect(report.overall.median).toBeNull()
    expect(report.pressure.nonFinalistAtOrAboveRunnerUp).toEqual({ count: 0, share: 0 })
    expect(report.pressure.secondaryRewardShareOfMinted).toBe(0)
  })
})
