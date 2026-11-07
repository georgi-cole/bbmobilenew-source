import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { hasNativeGameDisplay, syncNativeGameDisplay } from '../platform/nativeGameDisplay'

interface WakeLockSentinelLike {
  released?: boolean
  release?: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
  removeEventListener?: (type: 'release', listener: () => void) => void
}

interface WakeLockControllerLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

interface LockableOrientationLike {
  lock?: (orientation: 'portrait') => Promise<void>
  unlock?: () => void
}

/**
 * Native gameplay hides both system bars, stays awake, and uses portrait unless
 * the current minigame supports landscape. Menus restore normal phone controls.
 * Browsers and older installed shells retain best-effort wake/orientation APIs;
 * the measured CSS safe area remains the fallback on every platform.
 */
export default function useGameMode(activePlay = false, allowLandscape = false): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined
    return () => {
      void syncNativeGameDisplay({ active: false, allowLandscape: false })
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    function syncDisplay() {
      void syncNativeGameDisplay({
        active: activePlay,
        allowLandscape: activePlay && allowLandscape,
      })
    }

    function handleStatusBarVisibilityChange() {
      if (document.visibilityState === 'visible') {
        syncDisplay()
      }
    }

    function handleNativeResume() {
      syncDisplay()
    }

    syncDisplay()
    document.addEventListener('visibilitychange', handleStatusBarVisibilityChange)
    window.addEventListener('focus', handleNativeResume)
    window.addEventListener('pageshow', handleNativeResume)

    return () => {
      document.removeEventListener('visibilitychange', handleStatusBarVisibilityChange)
      window.removeEventListener('focus', handleNativeResume)
      window.removeEventListener('pageshow', handleNativeResume)
    }
  }, [activePlay, allowLandscape])

  useEffect(() => {
    if (hasNativeGameDisplay()) return undefined

    let isMounted = true
    let wakeLockSentinel: WakeLockSentinelLike | null = null
    let wakeLockRequestInFlight: Promise<void> | null = null
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockControllerLike }).wakeLock
    const orientation = screen.orientation as LockableOrientationLike | undefined

    function isWakeLockRequestAllowedByVisibility() {
      return document.visibilityState === 'visible'
    }

    const handleWakeLockRelease = () => {
      wakeLockSentinel = null
      if (isMounted && isWakeLockRequestAllowedByVisibility()) {
        void requestWakeLock()
      }
    }

    async function releaseWakeLock() {
      const activeSentinel = wakeLockSentinel
      wakeLockSentinel = null

      activeSentinel?.removeEventListener?.('release', handleWakeLockRelease)

      try {
        await activeSentinel?.release?.()
      } catch {
        // Unsupported/rejected wake-lock releases are safe to ignore.
      }
    }

    async function requestWakeLock() {
      if (
        !activePlay ||
        !isMounted ||
        !isWakeLockRequestAllowedByVisibility() ||
        wakeLockSentinel != null ||
        wakeLockRequestInFlight != null
      ) {
        return
      }

      const pendingRequest = (async () => {
        try {
          const sentinel = await wakeLock?.request('screen')
          if (!sentinel) return

          if (!isMounted || !isWakeLockRequestAllowedByVisibility()) {
            await sentinel.release?.()
            return
          }

          wakeLockSentinel = sentinel
          sentinel.addEventListener?.('release', handleWakeLockRelease)
        } catch {
          // Browsers may reject wake lock requests unless the page is active.
        } finally {
          wakeLockRequestInFlight = null
        }
      })()

      wakeLockRequestInFlight = pendingRequest
      await pendingRequest
    }

    async function lockOrientation() {
      try {
        await orientation?.lock?.('portrait')
      } catch {
        // Orientation lock is best-effort and unsupported on many browsers.
      }
    }

    function unlockOrientation() {
      try {
        orientation?.unlock?.()
      } catch {
        // Some browsers expose lock but not unlock; ignore cleanup failures.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
        if (!allowLandscape) void lockOrientation()
      } else {
        void releaseWakeLock()
      }
    }

    void requestWakeLock()
    if (!allowLandscape) void lockOrientation()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      unlockOrientation()
      void releaseWakeLock()
    }
  }, [activePlay, allowLandscape])
}
