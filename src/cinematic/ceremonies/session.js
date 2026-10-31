import { useState } from 'react'
import { useSelector, useStore } from 'react-redux'
import { selectIsVipActive } from '../../store/vipSlice'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { shouldPlayCinematic, isCinematicSceneAllowed } from './runtime.mjs'

// Choose once for this ceremony. The bridge handles a later switch back/off;
// buying VIP never interrupts an already-running native animation.
export function useCinematicSession(scene, shockKey) {
  const store = useStore()
  const vip = useSelector(selectIsVipActive)
  const settings = useSelector((state) => state.settings)
  const reduced = usePresentationReducedMotion()
  const [enabled] = useState(
    () =>
      !reduced &&
      shouldPlayCinematic({ settings, game: store.getState().game }, vip) &&
      isCinematicSceneAllowed(store.getState().game, scene, shockKey)
  )
  return enabled
}
