import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const locationMocks = vi.hoisted(() => ({
  isNative: false,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => locationMocks.isNative },
}))

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: locationMocks.checkPermissions,
    requestPermissions: locationMocks.requestPermissions,
    getCurrentPosition: locationMocks.getCurrentPosition,
  },
}))

let getWeatherLocation: typeof import('./locationAccess').getWeatherLocation
let shouldShowWeatherPermissionRationale: typeof import('./locationAccess').shouldShowWeatherPermissionRationale

async function loadLocationService(): Promise<void> {
  const service = await import('./locationAccess')
  getWeatherLocation = service.getWeatherLocation
  shouldShowWeatherPermissionRationale = service.shouldShowWeatherPermissionRationale
}

const coordinates = { latitude: 42.6977, longitude: 23.3219 }

function setBrowserPermission(state: PermissionState): ReturnType<typeof vi.fn> {
  const query = vi.fn().mockResolvedValue({ state })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query },
  })
  return query
}

function setBrowserGeolocation(): ReturnType<typeof vi.fn> {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({ coords: coordinates } as GeolocationPosition)
  })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
  return getCurrentPosition
}

describe('weather location access', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    locationMocks.isNative = false
    locationMocks.checkPermissions.mockReset()
    locationMocks.requestPermissions.mockReset()
    locationMocks.getCurrentPosition.mockReset()
    await loadLocationService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses one browser position request after the existing first-launch rationale', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()

    expect(shouldShowWeatherPermissionRationale()).toBe(true)
    const result = await getWeatherLocation(100, true)

    expect(result.coordinates).toEqual(coordinates)
    expect(result.permissionStatus).toBe('granted')
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(localStorage.getItem('bb:locationPermissionRequested')).toBe('true')
    expect(localStorage.getItem('bb:allowLocation')).toBe('granted')
    expect(shouldShowWeatherPermissionRationale()).toBe(false)
  })

  it('waits for the first-launch rationale before asking a new player', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()

    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(shouldShowWeatherPermissionRationale()).toBe(true)
  })

  it('automatically recovers an old interrupted attempt instead of treating it as a lifetime block', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('automatically renews an expired one-time grant and keeps granted refreshes working', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    expect(shouldShowWeatherPermissionRationale()).toBe(false)
    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)

    setBrowserPermission('granted')
    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)

    // A newly confirmed grant may later expire again without reloading the app.
    setBrowserPermission('prompt')
    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(3)
  })

  it('renews a later one-time expiry when coordinates were the only confirmation of the prior grant', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)

    // The next refresh encounters a new expiry without observing granted in between.
    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('does not reopen a dismissed prompt on every foreground event in the same app session', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')
    getCurrentPosition.mockImplementationOnce(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'Location prompt dismissed' } as GeolocationPositionError)
      }
    )

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect((await getWeatherLocation(100, true)).coordinates).toBeNull()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    'uses a live browser grant despite a stale denial (attempt flag: %s)',
    async (requested) => {
      setBrowserPermission('granted')
      const getCurrentPosition = setBrowserGeolocation()
      localStorage.setItem('bb:allowLocation', 'denied')
      if (requested) localStorage.setItem('bb:locationPermissionRequested', 'true')

      expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
      expect(localStorage.getItem('bb:allowLocation')).toBe('granted')
      expect(getCurrentPosition).toHaveBeenCalledOnce()
    }
  )

  it('does not turn an old remembered decline into a new prompt without a live grant', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'denied')

    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('respects a current browser denial and automatically recovers after permission changes', async () => {
    setBrowserPermission('denied')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect((await getWeatherLocation(100, true)).permissionStatus).toBe('denied')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('true')

    setBrowserPermission('granted')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('false')
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('bounds unsuccessful retries across reloads without permanently disabling location', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const startedAt = Date.now()
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:locationPermissionRequested', 'true')
    getCurrentPosition.mockImplementationOnce(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 3, message: 'Position timed out' } as GeolocationPositionError)
      }
    )

    const firstResult = await getWeatherLocation(100)

    expect(firstResult.coordinates).toBeNull()
    expect(firstResult.error).toBe('Position timed out')
    expect(localStorage.getItem('bb:allowLocation')).toBeNull()
    expect((await getWeatherLocation(100)).coordinates).toBeNull()

    vi.resetModules()
    await loadLocationService()
    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect(getCurrentPosition).toHaveBeenCalledOnce()

    vi.setSystemTime(startedAt + 61 * 60 * 1000)

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('bb:locationPermissionFailedAt')).toBeNull()
  })

  it('does not let a retry cooldown suppress an actual permission grant', async () => {
    setBrowserPermission('granted')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:locationPermissionFailedAt', String(Date.now()))
    localStorage.setItem('bb:locationPermissionDenied', 'true')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(localStorage.getItem('bb:locationPermissionFailedAt')).toBeNull()
  })

  it('continues using a successful grant when the Permissions API is unavailable', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('stops repeated prompt attempts after a denial without a Permissions API', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')
    getCurrentPosition.mockImplementationOnce(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'Location denied' } as GeolocationPositionError)
      }
    )

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('deduplicates initial rationale requests queued behind a passive permission check', async () => {
    const query = setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    let resolvePermission: (value: { state: PermissionState }) => void = () => undefined
    query.mockImplementationOnce(
      () =>
        new Promise<{ state: PermissionState }>((resolve) => {
          resolvePermission = resolve
        })
    )

    const passive = getWeatherLocation(100)
    const firstRequest = getWeatherLocation(100, true)
    const secondRequest = getWeatherLocation(100, true)
    resolvePermission({ state: 'prompt' })

    const [passiveResult, firstResult, secondResult] = await Promise.all([
      passive,
      firstRequest,
      secondRequest,
    ])

    expect(passiveResult.coordinates).toBeNull()
    expect(firstResult.coordinates).toEqual(coordinates)
    expect(secondResult.coordinates).toEqual(coordinates)
    expect(query).toHaveBeenCalledTimes(2)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    'requests approximate native location for initial/recovery access (prior grant: %s)',
    async (priorGrant) => {
      locationMocks.isNative = true
      locationMocks.checkPermissions.mockResolvedValue({
        location: 'prompt',
        coarseLocation: 'prompt',
      })
      locationMocks.requestPermissions.mockResolvedValue({
        location: 'prompt',
        coarseLocation: 'granted',
      })
      locationMocks.getCurrentPosition.mockResolvedValue({ coords: coordinates })
      const browserPosition = setBrowserGeolocation()
      if (priorGrant) localStorage.setItem('bb:allowLocation', 'granted')

      expect((await getWeatherLocation(100, !priorGrant)).coordinates).toEqual(coordinates)
      expect(locationMocks.requestPermissions).toHaveBeenCalledWith({
        permissions: ['coarseLocation'],
      })
      expect(locationMocks.getCurrentPosition).toHaveBeenCalledOnce()
      expect(browserPosition).not.toHaveBeenCalled()
    }
  )

  it('accepts an existing precise native grant without another prompt or stale cache block', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions.mockResolvedValue({
      location: 'granted',
      coarseLocation: 'prompt',
    })
    locationMocks.getCurrentPosition.mockResolvedValue({ coords: coordinates })
    localStorage.setItem('bb:allowLocation', 'denied')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(locationMocks.requestPermissions).not.toHaveBeenCalled()
  })

  it('never requests native permission while the OS currently reports denied', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'denied',
    })
    localStorage.setItem('bb:allowLocation', 'granted')

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect((await getWeatherLocation(100, true)).permissionStatus).toBe('denied')
    expect(locationMocks.requestPermissions).not.toHaveBeenCalled()
    expect(locationMocks.getCurrentPosition).not.toHaveBeenCalled()
  })
})
