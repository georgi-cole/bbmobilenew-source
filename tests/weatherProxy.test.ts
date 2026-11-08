import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  normaliseForecast,
  WeatherCache,
  weatherCodeFromSymbol,
} from '../cloudflare/weather-proxy/src/index'

const forecast = {
  properties: {
    timeseries: [
      {
        data: {
          instant: { details: { air_temperature: 12.5, wind_speed: 31 } },
          next_1_hours: {
            summary: { symbol_code: 'rainshowers_day' },
            details: { precipitation_amount: 0.4 },
          },
        },
      },
    ],
  },
}

function createWeatherCache() {
  const rows = new Map<
    string,
    { responseJson: string; expiresAt: number; lastModified: string | null }
  >()
  const exec = vi.fn((statement: string, ...values: Array<string | number>) => {
    if (statement.startsWith('SELECT')) {
      const row = rows.get(String(values[0]))
      return { toArray: () => (row ? [row] : []) }
    }
    if (statement.startsWith('INSERT OR REPLACE')) {
      rows.set(String(values[0]), {
        responseJson: String(values[1]),
        expiresAt: Number(values[2]),
        lastModified: values[3] == null ? null : String(values[3]),
      })
    }
    if (statement.startsWith('DELETE')) {
      for (const [key, row] of rows) {
        if (row.expiresAt <= Number(values[0])) rows.delete(key)
      }
    }
    return { toArray: () => [] }
  })
  const ctx = { storage: { sql: { exec } } }
  return { worker: new WeatherCache(ctx as unknown as DurableObjectState), exec }
}

function weatherRequest(lat = 42.7, lon = 23.3) {
  return new Request('https://weather-cache.internal/v1/current', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MET Norway weather response mapping', () => {
  it.each([
    ['clearsky_day', 0],
    ['partlycloudy_night', 2],
    ['cloudy', 3],
    ['fog', 45],
    ['lightrain', 51],
    ['rain', 61],
    ['heavyrain', 65],
    ['rainshowers_day', 80],
    ['snow', 71],
    ['snowshowers_day', 85],
    ['thunderstorm', 95],
  ])('maps %s to WMO weather code %i', (symbol, expected) => {
    expect(weatherCodeFromSymbol(symbol)).toBe(expected)
  })

  it('converts current observations and keeps rain, shower, and snow amounts distinct', () => {
    const response = normaliseForecast({
      properties: {
        timeseries: [
          {
            data: {
              instant: { details: { air_temperature: 12.5, wind_speed: 31 } },
              next_1_hours: {
                summary: { symbol_code: 'rainshowers_day' },
                details: { precipitation_amount: 0.4 },
              },
            },
          },
        ],
      },
    })
    expect(response).toEqual({
      current: {
        weather_code: 80,
        wind_speed_10m: 31,
        rain: 0.4,
        showers: 0.4,
        snowfall: 0,
      },
    })
  })

  it('uses zero precipitation when measurements are missing and rejects malformed forecasts', () => {
    expect(
      normaliseForecast({
        properties: {
          timeseries: [
            {
              data: {
                instant: { details: { wind_speed: 2 } },
                next_1_hours: { summary: { symbol_code: 'clearsky_day' } },
              },
            },
          ],
        },
      })
    ).toEqual({
      current: {
        weather_code: 0,
        wind_speed_10m: 2,
        rain: 0,
        showers: 0,
        snowfall: 0,
      },
    })
    expect(normaliseForecast({})).toBeNull()
  })

  it('shares requests, honors MET expiry, and sends If-Modified-Since when refreshing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    const lastModified = 'Sun, 08 Nov 2026 06:00:00 GMT'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(forecast, {
          headers: {
            Expires: 'Sun, 08 Nov 2026 18:00:00 GMT',
            'Last-Modified': lastModified,
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: {
            Expires: 'Sun, 08 Nov 2026 21:00:00 GMT',
            'Last-Modified': lastModified,
          },
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    const { worker } = createWeatherCache()

    const [first, simultaneous] = await Promise.all([
      worker.fetch(weatherRequest()),
      worker.fetch(weatherRequest()),
    ])
    expect(first.status).toBe(200)
    expect(simultaneous.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=21600')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('User-Agent')).toContain(
      'TheBigEye'
    )

    const cached = await worker.fetch(weatherRequest())
    expect(cached.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-11-08T15:00:00Z'))
    const withinProviderExpiry = await worker.fetch(weatherRequest())
    expect(withinProviderExpiry.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-11-08T18:00:00Z'))
    const refreshed = await worker.fetch(weatherRequest())
    expect(refreshed.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('If-Modified-Since')).toBe(
      lastModified
    )
    expect(refreshed.headers.get('Cache-Control')).toBe('public, max-age=10800')
  })

  it('uses a three-hour minimum cache interval when provider expiry is shorter', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    const fetchMock = vi.fn(async () =>
      Response.json(forecast, { headers: { Expires: 'Sun, 08 Nov 2026 12:30:00 GMT' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    const { worker } = createWeatherCache()

    const response = await worker.fetch(weatherRequest())
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=10800')

    vi.setSystemTime(new Date('2026-11-08T14:59:59Z'))
    await worker.fetch(weatherRequest())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches an upstream failure for three hours to avoid repeating the provider request', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const { worker } = createWeatherCache()

    expect((await worker.fetch(weatherRequest())).status).toBe(502)
    expect((await worker.fetch(weatherRequest())).status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
