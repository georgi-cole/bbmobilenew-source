import { getDepressionShockWeatherCondition } from './depressionShockWeather'
import { resolveWeatherDay } from './weatherEngine'
import { isWeatherCondition } from './weatherConditionLabels'
import type { WeatherConditionId } from './weatherRuntime'

interface WeatherCardFeedEntry {
  meta?: Record<string, unknown>
}

/** Resolve the condition shown on a day's weather card, using its recorded bulletin when available. */
export function resolveWeatherCardCondition(
  gameId: string | undefined,
  day: number,
  tvFeed: readonly WeatherCardFeedEntry[]
): WeatherConditionId {
  const shockCondition = gameId ? getDepressionShockWeatherCondition(gameId, day) : null
  if (shockCondition) return shockCondition

  const bulletin = tvFeed.find(
    (event) => event.meta?.weatherBulletin === true && event.meta?.weatherBulletinDay === day
  )
  const recordedCondition = bulletin?.meta?.weatherCondition
  return isWeatherCondition(recordedCondition)
    ? recordedCondition
    : resolveWeatherDay(gameId, day).condition
}
