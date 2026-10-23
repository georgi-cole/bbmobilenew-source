/**
 * MinigameCompleteWrapper
 *
 * Shared layout shell for every minigame "complete" / results screen.
 * Wraps:
 *  - hero content   (title, winner badge, subtitle, etc.)
 *  - placements     (rendered inside a constrained, scrollable region)
 *  - continue area  (button always visible below the scroll region)
 *  - optional footer (extra controls)
 *
 * Focuses the Continue button on mount so keyboard users can tab through
 * the list and then press Enter/Space to advance.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './minigameCommon.css'

export interface MinigameCompleteWrapperProps {
  /** Hero / top content: title, trophy, winner name, etc. */
  children: ReactNode
  /** Content rendered inside the scrollable placement list area. */
  placementsNode?: ReactNode
  /** Extra CSS class(es) appended to the root `.minigame-complete` div. */
  className?: string
  /** Optional wrapper for grouping the hero, standings and action into one panel. */
  panelClassName?: string
  /** Extra CSS class(es) appended to the scrollable placements container. */
  placementsClassName?: string
  /**
   * ARIA role for the placements container. Pass "list" when the content
   * consists of role="listitem" children. Omit for non-list content.
   */
  placementsRole?: string
  /** ARIA label for the placements container. */
  placementsAriaLabel?: string
  /** Called when the user taps Continue. */
  onContinue: () => void
  /** Button label. Defaults to "Continue". */
  continueLabel?: string
  /** Extra CSS class(es) applied to the Continue button. */
  continueButtonClassName?: string
  /** Disable Continue while an asynchronous transition is in progress. */
  continueDisabled?: boolean
  /** Optional extra controls rendered below the Continue button. */
  footerNode?: ReactNode
}

export default function MinigameCompleteWrapper({
  children,
  placementsNode,
  className,
  panelClassName,
  placementsClassName,
  placementsRole,
  placementsAriaLabel,
  onContinue,
  continueLabel = 'Continue',
  continueButtonClassName,
  continueDisabled = false,
  footerNode,
}: MinigameCompleteWrapperProps) {
  const continueRef = useRef<HTMLButtonElement>(null)

  // Focus Continue on mount so keyboard users can press Enter immediately.
  useEffect(() => {
    continueRef.current?.focus()
  }, [])

  const rootClass = ['minigame-complete', className].filter(Boolean).join(' ')
  const scrollClass = ['minigame-placement-list', placementsClassName].filter(Boolean).join(' ')
  const continueClass = continueButtonClassName ?? 'minigame-complete-continue'
  const panelContent = (
    <>
      {/* Hero: title, trophy, winner name, etc. */}
      {children}

      {/* Scrollable placements */}
      {placementsNode !== undefined && (
        <div className={scrollClass} role={placementsRole} aria-label={placementsAriaLabel}>
          {placementsNode}
        </div>
      )}

      {/* Continue button — kept outside the scrollable placements */}
      <div className="minigame-continue-area">
        <button
          ref={continueRef}
          type="button"
          className={continueClass}
          onClick={onContinue}
          aria-label={continueLabel}
          disabled={continueDisabled}
        >
          {continueLabel}
        </button>
        {footerNode}
      </div>
    </>
  )

  return (
    <div className={rootClass}>
      {panelClassName ? <section className={panelClassName}>{panelContent}</section> : panelContent}
    </div>
  )
}
