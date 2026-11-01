import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { getWeatherLocation, shouldShowWeatherPermissionRationale } from './locationAccess'

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
  beforeEach(() => {
    localStorage.clear()
    locationMocks.isNative = false
    locationMocks.checkPermissions.mockReset()
    locationMocks.requestPermissions.mockReset()
    locationMocks.getCurrentPosition.mockReset()
  })

  it('uses the browser position request as the single permission prompt', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()

    expect(shouldShowWeatherPermissionRationale()).toBe(true)
    const result = await getWeatherLocation(100, true)

    expect(result.coordinates).toEqual(coordinates)
    expect(result.permissionStatus).toBe('granted')
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('bb:locationPermissionRequested')).toBe('true')
    expect(localStorage.getItem('bb:allowLocation')).toBe('granted')
    expect(shouldShowWeatherPermissionRationale()).toBe(false)
  })

  it('keeps ordinary background refreshes from prompting before the player chooses', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()

    const result = await getWeatherLocation(100)

    expect(result.coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(shouldShowWeatherPermissionRationale()).toBe(true)
  })

  it('allows an explicit retry after an earlier attempt while passive refreshes stay prompt-free', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    const passiveResult = await getWeatherLocation(100)

    expect(passiveResult.coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()

    const retryResult = await getWeatherLocation(100, true)

    expect(retryResult.coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('lets the player renew an expired one-time permission without prompting automatically', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'granted')
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    expect(shouldShowWeatherPermissionRationale()).toBe(false)
    expect((await getWeatherLocation(100)).coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()

    expect((await getWeatherLocation(100, true)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('preserves a remembered app opt-out until the player explicitly re-enables local weather', async () => {
    setBrowserPermission('granted')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'denied')

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect(getCurrentPosition).not.toHaveBeenCalled()

    expect((await getWeatherLocation(100, true)).coordinates).toEqual(coordinates)
    expect(localStorage.getItem('bb:allowLocation')).toBe('granted')
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('recovers when browser settings change after a provider denial', async () => {
    setBrowserPermission('denied')
    const getCurrentPosition = setBrowserGeolocation()

    expect((await getWeatherLocation(100)).permissionStatus).toBe('denied')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(localStorage.getItem('bb:allowLocation')).toBeNull()
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('true')
    expect(shouldShowWeatherPermissionRationale()).toBe(false)

    setBrowserPermission('granted')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('false')
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('does not try to bypass a browser denial during an explicit retry', async () => {
    setBrowserPermission('denied')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:allowLocation', 'denied')

    expect((await getWeatherLocation(100, true)).permissionStatus).toBe('denied')
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(localStorage.getItem('bb:allowLocation')).toBeNull()

    setBrowserPermission('granted')

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
  })

  it('allows retry after a transient position timeout without storing a permanent denial', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    getCurrentPosition.mockImplementationOnce(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 3, message: 'Position timed out' } as GeolocationPositionError)
      }
    )

    const firstResult = await getWeatherLocation(100, true)

    expect(firstResult.coordinates).toBeNull()
    expect(firstResult.error).toBe('Position timed out')
    expect(localStorage.getItem('bb:allowLocation')).toBeNull()
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBeNull()
    expect((await getWeatherLocation(100, true)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('stops silent retries after a denial in a browser without a Permissions API', async () => {
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

    expect((await getWeatherLocation(100, true)).coordinates).toEqual(coordinates)
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('false')
  })

  it('preserves and deduplicates explicit requests queued behind a passive permission check', async () => {
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
    const firstRetry = getWeatherLocation(100, true)
    const secondRetry = getWeatherLocation(100, true)
    resolvePermission({ state: 'prompt' })

    const [passiveResult, firstResult, secondResult] = await Promise.all([
      passive,
      firstRetry,
      secondRetry,
    ])

    expect(passiveResult.coordinates).toBeNull()
    expect(firstResult.coordinates).toEqual(coordinates)
    expect(secondResult.coordinates).toEqual(coordinates)
    expect(query).toHaveBeenCalledTimes(2)
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('requests only approximate native location and uses the Capacitor provider', async () => {
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

    const result = await getWeatherLocation(100, true)

    expect(result.coordinates).toEqual(coordinates)
    expect(locationMocks.requestPermissions).toHaveBeenCalledWith({
      permissions: ['coarseLocation'],
    })
    expect(locationMocks.getCurrentPosition).toHaveBeenCalledOnce()
    expect(browserPosition).not.toHaveBeenCalled()
  })

  it('accepts an existing precise native grant without another permission prompt', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions.mockResolvedValue({
      location: 'granted',
      coarseLocation: 'prompt',
    })
    locationMocks.getCurrentPosition.mockResolvedValue({ coords: coordinates })

    expect((await getWeatherLocation(100)).coordinates).toEqual(coordinates)
    expect(locationMocks.requestPermissions).not.toHaveBeenCalled()
  })

  it('records a native decline and never requests permission again automatically', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions
      .mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'prompt' })
      .mockResolvedValue({ location: 'denied', coarseLocation: 'denied' })
    locationMocks.requestPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'denied',
    })

    const firstResult = await getWeatherLocation(100, true)
    const nextResult = await getWeatherLocation(100)

    expect(firstResult.permissionStatus).toBe('denied')
    expect(nextResult.permissionStatus).toBe('denied')
    expect(locationMocks.requestPermissions).toHaveBeenCalledOnce()
    expect(localStorage.getItem('bb:allowLocation')).toBeNull()
    expect(localStorage.getItem('bb:locationPermissionDenied')).toBe('true')
    expect(shouldShowWeatherPermissionRationale()).toBe(false)
  })

  it('lets the native provider handle a deliberate retry after a denial', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions.mockResolvedValue({
      location: 'denied',
      coarseLocation: 'denied',
    })
    locationMocks.requestPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'granted',
    })
    locationMocks.getCurrentPosition.mockResolvedValue({ coords: coordinates })
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    expect((await getWeatherLocation(100, true)).coordinates).toEqual(coordinates)
    expect(locationMocks.requestPermissions).toHaveBeenCalledOnce()
  })
})
