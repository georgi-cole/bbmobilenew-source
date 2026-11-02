import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWeatherLocation } from '../../services/locationAccess'
import {
  getHolidayTheme,
  getNextThemeBoundaryDelay,
  mapWeatherConditionsToTheme,
  mapWeatherCodeToTheme,
  resolveTheme,
  selectThemeKey,
  timeOfDayKey,
} from '../backgroundTheme'

vi.mock('../../services/locationAccess', () => ({ getWeatherLocation: vi.fn() }))

function localDate(hour: number, month = 6, day = 10): Date {
  return new Date(2026, month - 1, day, hour, 30, 0, 0)
}

describe('background theme selection', () => {
  it.each([
    [5, 'sunrise'],
    [8, 'day'],
    [18, 'sunset'],
    [21, 'night'],
  ] as const)('uses the %s-hour local time bucket', (hour, expected) => {
    expect(timeOfDayKey(localDate(hour))).toBe(expected)
  })

  it('uses the matching weather and daypart scene', () => {
    expect(selectThemeKey('rain', localDate(12))).toBe('weather:rain:day')
    expect(selectThemeKey('snow', localDate(6))).toBe('weather:snow:sunrise')
    expect(selectThemeKey('snow', localDate(19))).toBe('weather:snow:sunset')
    expect(selectThemeKey('snow', localDate(22))).toBe('weather:snow:night')
  })

  it('maps precipitation, fog, snow, showers, and storms into distinct weather families', () => {
    expect(mapWeatherCodeToTheme(51)).toBe('drizzle')
    expect(mapWeatherCodeToTheme(61)).toBe('rain')
    expect(mapWeatherCodeToTheme(45)).toBe('fog')
    expect(mapWeatherCodeToTheme(71)).toBe('snow')
    expect(mapWeatherCodeToTheme(80)).toBe('rain')
    expect(mapWeatherCodeToTheme(95)).toBe('storm')
    expect(mapWeatherConditionsToTheme(3, 32)).toBe('wind')
    expect(mapWeatherConditionsToTheme(61, 40)).toBe('rain')
  })

  it.each([80, 81, 82])('treats rain shower code %s as rain in daylight', (code) => {
    expect(selectThemeKey(mapWeatherCodeToTheme(code), localDate(12))).toBe('weather:rain:day')
  })

  it('uses current precipitation alongside clear, cloudy, or foggy weather codes', () => {
    expect(mapWeatherConditionsToTheme(0, 4, { rain: 0.1 })).toBe('rain')
    expect(mapWeatherConditionsToTheme(2, 32, { showers: 0.3 })).toBe('rain')
    expect(mapWeatherConditionsToTheme(45, 4, { rain: 0.1 })).toBe('rain')
    expect(mapWeatherConditionsToTheme(3, 4, { snowfall: 0.1 })).toBe('snow')
    expect(mapWeatherConditionsToTheme(3, 4, { rain: 0, showers: 0, snowfall: 0 })).toBeNull()
  })

  it('preserves explicit precipitation and storm codes over other reported conditions', () => {
    expect(mapWeatherConditionsToTheme(95, 40, { rain: 0.5, snowfall: 0.1 })).toBe('storm')
    expect(mapWeatherConditionsToTheme(71, 40, { rain: 0.5 })).toBe('snow')
    expect(mapWeatherConditionsToTheme(61, 40, { snowfall: 0.1 })).toBe('rain')
    expect(mapWeatherConditionsToTheme(51, 40, { rain: 0.1 })).toBe('drizzle')
  })

  it('uses daylight rainbows and falls back to rain at night', () => {
    expect(selectThemeKey('rainbow', localDate(12))).toBe('weather:rainbow:day')
    expect(selectThemeKey('rainbow', localDate(22))).toBe('weather:rain:night')
  })

  it('uses holiday art for Halloween, Christmas, New Year, and Orthodox Easter', () => {
    expect(selectThemeKey(null, localDate(12, 10, 20))).toBe('holiday:halloween:day')
    expect(selectThemeKey(null, localDate(22, 12, 24))).toBe('holiday:christmas:night')
    expect(selectThemeKey(null, localDate(19, 12, 31))).toBe('holiday:newYear:sunset')
    expect(selectThemeKey(null, localDate(12, 4, 12))).toBe('holiday:easter:day')
  })

  it('keeps the Christmas theme through December and switches to New Year on New Year’s Eve night', () => {
    expect(getHolidayTheme(localDate(12, 12, 1))).toBe('christmas')
    expect(getHolidayTheme(localDate(12, 12, 30))).toBe('christmas')
    expect(getHolidayTheme(localDate(17, 12, 31))).toBe('christmas')
    expect(getHolidayTheme(localDate(18, 12, 31))).toBe('newYear')
    expect(getHolidayTheme(localDate(12, 1, 1))).toBe('newYear')
  })

  it('recognizes both Gregorian and Orthodox Easter weekends', () => {
    // In 2026 Gregorian Easter is April 5 and Orthodox Easter is April 12.
    expect(getHolidayTheme(localDate(12, 4, 3))).toBe('easter')
    expect(getHolidayTheme(localDate(12, 4, 6))).toBe('easter')
    expect(getHolidayTheme(localDate(12, 4, 10))).toBe('easter')
    expect(getHolidayTheme(localDate(12, 4, 13))).toBe('easter')
    expect(getHolidayTheme(localDate(12, 4, 7))).not.toBe('easter')
    expect(getHolidayTheme(localDate(12, 4, 14))).not.toBe('easter')
  })

  it('recognizes Independence Day for the holiday Play button skin', () => {
    const independenceDay = localDate(12, 7, 4)

    expect(getHolidayTheme(independenceDay)).toBe('independenceDay')
    expect(selectThemeKey(null, independenceDay)).toBe('day')
  })

  it('schedules the next local light or date boundary', () => {
    expect(getNextThemeBoundaryDelay(localDate(7))).toBe(30 * 60 * 1000)
    expect(getNextThemeBoundaryDelay(localDate(23))).toBe(30 * 60 * 1000)
  })
})

describe('current weather background resolution', () => {
  const fetchWeather = vi.fn<typeof fetch>()

  const weatherResponse = (current: Record<string, unknown>): Response =>
    ({ ok: true, json: async () => ({ current }) }) as Response

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(localDate(12))
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.mocked(getWeatherLocation).mockResolvedValue({
      coordinates: { latitude: 42.7, longitude: 23.3 },
      permissionStatus: 'granted',
      error: null,
    })
    fetchWeather.mockReset()
    vi.stubGlobal('fetch', fetchWeather)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('requests current rain, showers, and snowfall and uses rain despite a cloudy code', async () => {
    fetchWeather.mockResolvedValue(
      weatherResponse({ weather_code: 2, wind_speed_10m: 5, rain: 0.2, showers: 0, snowfall: 0 })
    )

    expect(await resolveTheme()).toMatchObject({
      key: 'weather:rain:day',
      reason: 'weather:2:rain',
    })
    const requested = new URL(String(fetchWeather.mock.calls[0][0]))
    expect(requested.searchParams.get('current')).toBe(
      'weather_code,wind_speed_10m,rain,showers,snowfall'
    )
    expect(requested.searchParams.get('wind_speed_unit')).toBe('kmh')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [{ weather_code: 80 }, 'weather:rain:day'],
    [{ weather_code: 0, showers: 0.2 }, 'weather:rain:day'],
    [{ weather_code: 3, snowfall: 0.1 }, 'weather:snow:day'],
    [{ weather_code: 3, wind_speed_10m: 32 }, 'weather:wind:day'],
    [{ weather_code: 3, wind_speed_10m: 5, rain: 0, showers: 0, snowfall: 0 }, 'day'],
  ] as const)('resolves current conditions %j to %s', async (current, key) => {
    fetchWeather.mockResolvedValue(weatherResponse(current))
    expect(await resolveTheme()).toMatchObject({ key })
  })

  it.each([
    {},
    { current: null },
    { current: {} },
    { current: { weather_code: '61' } },
    { current: { weather_code: Number.NaN } },
  ])('falls back safely when the current response is invalid: %j', async (data) => {
    fetchWeather.mockResolvedValue({ ok: true, json: async () => data } as Response)
    expect(await resolveTheme()).toMatchObject({ key: 'day', reason: 'fallback:weather' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores invalid optional measurements while retaining a valid weather code', async () => {
    fetchWeather.mockResolvedValue(
      weatherResponse({ weather_code: 3, wind_speed_10m: '40', rain: '1', showers: Infinity })
    )
    expect(await resolveTheme()).toMatchObject({ key: 'day', reason: 'weather:3:timeofday' })
  })

  it('falls back on HTTP and JSON errors and clears the request deadline', async () => {
    fetchWeather
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError('Invalid JSON')
        },
      } as unknown as Response)

    expect(await resolveTheme()).toMatchObject({ key: 'day', reason: 'fallback:weather' })
    expect(vi.getTimerCount()).toBe(0)
    expect(await resolveTheme()).toMatchObject({ key: 'day', reason: 'fallback:weather' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['request', 'body'] as const)(
    'times out a stalled %s and allows the next weather request to succeed',
    async (stage) => {
      fetchWeather.mockImplementationOnce(() =>
        stage === 'request'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, json: () => new Promise(() => {}) } as Response)
      )
      const pending = resolveTheme()
      await vi.advanceTimersByTimeAsync(8000)

      expect(await pending).toMatchObject({ key: 'day', reason: 'fallback:weather' })
      const signal = fetchWeather.mock.calls[0][1]?.signal
      expect(signal?.aborted).toBe(true)
      expect(vi.getTimerCount()).toBe(0)

      fetchWeather.mockResolvedValueOnce(weatherResponse({ weather_code: 61, rain: 0.3 }))
      expect(await resolveTheme()).toMatchObject({
        key: 'weather:rain:day',
        reason: 'weather:61:rain',
      })
    }
  )
})
