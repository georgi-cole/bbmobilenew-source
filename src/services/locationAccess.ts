import { Capacitor } from '@capacitor/core'
import type { PermissionState } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

const LOCATION_CHOICE_KEY = 'bb:allowLocation'
const LOCATION_REQUESTED_KEY = 'bb:locationPermissionRequested'

export interface WeatherCoordinates {
  latitude: number
  longitude: number
}

export interface WeatherLocationResult {
  coordinates: WeatherCoordinates | null
  permissionStatus: PermissionState | 'unsupported' | 'unknown'
  error: string | null
}

let pendingLocationRequest: Promise<WeatherLocationResult> | null = null

/** Whether the first-launch location rationale should be shown before asking the OS. */
export function shouldShowWeatherPermissionRationale(): boolean {
  return (
    readPreference(LOCATION_CHOICE_KEY) == null && readPreference(LOCATION_REQUESTED_KEY) !== 'true'
  )
}

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Permission state can still be used for this session if storage is unavailable.
  }
}

async function checkPermission(): Promise<WeatherLocationResult['permissionStatus']> {
  if (Capacitor.isNativePlatform()) {
    const permissions = await Geolocation.checkPermissions()
    return permissions.coarseLocation ?? permissions.location
  }

  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

function getBrowserPosition(timeoutMs: number): Promise<WeatherCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      reject,
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
    )
  })
}

async function resolveWeatherLocation(
  timeoutMs: number,
  requestPermission: boolean
): Promise<WeatherLocationResult> {
  const savedChoice = readPreference(LOCATION_CHOICE_KEY)
  if (savedChoice === 'denied') {
    return { coordinates: null, permissionStatus: 'denied', error: 'permission denied by player' }
  }

  let permissionStatus: WeatherLocationResult['permissionStatus']
  try {
    permissionStatus = await checkPermission()
  } catch (error) {
    return {
      coordinates: null,
      permissionStatus: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    }
  }

  if (permissionStatus === 'denied') {
    writePreference(LOCATION_CHOICE_KEY, 'denied')
    return { coordinates: null, permissionStatus, error: 'permission denied' }
  }

  const needsPrompt = permissionStatus === 'prompt' || permissionStatus === 'prompt-with-rationale'
  const permissionUnknown = permissionStatus === 'unknown' || permissionStatus === 'unsupported'
  const requestedBefore = readPreference(LOCATION_REQUESTED_KEY) === 'true'

  if (needsPrompt || permissionUnknown) {
    if (!requestPermission || requestedBefore) {
      // A previously granted app choice can cover browsers without a permissions API.
      if (!(permissionUnknown && savedChoice === 'granted')) {
        return { coordinates: null, permissionStatus, error: null }
      }
    } else {
      writePreference(LOCATION_REQUESTED_KEY, 'true')
      if (Capacitor.isNativePlatform()) {
        try {
          const requested = await Geolocation.requestPermissions({
            permissions: ['coarseLocation'],
          })
          permissionStatus = requested.coarseLocation ?? requested.location
        } catch (error) {
          return {
            coordinates: null,
            permissionStatus: 'unknown',
            error: error instanceof Error ? error.message : String(error),
          }
        }
        if (permissionStatus !== 'granted') {
          writePreference(LOCATION_CHOICE_KEY, 'denied')
          return { coordinates: null, permissionStatus, error: 'permission denied' }
        }
      } else {
        // This one position request both opens the browser prompt and returns coordinates.
        try {
          const coordinates = await getBrowserPosition(timeoutMs)
          writePreference(LOCATION_CHOICE_KEY, 'granted')
          return { coordinates, permissionStatus: 'granted', error: null }
        } catch (error) {
          const denied = (error as GeolocationPositionError)?.code === 1
          if (denied) writePreference(LOCATION_CHOICE_KEY, 'denied')
          return {
            coordinates: null,
            permissionStatus: denied ? 'denied' : permissionStatus,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }
    }
  }

  if (permissionStatus !== 'granted' && !(permissionUnknown && savedChoice === 'granted')) {
    return { coordinates: null, permissionStatus, error: null }
  }

  try {
    const coordinates = Capacitor.isNativePlatform()
      ? await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: 10 * 60 * 1000,
        }).then(({ coords }) => ({ latitude: coords.latitude, longitude: coords.longitude }))
      : await getBrowserPosition(timeoutMs)
    writePreference(LOCATION_CHOICE_KEY, 'granted')
    return { coordinates, permissionStatus: 'granted', error: null }
  } catch (error) {
    const denied =
      (error as GeolocationPositionError)?.code === 1 ||
      (error as { code?: string })?.code === 'OS-PLUG-GLOC-0003'
    if (denied) writePreference(LOCATION_CHOICE_KEY, 'denied')
    return {
      coordinates: null,
      permissionStatus: denied ? 'denied' : permissionStatus,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Requests location at most once during onboarding and shares concurrent callers. */
export function getWeatherLocation(
  timeoutMs: number,
  requestPermission = false
): Promise<WeatherLocationResult> {
  if (pendingLocationRequest) return pendingLocationRequest
  pendingLocationRequest = resolveWeatherLocation(timeoutMs, requestPermission).finally(() => {
    pendingLocationRequest = null
  })
  return pendingLocationRequest
}
