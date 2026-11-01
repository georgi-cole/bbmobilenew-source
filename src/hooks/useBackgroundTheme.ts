/**
 * useBackgroundTheme.ts
 *
 * Resolves the dynamic Home Hub background and refreshes it when the app
 * returns to the foreground, weather changes, or local time crosses a theme boundary.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getNextThemeBoundaryDelay, resolveTheme, timeOfDayKey } from '../utils/backgroundTheme'
import type { ResolvedTheme, ThemeKey } from '../utils/backgroundTheme'
import { resolveSkinAsset } from '../utils/skinAssets'

interface BackgroundState {
  url: string | null
  key: ThemeKey | null
  reason: string | null
  permissionStatus: ResolvedTheme['permissionStatus']
}

const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000
type RefreshResult = ResolvedTheme | undefined

interface UseBackgroundThemeOptions {
  attachToRoot?: boolean
}

function resolveInitialBackground(): BackgroundState {
  const fallbackKey = timeOfDayKey(new Date())
  const fallbackAsset = resolveSkinAsset(fallbackKey)

  return {
    url: fallbackAsset.url,
    key: fallbackAsset.key,
    reason: 'fallback:initial-render',
    permissionStatus: 'unknown',
  }
}

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {}
): BackgroundState & { requestWeatherLocation: () => Promise<RefreshResult> } {
  const [state, setState] = useState<BackgroundState>(() => resolveInitialBackground())
  const requestLocationRef = useRef<() => Promise<RefreshResult>>(() => Promise.resolve(undefined))
  const requestWeatherLocation = useCallback(() => requestLocationRef.current(), [])
  const { attachToRoot } = opts

  useEffect(() => {
    let cancelled = false
    let activeRefresh: Promise<RefreshResult> | null = null
    let locationPermissionRefresh: Promise<RefreshResult> | null = null
    let lastForegroundRefreshAt = 0
    let boundaryTimer: number | undefined

    const applyTheme = (resolved: ResolvedTheme): RefreshResult => {
      if (cancelled) return
      setState({
        url: resolved.url,
        key: resolved.key,
        reason: resolved.reason,
        permissionStatus: resolved.permissionStatus,
      })
      if (attachToRoot) {
        document.documentElement.style.setProperty('--intro-bg-image', `url("${resolved.url}")`)
      }
      return resolved
    }

    const refresh = (
      foreground = false,
      requestLocationPermission = false
    ): Promise<RefreshResult> => {
      if (cancelled) return Promise.resolve(undefined)
      if (requestLocationPermission && locationPermissionRefresh) {
        return locationPermissionRefresh
      }
      const now = Date.now()
      if (foreground && now - lastForegroundRefreshAt < 1000) return Promise.resolve(undefined)
      if (foreground) lastForegroundRefreshAt = now

      if (activeRefresh) {
        if (!requestLocationPermission) return activeRefresh

        const queued = activeRefresh.then(() => {
          if (locationPermissionRefresh === queuedRefresh) locationPermissionRefresh = null
          return refresh(false, true)
        })
        const queuedRefresh = queued.finally(() => {
          if (locationPermissionRefresh === queuedRefresh) locationPermissionRefresh = null
        })
        locationPermissionRefresh = queuedRefresh
        return queuedRefresh
      }

      const run = async () => {
        try {
          return applyTheme(await resolveTheme({ requestLocationPermission }))
        } catch (error) {
          if (cancelled) return
          const fallbackKey = timeOfDayKey(new Date())
          const fallbackAsset = resolveSkinAsset(fallbackKey)
          const fallbackReason = `resolveTheme:error:${error instanceof Error ? error.message : String(error)}`
          console.warn('[useBackgroundTheme] resolver failed; using emergency fallback', {
            error,
            fallbackKey,
            fallbackAsset,
          })
          return applyTheme({
            key: fallbackAsset.key,
            url: fallbackAsset.url,
            reason: fallbackReason,
            assetFile: fallbackAsset.file,
            assetSource: fallbackAsset.source,
            platform: 'web',
            permissionStatus: 'unknown',
          })
        }
      }

      const running = run().finally(() => {
        if (activeRefresh === running) activeRefresh = null
        if (locationPermissionRefresh === running) locationPermissionRefresh = null
      })
      activeRefresh = running
      if (requestLocationPermission) locationPermissionRefresh = running
      return running
    }

    requestLocationRef.current = () => refresh(false, true)

    const scheduleBoundaryRefresh = () => {
      if (boundaryTimer != null) window.clearTimeout(boundaryTimer)
      boundaryTimer = window.setTimeout(
        () => {
          void refresh()
          scheduleBoundaryRefresh()
        },
        getNextThemeBoundaryDelay(new Date()) + 50
      )
    }

    const refreshOnForeground = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }

    const refreshOnReconnect = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    void refresh()
    scheduleBoundaryRefresh()
    const weatherTimer = window.setInterval(refreshOnForeground, WEATHER_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshOnForeground)
    window.addEventListener('focus', refreshOnForeground)
    window.addEventListener('pageshow', refreshOnForeground)
    window.addEventListener('online', refreshOnReconnect)

    return () => {
      cancelled = true
      requestLocationRef.current = () => Promise.resolve(undefined)
      if (boundaryTimer != null) window.clearTimeout(boundaryTimer)
      window.clearInterval(weatherTimer)
      document.removeEventListener('visibilitychange', refreshOnForeground)
      window.removeEventListener('focus', refreshOnForeground)
      window.removeEventListener('pageshow', refreshOnForeground)
      window.removeEventListener('online', refreshOnReconnect)
      if (attachToRoot) {
        document.documentElement.style.removeProperty('--intro-bg-image')
      }
    }
  }, [attachToRoot])

  return { ...state, requestWeatherLocation }
}
