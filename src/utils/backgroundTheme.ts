import {
  getBinaryFallbackKey,
  getSkinCandidates,
  hasSkinAsset,
  getPlatformLabel,
  resolveSkinAsset,
  SKIN_REGISTRY,
  type GeolocationPermissionStatus,
  type SkinAssetSource,
  type ThemeKey,
  type TimeOfDayKey,
  type HolidayThemeKey,
  type WeatherThemeKey,
  type PlatformLabel,
} from './skinAssets'
import { getWeatherLocation } from '../services/locationAccess'

/**
 * backgroundTheme.ts
 *
 * Resolves a background from holiday, weather, and local time. The manifest
 * only lists current modern artwork; missing combinations fall back safely.
 *
 * The skin lookup itself is handled by src/utils/skinAssets.ts, which provides
 * a shared native-safe registry and a bundled asset URL resolver.
 */

const base = import.meta.env.BASE_URL ?? '/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`
export const ASSETS_BASE = `${normalizedBase}assets/skins/`

export interface BackgroundEntry {
  file: string
  label: string
}

export const BACKGROUNDS: Record<ThemeKey, BackgroundEntry> = Object.fromEntries(
  Object.entries(SKIN_REGISTRY).map(([key, entry]) => [
    key,
    { file: entry.canonicalFile, label: entry.label },
  ])
) as Record<ThemeKey, BackgroundEntry>

export const CANDIDATES: Record<ThemeKey, string[]> = Object.fromEntries(
  Object.entries(SKIN_REGISTRY).map(([key, entry]) => [
    key,
    [entry.canonicalFile, ...(entry.aliases ?? [])],
  ])
) as Record<ThemeKey, string[]>

/**
 * Maps Open-Meteo WMO weathercode to a theme key.
 * https://open-meteo.com/en/docs#weathervariables
 */
export function mapWeatherCodeToTheme(weathercode: number): WeatherThemeKey | null {
  if (weathercode === 0 || weathercode === 1) return null // clear — fall through to time-of-day
  if (weathercode === 2 || weathercode === 3) return null // partly/overcast — time-of-day
  if (weathercode >= 51 && weathercode <= 55) return 'drizzle'
  if (weathercode >= 56 && weathercode <= 67) return 'rain'
  if (weathercode === 45 || weathercode === 48) return 'fog'
  if (weathercode >= 71 && weathercode <= 77) return 'snow' // snow
  if (weathercode >= 80 && weathercode <= 82) return 'rain' // rain showers
  if (weathercode >= 85 && weathercode <= 86) return 'snow' // snow showers
  if (weathercode >= 95 && weathercode <= 99) return 'storm'
  return null
}

export function mapWeatherConditionsToTheme(
  weathercode: number,
  windspeedKmh?: number,
  precipitation: { rain?: number; showers?: number; snowfall?: number } = {}
): WeatherThemeKey | null {
  const codedTheme = mapWeatherCodeToTheme(weathercode)
  if (codedTheme && codedTheme !== 'fog') return codedTheme
  // Current precipitation can still be present when the model's weather code
  // describes cloud cover or fog. Keep explicit rain/snow/storm codes above it.
  if (typeof precipitation.snowfall === 'number' && precipitation.snowfall > 0) return 'snow'
  if (
    (typeof precipitation.rain === 'number' && precipitation.rain > 0) ||
    (typeof precipitation.showers === 'number' && precipitation.showers > 0)
  ) {
    return 'rain'
  }
  if (codedTheme) return codedTheme
  return typeof windspeedKmh === 'number' && windspeedKmh >= 28 ? 'wind' : null
}

/**
 * Returns a time-of-day theme key based on the local hour.
 *   05–07  → sunrise
 *   08–17  → day
 *   18–20  → sunset
 *   21–04  → night
 */
export function timeOfDayKey(date: Date): TimeOfDayKey {
  const hour = date.getHours()
  if (hour >= 5 && hour <= 7) return 'sunrise'
  if (hour >= 8 && hour <= 17) return 'day'
  if (hour >= 18 && hour <= 20) return 'sunset'
  return 'night'
}

export interface ResolvedTheme {
  key: ThemeKey
  url: string
  reason: string
  assetFile: string
  assetSource: SkinAssetSource
  platform: PlatformLabel
  permissionStatus: GeolocationPermissionStatus
}

export interface ResolveOptions {
  geolocationTimeoutMs?: number
  forceNoGeo?: boolean
  requestLocationPermission?: boolean
}

interface CurrentWeather {
  weathercode: number
  windspeed?: number
  rain?: number
  showers?: number
  snowfall?: number
}

/** Queries Open-Meteo for current model conditions, including precipitation. */
async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=weather_code,wind_speed_10m,rain,showers,snowfall&wind_speed_unit=kmh`
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new Error('Open-Meteo request timed out'))
    }, 8000)
  })
  const readConditions = async (): Promise<CurrentWeather> => {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
    const data = (await res.json()) as { current?: Record<string, unknown> }
    const current = data?.current
    const finiteValue = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined
    const weathercode = finiteValue(current?.weather_code)
    if (weathercode == null) throw new Error('No valid weather_code in response')
    return {
      weathercode,
      windspeed: finiteValue(current?.wind_speed_10m),
      rain: finiteValue(current?.rain),
      showers: finiteValue(current?.showers),
      snowfall: finiteValue(current?.snowfall),
    }
  }

  try {
    // The deadline also covers body parsing and releases the caller even if a
    // platform's fetch implementation does not settle promptly after aborting.
    return await Promise.race([readConditions(), deadline])
  } finally {
    clearTimeout(timeout)
  }
}

/** Orthodox Easter is observed by the app's Bulgarian primary audience. */
function getOrthodoxEasterSunday(year: number): Date {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const julianMonth = Math.floor((d + e + 114) / 31)
  const julianDay = ((d + e + 114) % 31) + 1
  const julianToGregorianDays = Math.floor(year / 100) - Math.floor(year / 400) - 2
  return new Date(year, julianMonth - 1, julianDay + julianToGregorianDays)
}

/** Gregorian Easter is used by Catholic, Protestant, and some Orthodox churches. */
function getGregorianEasterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function isEasterPeriod(date: Date, easterSunday: Date): boolean {
  const start = new Date(
    easterSunday.getFullYear(),
    easterSunday.getMonth(),
    easterSunday.getDate() - 2
  )
  const end = new Date(
    easterSunday.getFullYear(),
    easterSunday.getMonth(),
    easterSunday.getDate() + 1
  )
  const currentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return currentDay >= start && currentDay <= end
}

function isEasterPeriodForEitherCalendar(date: Date): boolean {
  const year = date.getFullYear()
  return (
    isEasterPeriod(date, getGregorianEasterSunday(year)) ||
    isEasterPeriod(date, getOrthodoxEasterSunday(year))
  )
}

export function getHolidayTheme(date: Date): HolidayThemeKey | null {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 10 && day >= 15 && day <= 31) return 'halloween'
  if ((month === 12 && day === 31 && date.getHours() >= 18) || (month === 1 && day === 1)) {
    return 'newYear'
  }
  if (month === 12) return 'christmas'
  if (month === 7 && day === 4) return 'independenceDay'
  if (isEasterPeriodForEitherCalendar(date)) return 'easter'
  return null
}

/** Picks the most specific available art, then falls back to local time. */
export function selectThemeKey(weather: WeatherThemeKey | null, date: Date): ThemeKey {
  const timeKey = timeOfDayKey(date)
  const holiday = getHolidayTheme(date)
  const candidates: ThemeKey[] = []
  const weatherForTime = weather === 'rainbow' && timeKey === 'night' ? 'rain' : weather

  if (holiday && weatherForTime) {
    candidates.push(
      `holiday:${holiday}:${weatherForTime}:${timeKey}`,
      `holiday:${holiday}:${weatherForTime}:any`
    )
  }
  if (holiday) {
    candidates.push(`holiday:${holiday}:${timeKey}`, `holiday:${holiday}:any`)
  }
  if (weatherForTime) {
    candidates.push(`weather:${weatherForTime}:${timeKey}`, `weather:${weatherForTime}:any`)
  }
  candidates.push(timeKey)
  return candidates.find((key) => getSkinCandidates(key).some(hasSkinAsset)) ?? timeKey
}

/** Milliseconds until the next local time or date boundary that can change art. */
export function getNextThemeBoundaryDelay(date: Date): number {
  const candidates = [5, 8, 18, 21]
    .map((hour) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0))
    .filter((boundary) => boundary.getTime() > date.getTime())
  candidates.push(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0))
  return Math.max(1, Math.min(...candidates.map((boundary) => boundary.getTime() - date.getTime())))
}

function logBackgroundResolution(details: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info('[backgroundTheme] resolution', details)
  }
}

/**
 * Resolves the background theme to display.
 *
 * Resolution order: holiday variant, weather + time variant, weather fallback,
 * then the modern time-of-day scene.
 *
 * The selected theme key is resolved against the shared skin registry and,
 * if needed, falls back to the binary day/night background for the current
 * local time so the app never renders with an empty background.
 */
export async function resolveTheme({
  geolocationTimeoutMs = 7000,
  forceNoGeo = false,
  requestLocationPermission = false,
}: ResolveOptions = {}): Promise<ResolvedTheme> {
  const now = new Date()
  const platform = getPlatformLabel()
  const location = forceNoGeo
    ? null
    : await getWeatherLocation(geolocationTimeoutMs, requestLocationPermission)
  const permissionStatus = forceNoGeo ? 'unsupported' : (location?.permissionStatus ?? 'unknown')
  const permissionDenied = permissionStatus === 'denied'
  const timeKey = timeOfDayKey(now)
  const binaryFallbackKey = getBinaryFallbackKey(now)

  let selectedKey: ThemeKey
  let reason: string
  let coordinates: { latitude: number; longitude: number } | null = null
  let locationError: string | null = null
  let weatherCode: number | null = null
  let windSpeedKmh: number | null = null
  let weatherKey: WeatherThemeKey | null = null

  if (location?.coordinates && !permissionDenied) {
    // 2. Geolocation + weather
    try {
      const { latitude, longitude } = location.coordinates
      coordinates = { latitude, longitude }
      const currentWeather = await fetchCurrentWeather(latitude, longitude)
      weatherCode = currentWeather.weathercode
      windSpeedKmh = currentWeather.windspeed ?? null
      weatherKey = mapWeatherConditionsToTheme(
        weatherCode,
        windSpeedKmh ?? undefined,
        currentWeather
      )
      selectedKey = selectThemeKey(weatherKey, now)
      reason = weatherKey
        ? `weather:${weatherCode}:${weatherKey}`
        : `weather:${weatherCode}:timeofday`
    } catch (err) {
      locationError = err instanceof Error ? err.message : String(err)
      selectedKey = selectThemeKey(null, now)
      reason = 'fallback:weather'
    }
  } else {
    // No usable location signal: fall back to a guaranteed day/night asset.
    locationError = forceNoGeo
      ? 'forceNoGeo'
      : (location?.error ?? (permissionDenied ? 'permission denied' : 'location unavailable'))
    selectedKey = selectThemeKey(null, now)
    reason = 'fallback:location'
  }

  const resolvedAsset = resolveSkinAsset(selectedKey, binaryFallbackKey)
  const resolvedReason =
    resolvedAsset.key === selectedKey ? reason : `${reason}:asset-fallback:${resolvedAsset.key}`

  logBackgroundResolution({
    platform,
    permissionStatus,
    coordinates,
    locationError,
    weatherCode,
    windSpeedKmh,
    weatherKey,
    timeKey,
    binaryFallbackKey,
    selectedKey,
    resolvedKey: resolvedAsset.key,
    selectedAssetFile: resolvedAsset.file,
    selectedAssetSource: resolvedAsset.source,
    selectedAssetUrl: resolvedAsset.url,
    reason: resolvedReason,
  })

  return {
    key: resolvedAsset.key,
    url: resolvedAsset.url,
    reason: resolvedReason,
    assetFile: resolvedAsset.file,
    assetSource: resolvedAsset.source,
    platform,
    permissionStatus,
  }
}

export type { ThemeKey } from './skinAssets'
