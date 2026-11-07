import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ReactReduxContext } from 'react-redux'
import type { AppDispatch, RootState } from '../../store/store'
import { clearRewardHandler, showRewarded, type AdPlacement } from './adsService'

/** Shared lifecycle for the formerly simulated, standalone reward buttons. */
export function useRewardedAd() {
  const context = useContext(ReactReduxContext)
  const [pending, setPending] = useState(false)
  const active = useRef<AdPlacement | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (active.current) clearRewardHandler(active.current)
    }
  }, [])
  const request = useCallback(
    (placement: AdPlacement): Promise<boolean> => {
      if (active.current || !context) return Promise.resolve(false)
      active.current = placement
      setPending(true)
      return new Promise<boolean>((resolve) => {
        const finish = (earned: boolean) => {
          active.current = null
          if (mounted.current) setPending(false)
          resolve(earned && mounted.current)
        }
        const started = showRewarded(
          placement,
          context.store.getState() as RootState,
          context.store.dispatch as AppDispatch,
          () => finish(true),
          { onDismissed: () => finish(false) }
        )
        if (!started) finish(false)
      })
    },
    [context]
  )
  return { pending, request }
}
