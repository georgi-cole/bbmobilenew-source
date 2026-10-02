import type { WeatherConditionId } from './weatherRuntime'

export const WEATHER_CONDITION_LABELS: Record<WeatherConditionId, string> = {
  sunny: 'Clear',
  mostly_sunny: 'Mostly sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  overcast: 'Overcast',
  misty: 'Misty',
  foggy: 'Foggy',
  drizzle: 'Drizzle',
  light_showers: 'Light showers',
  sun_showers: 'Sun showers',
  rainy: 'Rain',
  heavy_rain: 'Heavy rain',
  stormy: 'Thunderstorms',
  snow_showers: 'Snow showers',
  snowy: 'Snow',
  clearing: 'Clearing',
}

export function isWeatherCondition(value: unknown): value is WeatherConditionId {
  return typeof value === 'string' && value in WEATHER_CONDITION_LABELS
}

export function getWeatherConditionLabel(condition: WeatherConditionId): string {
  return WEATHER_CONDITION_LABELS[condition]
}
