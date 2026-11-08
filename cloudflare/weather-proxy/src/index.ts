const MET_LOCATIONFORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const CACHE_TTL_SECONDS = 3 * 60 * 60
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000
const MAX_REQUEST_BODY_BYTES = 256
const APP_USER_AGENT =
  'TheBigEye/1.0 (https://georgi-cole.github.io/big-eye-legal/support.html; kolequant@gmail.com)'

type WeatherDetails = {
  air_temperature?: unknown
  wind_speed?: unknown
}

type ForecastData = {
  instant?: { details?: WeatherDetails }
  next_1_hours?: {
    details?: { precipitation_amount?: unknown }
    summary?: { symbol_code?: unknown }
  }
  next_6_hours?: {
    details?: { precipitation_amount?: unknown }
    summary?: { symbol_code?: unknown }
  }
}

type ForecastResponse = {
  properties?: {
    timeseries?: Array<{ data?: ForecastData }>
  }
}

type WeatherPayload = {
  current: {
    weather_code: number
    wind_speed_10m?: number
    rain?: number
    showers?: number
    snowfall?: number
  }
}

type CachedWeather = {
  responseJson: string
  expiresAt: number
  lastModified: string | null
}

type WeatherFetchResult = {
  weather: WeatherPayload | null
  expiresAt: number
  lastModified: string | null
}

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  )
}

function corsHeaders(origin: string | null, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  })
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  return headers
}

function roundWeatherCoordinate(value: number): number {
  // This is only used to choose an ambient background; 0.1° keeps requests
  // cacheable and avoids sending a household-level location to the provider.
  return Math.round(value * 10) / 10
}

async function readCoordinates(request: Request): Promise<{ lat: number; lon: number } | null> {
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0)
  if (declaredLength > MAX_REQUEST_BODY_BYTES) return null
  if (!request.body) return null

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    const latitude = body.latitude
    const longitude = body.longitude
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null
    }
    return {
      lat: roundWeatherCoordinate(latitude),
      lon: roundWeatherCoordinate(longitude),
    }
  } catch {
    return null
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function weatherCodeFromSymbol(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const symbol = value.toLowerCase().split('_')[0]
  if (symbol.includes('thunder')) return 95
  if (symbol.includes('snow')) return symbol.includes('showers') ? 85 : 71
  if (symbol.includes('sleet')) return 67
  if (symbol.includes('rainshowers')) return 80
  if (symbol.includes('heavyrain')) return 65
  if (symbol.includes('rain')) return symbol.includes('light') ? 51 : 61
  if (symbol.includes('drizzle')) return 51
  if (symbol.includes('fog')) return 45
  if (symbol.includes('cloudy')) return symbol === 'cloudy' ? 3 : 2
  if (symbol === 'fair') return 1
  if (symbol === 'clearsky') return 0
  return null
}

export function normaliseForecast(payload: ForecastResponse): WeatherPayload | null {
  const data = payload.properties?.timeseries?.[0]?.data
  const details = data?.instant?.details
  const nextPeriod = data?.next_1_hours ?? data?.next_6_hours
  const weatherCode = weatherCodeFromSymbol(nextPeriod?.summary?.symbol_code)
  if (!details || weatherCode == null) return null

  const precipitation = finiteNumber(nextPeriod?.details?.precipitation_amount) ?? 0
  const hasSnow = weatherCode === 71 || weatherCode === 85
  const hasRain = [51, 61, 65, 80].includes(weatherCode)
  return {
    current: {
      weather_code: weatherCode,
      wind_speed_10m: finiteNumber(details.wind_speed),
      rain: hasRain ? precipitation : 0,
      showers: weatherCode === 80 ? precipitation : 0,
      snowfall: hasSnow ? precipitation : 0,
    },
  }
}

function expiresAtFromResponse(response: Response, now: number): number {
  const expires = response.headers.get('Expires')
  const parsedExpires = expires ? Date.parse(expires) : Number.NaN
  // Locationforecast has different update intervals by region. Never retry
  // sooner than three hours, and honor a later provider-supplied expiry.
  return Math.max(now + CACHE_TTL_MS, Number.isFinite(parsedExpires) ? parsedExpires : 0)
}

async function fetchWeather(
  lat: number,
  lon: number,
  previous: CachedWeather | null
): Promise<WeatherFetchResult> {
  const unavailable = (): WeatherFetchResult => ({
    weather: null,
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastModified: null,
  })

  try {
    const upstreamUrl = new URL(MET_LOCATIONFORECAST_URL)
    upstreamUrl.searchParams.set('lat', String(lat))
    upstreamUrl.searchParams.set('lon', String(lon))
    const headers = new Headers({
      Accept: 'application/json',
      'User-Agent': APP_USER_AGENT,
    })
    if (previous?.lastModified) headers.set('If-Modified-Since', previous.lastModified)
    const upstream = await fetch(upstreamUrl, {
      headers,
    })
    const now = Date.now()
    if (upstream.status === 304 && previous) {
      return {
        weather: JSON.parse(previous.responseJson) as WeatherPayload | null,
        expiresAt: expiresAtFromResponse(upstream, now),
        lastModified: upstream.headers.get('Last-Modified') ?? previous.lastModified,
      }
    }
    if (!upstream.ok) return unavailable()

    const payload = (await upstream.json()) as ForecastResponse
    return {
      weather: normaliseForecast(payload),
      expiresAt: expiresAtFromResponse(upstream, now),
      lastModified: upstream.headers.get('Last-Modified'),
    }
  } catch {
    return unavailable()
  }
}

export class WeatherCache implements DurableObject {
  private readonly inFlight = new Map<string, Promise<WeatherFetchResult>>()

  constructor(private readonly ctx: DurableObjectState) {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS weather_cache (cache_key TEXT PRIMARY KEY, response_json TEXT NOT NULL, expires_at INTEGER NOT NULL, last_modified TEXT)'
    )
  }

  async fetch(request: Request): Promise<Response> {
    let coordinates: { lat: number; lon: number }
    try {
      coordinates = (await request.json()) as { lat: number; lon: number }
    } catch {
      return jsonResponse({ error: 'Valid latitude and longitude are required.' }, 400)
    }

    const { lat, lon } = coordinates
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return jsonResponse({ error: 'Valid latitude and longitude are required.' }, 400)
    }

    const roundedLat = roundWeatherCoordinate(lat)
    const roundedLon = roundWeatherCoordinate(lon)
    const cacheKey = `${roundedLat.toFixed(1)},${roundedLon.toFixed(1)}`
    const now = Date.now()
    let previous: CachedWeather | null = null
    try {
      previous =
        this.ctx.storage.sql
          .exec<CachedWeather>(
            'SELECT response_json AS responseJson, expires_at AS expiresAt, last_modified AS lastModified FROM weather_cache WHERE cache_key = ?',
            cacheKey
          )
          .toArray()[0] ?? null
      if (previous && previous.expiresAt > now) {
        const weather = JSON.parse(previous.responseJson) as WeatherPayload | null
        if (!weather)
          return jsonResponse({ error: 'Weather data is temporarily unavailable.' }, 502)
        return jsonResponse(weather, 200, {
          'Cache-Control': `public, max-age=${Math.floor((previous.expiresAt - now) / 1000)}`,
          'X-Weather-Source': 'MET Norway',
        })
      }
    } catch {
      return jsonResponse({ error: 'Weather data is temporarily unavailable.' }, 503)
    }

    let pending: Promise<WeatherFetchResult>
    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      pending = existing
    } else {
      const created: Promise<WeatherFetchResult> = (async () => {
        const result = await fetchWeather(roundedLat, roundedLon, previous)
        try {
          this.ctx.storage.sql.exec(
            'INSERT OR REPLACE INTO weather_cache (cache_key, response_json, expires_at, last_modified) VALUES (?, ?, ?, ?)',
            cacheKey,
            JSON.stringify(result.weather),
            result.expiresAt,
            result.lastModified
          )
          // Keep the small weather cache bounded without a scheduled job.
          this.ctx.storage.sql.exec('DELETE FROM weather_cache WHERE expires_at <= ?', Date.now())
        } catch {
          throw new Error('Weather cache storage is unavailable.')
        }
        return result
      })()
      pending = created
      this.inFlight.set(cacheKey, pending)
    }

    try {
      const result = await pending
      if (!result.weather)
        return jsonResponse({ error: 'Weather data is temporarily unavailable.' }, 502)

      return jsonResponse(result.weather, 200, {
        'Cache-Control': `public, max-age=${Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000))}`,
        'X-Weather-Source': 'MET Norway',
      })
    } catch {
      return jsonResponse({ error: 'Weather data is temporarily unavailable.' }, 502)
    } finally {
      if (this.inFlight.get(cacheKey) === pending) this.inFlight.delete(cacheKey)
    }
  }
}

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin, env)

    if (origin && !allowedOrigins(env).has(origin)) {
      return jsonResponse({ error: 'Origin not allowed.' }, 403, cors)
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true }, 200, cors)
    }
    if (url.pathname !== '/v1/current-weather') {
      return jsonResponse({ error: 'Not found.' }, 404, cors)
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'POST') {
      const methodHeaders = new Headers(cors)
      methodHeaders.set('Allow', 'OPTIONS, POST')
      return jsonResponse({ error: 'Method not allowed.' }, 405, methodHeaders)
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, cors)
    }

    const coordinates = await readCoordinates(request)
    if (!coordinates) {
      return jsonResponse({ error: 'Valid latitude and longitude are required.' }, 400, cors)
    }

    try {
      const weatherCacheId = env.WEATHER_CACHE.idFromName('the-big-eye-global-weather-cache')
      const weatherCache = env.WEATHER_CACHE.get(weatherCacheId)
      const response = await weatherCache.fetch('https://weather-cache.internal/v1/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coordinates),
      })
      const headers = new Headers(response.headers)
      cors.forEach((value, name) => headers.set(name, value))
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return jsonResponse({ error: 'Weather data is temporarily unavailable.' }, 502, cors)
    }
  },
} satisfies ExportedHandler<Env>
