import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import useSpotlightTarget, { findSpotlightTarget } from './useSpotlightTarget'

const TOOLTIP_GAP_PX = 14
const TOOLTIP_MAX_WIDTH_PX = 320
const TOOLTIP_ESTIMATED_HEIGHT_PX = 188
const TOUR_FINISH_MS = 520

type TutorialSpotlightShape = 'circle' | 'rounded' | 'panel'

type TutorialStep = {
  id: string
  title: string
  body: string
  selector: string
  padding: number
  shape: TutorialSpotlightShape
}

const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'tv',
    title: 'The Big Eye TV',
    body: 'Competitions, nominations, Safety, votes and major announcements appear here.',
    selector: '.tv-zone__viewport',
    padding: 2,
    shape: 'panel',
  },
  {
    id: 'roster',
    title: 'Your hubmates',
    body: 'This is everyone still in the game. Press and hold an avatar for a quick player preview.',
    selector: '[data-houseguest-roster="true"]',
    padding: 3,
    shape: 'panel',
  },
  {
    id: 'log',
    title: 'Game Log',
    body: 'Missed something? The Log keeps a timeline of announcements, results and important game events.',
    selector: '[data-onboarding-target="game-log"]',
    padding: 5,
    shape: 'rounded',
  },
  {
    id: 'social',
    title: 'Social',
    body: 'You approach other hubmates here. Build relationships, make strategic moves and shape your social game.',
    selector: '.game-control-dock__icon.social, button[aria-label^="Social"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'incoming',
    title: 'Incoming',
    body: 'This is where other hubmates approach you with conversations, offers and requests.',
    selector: '.game-control-dock__icon.requests, button[aria-label^="Incoming requests"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'public',
    title: 'Public',
    body: 'See the audience’s current read of the Hub and any public pressure or requests affecting your game.',
    selector: '.game-control-dock__icon.stats, button[aria-label^="Public meter"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'confessional',
    title: 'Confessional',
    body: 'Private choices, secret opportunities and messages from The Big Eye happen here.',
    selector: '.game-control-dock__icon.confessional, button[aria-label^="Confessional"]',
    padding: 10,
    shape: 'circle',
  },
  {
    id: 'more',
    title: 'More',
    body: 'Open Settings, Rules, Hall of Fame, Store and other useful shortcuts here.',
    selector: '.dock-hit-area--more, button[aria-label="More"]',
    padding: 5,
    shape: 'circle',
  },
  {
    id: 'profile',
    title: 'Create a Profile',
    body: 'Create or use a Profile to save your seasons and progress on this device.',
    selector: '[role="menuitem"][aria-label="Profile"]',
    padding: 5,
    shape: 'rounded',
  },
  {
    id: 'play',
    title: 'Play',
    body: 'When you’re ready, press Play to move the game forward.',
    selector: '.game-control-dock__play, button[aria-label="Advance to next phase"]',
    padding: 0,
    shape: 'circle',
  },
]

const TUTORIAL_STEPS_WITHOUT_PUBLIC = TUTORIAL_STEPS.filter((step) => step.id !== 'public')

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export default function SeasonTutorialTour({
  showPublicStep,
  onComplete,
  onSkip,
}: {
  showPublicStep: boolean
  onComplete: () => void
  onSkip: () => void
}) {
  const tutorialSteps = showPublicStep ? TUTORIAL_STEPS : TUTORIAL_STEPS_WITHOUT_PUBLIC
  const [stepIndex, setStepIndex] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const currentStep = tutorialSteps[stepIndex]
  const targetRect = useSpotlightTarget(currentStep.selector, currentStep.padding)
  const tooltipRef = useRef<HTMLElement | null>(null)
  const finishTimerRef = useRef<number | null>(null)

  const moveToStep = useCallback(
    (nextIndex: number) => {
      setStepIndex(clamp(nextIndex, 0, tutorialSteps.length - 1))
    },
    [tutorialSteps.length]
  )

  const completeWithHandoff = useCallback(() => {
    if (finishing) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (reducedMotion) {
      onComplete()
      return
    }
    setFinishing(true)
    finishTimerRef.current = window.setTimeout(() => {
      finishTimerRef.current = null
      onComplete()
    }, TOUR_FINISH_MS)
  }, [finishing, onComplete])

  useEffect(
    () => () => {
      if (finishTimerRef.current != null) window.clearTimeout(finishTimerRef.current)
      window.dispatchEvent(new Event('season-tutorial:close-more-menu'))
    },
    []
  )

  useLayoutEffect(() => {
    if (currentStep.id === 'more' || currentStep.id === 'profile') {
      window.dispatchEvent(new Event('season-tutorial:open-more-menu'))
      return
    }
    window.dispatchEvent(new Event('season-tutorial:close-more-menu'))
  }, [currentStep.id])

  useLayoutEffect(() => {
    if (findSpotlightTarget(currentStep.selector)) return
    const missingTargetTimer = window.setTimeout(() => {
      if (findSpotlightTarget(currentStep.selector)) return
      if (stepIndex < tutorialSteps.length - 1) {
        moveToStep(stepIndex + 1)
      } else {
        completeWithHandoff()
      }
    }, 650)
    return () => window.clearTimeout(missingTargetTimer)
  }, [completeWithHandoff, currentStep, moveToStep, stepIndex, tutorialSteps.length])

  useEffect(() => {
    tooltipRef.current?.focus({ preventScroll: true })
  }, [stepIndex])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (finishing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onSkip()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (stepIndex === tutorialSteps.length - 1) completeWithHandoff()
        else moveToStep(stepIndex + 1)
      } else if (event.key === 'ArrowLeft' && stepIndex > 0) {
        event.preventDefault()
        moveToStep(stepIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completeWithHandoff, finishing, moveToStep, onSkip, stepIndex, tutorialSteps.length])

  if (typeof document === 'undefined') return null

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH_PX, viewportWidth - 24)
  const targetCenterX = targetRect ? targetRect.left + targetRect.width / 2 : viewportWidth / 2
  const tooltipLeft = clamp(targetCenterX - tooltipWidth / 2, 12, viewportWidth - tooltipWidth - 12)
  const spaceBelow = targetRect ? viewportHeight - targetRect.bottom : 0
  const placeBelow = targetRect ? spaceBelow >= TOOLTIP_ESTIMATED_HEIGHT_PX + TOOLTIP_GAP_PX : false

  const spotlightStyle = targetRect
    ? ({
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
      } as CSSProperties)
    : undefined

  const tooltipStyle = targetRect
    ? placeBelow
      ? ({
          left: tooltipLeft,
          top: targetRect.bottom + TOOLTIP_GAP_PX,
          width: tooltipWidth,
        } as CSSProperties)
      : ({
          left: tooltipLeft,
          bottom: viewportHeight - targetRect.top + TOOLTIP_GAP_PX,
          width: tooltipWidth,
        } as CSSProperties)
    : ({
        left: Math.max(12, (viewportWidth - tooltipWidth) / 2),
        top: '50%',
        width: tooltipWidth,
        transform: 'translateY(-50%)',
      } as CSSProperties)

  const isLastStep = stepIndex === tutorialSteps.length - 1
  const focusSettled = targetRect !== null

  return createPortal(
    <div
      className={`season-tutorial${finishing ? ' season-tutorial--finishing' : ''}`}
      role="presentation"
    >
      <div className="season-tutorial__input-shield" aria-hidden="true" />
      {targetRect && (
        <div
          key={`spotlight-${currentStep.id}`}
          className="season-tutorial__spotlight"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      {targetRect && focusSettled && !finishing && (
        <div
          key={`focus-${currentStep.id}`}
          className="season-tutorial__focus-pulse"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      {targetRect && finishing && (
        <div
          className="season-tutorial__completion-flare"
          style={spotlightStyle}
          data-shape={currentStep.shape}
          aria-hidden="true"
        />
      )}
      <section
        key={currentStep.id}
        ref={tooltipRef}
        className="season-tutorial__tooltip"
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-tutorial-title"
        aria-describedby="season-tutorial-copy"
        tabIndex={-1}
      >
        <div
          className="season-tutorial__progress"
          aria-label={`Step ${stepIndex + 1} of ${tutorialSteps.length}`}
        >
          <span>{stepIndex + 1}</span>
          <i />
          <span>{tutorialSteps.length}</span>
        </div>
        <h2 id="season-tutorial-title">{currentStep.title}</h2>
        <p id="season-tutorial-copy">{currentStep.body}</p>
        <div className="season-tutorial__actions">
          <button
            type="button"
            className="season-tutorial__skip"
            onClick={onSkip}
            disabled={finishing}
          >
            Skip tour
          </button>
          <div className="season-tutorial__nav-actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="season-tutorial__secondary"
                onClick={() => moveToStep(stepIndex - 1)}
                disabled={finishing}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="season-tutorial__primary"
              onClick={() => (isLastStep ? completeWithHandoff() : moveToStep(stepIndex + 1))}
              disabled={finishing}
            >
              {isLastStep ? 'Start playing' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  )
}
