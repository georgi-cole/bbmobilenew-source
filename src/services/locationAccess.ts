import { Capacitor } from '@capacitor/core'
import type { PermissionState } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

const LOCATION_CHOICE_KEY = 'bb:allowLocation'
const LOCATION_REQUESTED_KEY = 'bb:locationPermissionRequested'
// Keep provider denials separate from the legacy, explicit in-app opt-out.
const LOCATION_PROVIDER_DENIED_KEY = 'bb:locationPermissionDenied'
const LOCATION_FAILED_ATTEMPT_KEY = 'bb:locationPermissionFailedAt'
const PERMISSION_RETRY_COOLDOWN_MS = 60 * 60 * 1000

export interface WeatherCoordinates {
  latitude: number
  longitude: number
}

export interface WeatherLocationResult {
  coordinates: WeatherCoordinates | null
  permissionStatus: PermissionState | 'unsupported' | 'unknown'
  error: string | null
}

let pendingLocationRequest: {
  promise: Promise<WeatherLocationResult>
  requestsPermission: boolean
} | null = null
let permissionPromptAttemptedThisSession = false

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

function clearPreference(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Cached permission hints are optional; the provider remains authoritative.
  }
}

function recordProviderDenial(): void {
  writePreference(LOCATION_PROVIDER_DENIED_KEY, 'true')
  writePreference(LOCATION_REQUESTED_KEY, 'true')
}

function recordFailedPermissionAttempt(): void {
  permissionPromptAttemptedThisSession = true
  writePreference(LOCATION_FAILED_ATTEMPT_KEY, String(Date.now()))
}

function canAttemptPermission(): boolean {
  if (permissionPromptAttemptedThisSession) return false
  const failedAt = Number(readPreference(LOCATION_FAILED_ATTEMPT_KEY))
  return (
    !Number.isFinite(failedAt) ||
    failedAt <= 0 ||
    Date.now() - failedAt >= PERMISSION_RETRY_COOLDOWN_MS
  )
}

function describeError(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}

function nativePermissionStatus(permissions: {
  location: PermissionState
  coarseLocation?: PermissionState
}): PermissionState {
  if (permissions.location === 'granted' || permissions.coarseLocation === 'granted') {
    return 'granted'
  }
  return permissions.coarseLocation ?? permissions.location
}

async function checkPermission(): Promise<WeatherLocationResult['permissionStatus']> {
  if (Capacitor.isNativePlatform()) {
    return nativePermissionStatus(await Geolocation.checkPermissions())
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
  const isNative = Capacitor.isNativePlatform()
  let permissionStatus: WeatherLocationResult['permissionStatus']
  try {
    permissionStatus = await checkPermission()
  } catch (error) {
    return {
      coordinates: null,
      permissionStatus: 'unknown',
      error: describeError(error),
    }
  }

  if (permissionStatus === 'denied') {
    recordProviderDenial()
    return { coordinates: null, permissionStatus, error: 'permission denied' }
  }

  const permissionUnknown = permissionStatus === 'unknown' || permissionStatus === 'unsupported'
  // A live grant must win over old cached denials, including those written by
  // the previous permission service. The old attempted flag is not a denial.
  if (permissionStatus === 'granted') {
    permissionPromptAttemptedThisSession = false
    writePreference(LOCATION_CHOICE_KEY, 'granted')
    writePreference(LOCATION_PROVIDER_DENIED_KEY, 'false')
    clearPreference(LOCATION_FAILED_ATTEMPT_KEY)
  }

  // Browsers without a Permissions API can continue using a successful grant.
  const canUseSavedGrant =
    permissionUnknown &&
    savedChoice === 'granted' &&
    readPreference(LOCATION_PROVIDER_DENIED_KEY) !== 'true'

  if (permissionStatus !== 'granted' && !canUseSavedGrant) {
    if (savedChoice === 'denied') {
      return { coordinates: null, permissionStatus, error: 'permission denied by player' }
    }
    const requestedBefore = readPreference(LOCATION_REQUESTED_KEY) === 'true'
    const canRecoverAutomatically = savedChoice === 'granted' || requestedBefore
    if ((!requestPermission && !canRecoverAutomatically) || !canAttemptPermission()) {
      return { coordinates: null, permissionStatus, error: null }
    }

    // Renew an expired one-time grant, or recover an old interrupted attempt.
    // Ask once while permission remains ungranted, rather than on every refresh.
    permissionPromptAttemptedThisSession = true
    writePreference(LOCATION_REQUESTED_KEY, 'true')
    if (isNative) {
      try {
        permissionStatus = nativePermissionStatus(
          await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
        )
      } catch (error) {
        recordFailedPermissionAttempt()
        return { coordinates: null, permissionStatus: 'unknown', error: describeError(error) }
      }
      if (permissionStatus !== 'granted') {
        if (permissionStatus === 'denied') recordProviderDenial()
        recordFailedPermissionAttempt()
        return { coordinates: null, permissionStatus, error: 'location permission not granted' }
      }
    }
  }

  try {
    // On the web, one call both obtains coordinates and handles any needed prompt.
    const coordinates = isNative
      ? await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: timeoutMs,
          maximumAge: 10 * 60 * 1000,
        }).then(({ coords }) => ({ latitude: coords.latitude, longitude: coords.longitude }))
      : await getBrowserPosition(timeoutMs)
    permissionPromptAttemptedThisSession = false
    writePreference(LOCATION_CHOICE_KEY, 'granted')
    writePreference(LOCATION_PROVIDER_DENIED_KEY, 'false')
    clearPreference(LOCATION_FAILED_ATTEMPT_KEY)
    return { coordinates, permissionStatus: 'granted', error: null }
  } catch (error) {
    const denied =
      (error as GeolocationPositionError)?.code === 1 ||
      (error as { code?: string })?.code === 'OS-PLUG-GLOC-0003'
    if (denied) recordProviderDenial()
    if (permissionStatus !== 'granted') recordFailedPermissionAttempt()
    return {
      coordinates: null,
      permissionStatus: denied ? 'denied' : permissionStatus,
      error: describeError(error),
    }
  }
}

/** Shares concurrent lookups without dropping the initial post-rationale request. */
export function getWeatherLocation(
  timeoutMs: number,
  requestPermission = false
): Promise<WeatherLocationResult> {
  if (pendingLocationRequest) {
    const pending = pendingLocationRequest
    if (!requestPermission || pending.requestsPermission) return pending.promise
    return pending.promise.then((result) =>
      result.coordinates ? result : getWeatherLocation(timeoutMs, true)
    )
  }
  const promise = resolveWeatherLocation(timeoutMs, requestPermission).finally(() => {
    if (pendingLocationRequest?.promise === promise) pendingLocationRequest = null
  })
  pendingLocationRequest = { promise, requestsPermission: requestPermission }
  return promise
}
