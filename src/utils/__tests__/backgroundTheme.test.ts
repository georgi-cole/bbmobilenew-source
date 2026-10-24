import { describe, expect, it } from 'vitest'
import {
  getHolidayTheme,
  getNextThemeBoundaryDelay,
  mapWeatherConditionsToTheme,
  mapWeatherCodeToTheme,
  selectThemeKey,
  timeOfDayKey,
} from '../backgroundTheme'

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
    expect(mapWeatherCodeToTheme(80)).toBe('rainbow')
    expect(mapWeatherCodeToTheme(95)).toBe('storm')
    expect(mapWeatherConditionsToTheme(3, 32)).toBe('wind')
    expect(mapWeatherConditionsToTheme(61, 40)).toBe('rain')
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
