import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import useSpotlightTarget from './useSpotlightTarget'
import './SeasonStartOnboardingController.css'

export default function CompetitionRulesGuide({
  competition,
  targetRef,
  onRead,
  onSkip,
}: {
  competition: 'LOH' | 'POS'
  targetRef: RefObject<HTMLButtonElement | null>
  onRead: () => void
  onSkip: () => void
}) {
  const rect = useSpotlightTarget(targetRef, 5)
  const targetReady = rect !== null
  const dialogRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [targetReady])
  if (!rect) return null
  const viewport = window.visualViewport
  const width = Math.min(320, (viewport?.width ?? window.innerWidth) - 24)
  const leftEdge = (viewport?.offsetLeft ?? 0) + 12
  const left = Math.max(
    leftEdge,
    Math.min(rect.right - width, leftEdge + (viewport?.width ?? window.innerWidth) - width - 24)
  )
  const topEdge = (viewport?.offsetTop ?? 0) + 12
  const top = Math.max(
    topEdge,
    Math.min(rect.bottom + 14, topEdge + (viewport?.height ?? window.innerHeight) - 220)
  )
  return createPortal(
    <div className="season-tutorial" role="presentation">
      <div className="season-tutorial__input-shield" aria-hidden="true" />
      <div
        className="season-tutorial__spotlight"
        data-shape="circle"
        aria-hidden="true"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
      <button
        type="button"
        className="competition-rules-guide__eye"
        aria-label={`Read ${competition} rules`}
        onClick={onRead}
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
      <section
        ref={dialogRef}
        className="season-tutorial__tooltip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="competition-rules-guide-title"
        aria-describedby="competition-rules-guide-copy"
        tabIndex={-1}
        style={{ left, top, width }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onSkip()
          if (event.key === 'Tab') {
            const buttons = dialogRef.current?.querySelectorAll('button')
            const first = buttons?.[0]
            const last = buttons?.[buttons.length - 1]
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === dialogRef.current)
            ) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <h2 id="competition-rules-guide-title">Your first {competition} competition</h2>
        <p id="competition-rules-guide-copy">
          Tap the eye button to read the competition rules before you play. You can open it again
          whenever you need a reminder.
        </p>
        <div className="season-tutorial__actions">
          <button type="button" className="season-tutorial__skip" onClick={onSkip}>
            Skip
          </button>
          <button type="button" className="season-tutorial__primary" onClick={onRead}>
            Read rules
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}
