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

function setBrowserPermission(state: PermissionState): void {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state }) },
  })
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

  it('does not open a second browser permission prompt after the first attempt', async () => {
    setBrowserPermission('prompt')
    const getCurrentPosition = setBrowserGeolocation()
    localStorage.setItem('bb:locationPermissionRequested', 'true')

    const result = await getWeatherLocation(100, true)

    expect(result.coordinates).toBeNull()
    expect(getCurrentPosition).not.toHaveBeenCalled()
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

  it('remembers a decline and never requests permission again automatically', async () => {
    locationMocks.isNative = true
    locationMocks.checkPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'prompt',
    })
    locationMocks.requestPermissions.mockResolvedValue({
      location: 'prompt',
      coarseLocation: 'denied',
    })

    const firstResult = await getWeatherLocation(100, true)
    const nextResult = await getWeatherLocation(100, true)

    expect(firstResult.permissionStatus).toBe('denied')
    expect(nextResult.permissionStatus).toBe('denied')
    expect(locationMocks.requestPermissions).toHaveBeenCalledOnce()
    expect(shouldShowWeatherPermissionRationale()).toBe(false)
  })
})
