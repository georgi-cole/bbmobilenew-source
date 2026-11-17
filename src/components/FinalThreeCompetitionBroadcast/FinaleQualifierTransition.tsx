import { useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { FINAL_THREE_SET_ASSETS } from '../FinalThreeStage/finalThreeSetAssets'
import FinalThreeClosingBrand from './FinalThreeClosingBrand'
import { FINAL_THREE_BRAND_DURATION_MS } from './competitionBroadcastTimeline'
import './FinaleQualifierTransition.css'

/** The accepted result reaches the reducer (and its existing ad break) after the ident. */
export default function FinaleQualifierTransition({ onComplete }: { onComplete: () => void }) {
  const { isOwner } = usePresentationOwner(
    'finale-qualifier-transition',
    PRESENTATION_PRIORITY.finale
  )
  const foreground = usePresentationForeground()
  const reduced = usePresentationReducedMotion()
  const completed = useRef(false)
  const active = isOwner && foreground
  const cues = useMemo(
    () => [
      {
        atMs: reduced ? 0 : FINAL_THREE_BRAND_DURATION_MS,
        run: () => {
          if (completed.current) return
          completed.current = true
          onComplete()
        },
      },
    ],
    [onComplete, reduced]
  )
  usePresentationTimeline(active, cues)
  return createPortal(
    <div
      className="finale-qualifier-transition"
      role="status"
      aria-label="Finale continues"
      hidden={!isOwner}
    >
      <FinalThreeClosingBrand
        eyeSrc={FINAL_THREE_SET_ASSETS.eye}
        active={!reduced}
        paused={!active}
      />
    </div>,
    document.body
  )
}
