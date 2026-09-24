import { describe, expect, it } from 'vitest'
import { PUBLIC_FAVORITE_FORECAST_EYEOLEANS } from '../economy/eyeoleans'
import profilesReducer, {
  awardPublicFavoriteForecast,
  createProfile,
  PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT,
} from './profilesSlice'

describe('Public Favorite forecast profile reward', () => {
  it('adds permanent Eyeoleans and the achievement only once for an event', () => {
    let state = profilesReducer(undefined, createProfile({ name: 'Test', avatar: '👤' }))
    state = profilesReducer(
      state,
      awardPublicFavoriteForecast({ eventId: 'season-11-public-favorite' })
    )
    state = profilesReducer(
      state,
      awardPublicFavoriteForecast({ eventId: 'season-11-public-favorite' })
    )

    const profile = state.profiles[0]
    expect(profile.eyeoleans).toBe(PUBLIC_FAVORITE_FORECAST_EYEOLEANS)
    expect(profile.eyeoleanTransactions).toHaveLength(1)
    expect(profile.eyeoleanTransactions?.[0]?.source).toBe('forecast_reward')
    expect(profile.achievements).toContain(PUBLIC_FAVORITE_FORECAST_ACHIEVEMENT)
    expect(profile.forecastRewardEventIds).toEqual(['season-11-public-favorite'])
  })
})
