import { useState } from 'react'
import { useSelector } from 'react-redux'
import { selectIsVipActive } from '../../store/vipSlice'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { shouldPlayCinematic } from './runtime.mjs'

// Choose once for this ceremony. The bridge handles a later switch back/off;
// buying VIP never interrupts an already-running native animation.
export function useCinematicSession() {
  const vip = useSelector(selectIsVipActive)
  const settings = useSelector((state) => state.settings)
  const reduced = usePresentationReducedMotion()
  const [enabled] = useState(() => !reduced && shouldPlayCinematic({ settings }, vip))
  return enabled
}
