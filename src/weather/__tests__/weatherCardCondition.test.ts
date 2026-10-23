import { describe, expect, it } from 'vitest'
import { resolveWeatherCardCondition } from '../weatherCardCondition'
import { resolveWeatherDay } from '../weatherEngine'
import type { TvEvent } from '../../types'

describe('resolveWeatherCardCondition', () => {
  it('uses the recorded bulletin for the matching day', () => {
    const gameId = 'weather-card-recap-recorded'
    const day = 4
    const bulletin: TvEvent = {
      id: 'weather-day-four',
      text: 'Snow settles outside.',
      type: 'social',
      timestamp: 1,
      meta: {
        weatherBulletin: true,
        weatherBulletinDay: day,
        weatherCondition: 'snowy',
      },
    }

    expect(resolveWeatherCardCondition(gameId, day, [bulletin])).toBe('snowy')
  })

  it('falls back to the deterministic forecast when the day has no recorded bulletin', () => {
    const gameId = 'weather-card-recap-forecast'
    const day = 4

    expect(resolveWeatherCardCondition(gameId, day, [])).toBe(
      resolveWeatherDay(gameId, day).condition
    )
  })
})
