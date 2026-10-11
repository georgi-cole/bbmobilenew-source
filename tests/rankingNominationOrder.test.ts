import { describe, expect, it } from 'vitest'
import { getBlackjackTournamentLastPlace } from '../src/features/blackjackTournament/blackjackTournamentSlice'
import { computeMassElimination } from '../src/features/cwgo/cwgoHelpers'
import {
  buildPlacements,
  getGlassBridgeLastPlace,
  type GlassBridgePlayerProgress,
} from '../src/features/glassBridge/glassBridgeSlice'

describe('public-mode nomination ranking', () => {
  it('uses the lowest league-ranked Blackjack non-finalist, not the top non-finalist', () => {
    const result = getBlackjackTournamentLastPlace({
      leagueRankings: ['winner', 'qualifier-1', 'qualifier-2', 'quartz', 'nova', 'echo'],
      finalistIds: ['winner', 'qualifier-1', 'qualifier-2'],
      eliminatedPlayerIds: ['quartz', 'nova', 'echo'],
    })

    expect(result).toEqual({ playerId: 'echo', type: 'scored' })
  })

  it('uses the first eliminated finalist when everyone advanced from the Blackjack league', () => {
    const result = getBlackjackTournamentLastPlace({
      leagueRankings: ['winner', 'other-finalist', 'quartz'],
      finalistIds: ['winner', 'other-finalist', 'quartz'],
      eliminatedPlayerIds: ['quartz', 'other-finalist'],
    })

    expect(result).toEqual({ playerId: 'quartz', type: 'survival' })
  })

  it('keeps a CWGO elimination batch in worst-overshoot-first order', () => {
    const ids = ['quartz', 'worst-overshoot', 'valid-1', 'valid-2']
    const result = computeMassElimination(
      [
        { playerId: ids[0], guess: 101 },
        { playerId: ids[1], guess: 200 },
        { playerId: ids[2], guess: 99 },
        { playerId: ids[3], guess: 90 },
      ],
      100,
      ids,
    )

    expect(result.eliminated).toEqual(['worst-overshoot', 'quartz'])
  })

  it('uses the last player in the displayed Crystal Path placements', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      winner: {
        playerId: 'winner',
        furthestRowReached: 10,
        timeReachedFurthestRowMs: 2_000,
        finishTimeMs: 2_000,
        eliminated: false,
        hintPenaltyMs: 0,
      },
      quartz: {
        playerId: 'quartz',
        furthestRowReached: 4,
        timeReachedFurthestRowMs: 1_000,
        eliminated: true,
        hintPenaltyMs: 0,
      },
      worst: {
        playerId: 'worst',
        furthestRowReached: 0,
        timeReachedFurthestRowMs: 0,
        eliminated: true,
        hintPenaltyMs: 0,
      },
    }
    const placements = buildPlacements(progress, ['quartz', 'worst', 'winner'])

    expect(placements).toEqual(['winner', 'quartz', 'worst'])
    expect(getGlassBridgeLastPlace(placements)).toBe('worst')
  })
})
