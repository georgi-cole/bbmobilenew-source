import { useEffect, useMemo, useReducer, useState } from 'react'
import useLoadIntroHub from './useLoadIntroHub'
import { preloadImage } from '../utils/preload'
import {
  getHomeHubCriticalAssetUrls,
  getHomeHubDeferredAssetUrls,
} from '../screens/HomeHub/homeHubAssets'

interface HomeHubAssetsState {
  ready: boolean
  progress: number
  status: string
}

interface ImagesState {
  loaded: number
  ready: boolean
}

type ImagesAction =
  | { type: 'reset'; total: number }
  | { type: 'imageLoaded' }
  | { type: 'allReady' }

function imagesReducer(state: ImagesState, action: ImagesAction): ImagesState {
  switch (action.type) {
    case 'reset':
      return {
        loaded: 0,
        ready: action.total === 0,
      }
    case 'imageLoaded':
      return {
        loaded: state.loaded + 1,
        ready: state.ready,
      }
    case 'allReady':
      return {
        loaded: state.loaded,
        ready: true,
      }
    default:
      return state
  }
}

function hasIntroHubChips(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  return document.querySelector('#intro-hub .hub-chip') != null
}

function hasFontFaceSet(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document && !!document.fonts
}

export default function useHomeHubAssets(
  effectiveBgUrl: string | null,
  allowDeferredAssets: boolean
): HomeHubAssetsState {
  useLoadIntroHub()

  const criticalAssetUrls = useMemo(
    () => getHomeHubCriticalAssetUrls(effectiveBgUrl),
    [effectiveBgUrl]
  )
  const deferredAssetUrls = useMemo(() => getHomeHubDeferredAssetUrls(), [])
  const [imagesState, dispatchImages] = useReducer(imagesReducer, {
    loaded: 0,
    ready: criticalAssetUrls.length === 0,
  })
  const [fontsReady, setFontsReady] = useState(() => !hasFontFaceSet())
  const [runtimeReady, setRuntimeReady] = useState(() => hasIntroHubChips())

  useEffect(() => {
    let cancelled = false

    dispatchImages({ type: 'reset', total: criticalAssetUrls.length })

    if (criticalAssetUrls.length === 0) {
      return () => {
        cancelled = true
      }
    }

    const loadImages = async () => {
      await Promise.all(
        criticalAssetUrls.map(async (url) => {
          await preloadImage(url)
          if (!cancelled) dispatchImages({ type: 'imageLoaded' })
        })
      )

      if (!cancelled) {
        dispatchImages({ type: 'allReady' })
      }
    }

    void loadImages()

    return () => {
      cancelled = true
    }
  }, [criticalAssetUrls])

  useEffect(() => {
    if (!allowDeferredAssets || !imagesState.ready || deferredAssetUrls.length === 0) {
      return undefined
    }

    let cancelled = false
    const loadDeferredAssets = () => {
      if (cancelled) return
      void Promise.all(deferredAssetUrls.map((url) => preloadImage(url)))
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(loadDeferredAssets, { timeout: 1500 })
      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(loadDeferredAssets, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [allowDeferredAssets, deferredAssetUrls, imagesState.ready])

  useEffect(() => {
    if (!hasFontFaceSet()) {
      return
    }

    let cancelled = false

    document.fonts.ready
      .then(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFontsReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (runtimeReady || typeof document === 'undefined') {
      return
    }

    const container = document.getElementById('intro-hub')
    if (!container) {
      return
    }

    let cancelled = false
    const syncRuntime = () => {
      if (!cancelled && container.querySelector('.hub-chip')) {
        setRuntimeReady(true)
      }
    }

    Promise.resolve().then(syncRuntime)

    const observer = new MutationObserver(syncRuntime)
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [runtimeReady])

  const totalSteps = criticalAssetUrls.length + 2
  const completedSteps = imagesState.loaded + (fontsReady ? 1 : 0) + (runtimeReady ? 1 : 0)
  const progress =
    totalSteps > 0 ? Math.min(100, Math.round((completedSteps / totalSteps) * 100)) : 100
  const ready = imagesState.ready && fontsReady && runtimeReady
  const status = ready
    ? 'Intro hub ready'
    : !runtimeReady && imagesState.ready && fontsReady
      ? 'Finalizing intro hub...'
      : 'Preparing intro hub...'

  return { ready, progress, status }
}
