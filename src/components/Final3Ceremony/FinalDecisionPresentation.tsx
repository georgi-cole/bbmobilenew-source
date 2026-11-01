import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ceremonyQueue,
  isCinematicSceneAllowed,
  shouldPlayCinematic,
} from '../../cinematic/ceremonies/runtime.mjs'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { useAppSelector } from '../../store/hooks'
import { selectIsVipActive } from '../../store/vipSlice'
import type { Player } from '../../types'
import { prepareFinalDecisionArtwork } from './finalDecisionAssets'
import type { FinalDecisionController, FinalDecisionOutcome } from './finalDecisionScene.mjs'
import './FinalDecisionPresentation.css'

interface Props {
  sceneId: string
  phase: 'pleas' | 'decision' | 'announcement'
  holder: Player
  nominees: Player[]
  pleas: Record<string, string>
  comparisons: Record<string, string>
  onChoiceReady: () => void
  onDecision: (evicteeId: string) => void
  onComplete: () => void
  fallback: ReactNode
}

interface PremiumProps extends Omit<Props, 'phase' | 'fallback'> {
  onFallback: () => void
}

function subscribeViewport(listener: () => void) {
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function viewportTooShort() {
  return typeof window !== 'undefined' && window.innerHeight < 540
}

function PremiumFinalDecision({ onFallback, ...props }: PremiumProps) {
  // Freeze this presentation's cast and event identity while keeping callbacks current.
  const [initial] = useState(() => props)
  const callbacks = useRef(props)
  useLayoutEffect(() => {
    callbacks.current = props
  })
  const target = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const controller = useRef<FinalDecisionController | null>(null)
  const [granted, setGranted] = useState(false)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const foreground = usePresentationForeground()
  const { isOwner } = usePresentationOwner(
    `final-three-decision:${initial.sceneId}`,
    PRESENTATION_PRIORITY.finale,
    granted
  )
  const active = granted && isOwner && foreground
  const activeRef = useRef(active)
  useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => ceremonyQueue.acquire(() => setGranted(true), 1, onFallback), [onFallback])
  if (active && !started) setStarted(true)

  useEffect(() => {
    if (!started || !target.current) return undefined
    let cancelled = false
    let choiceOpened = false
    let decision: FinalDecisionOutcome | null = null
    let completed = false
    const abort = new AbortController()
    const fail = () => {
      if (cancelled) return
      abort.abort()
      onFallback()
    }
    const watchdog = window.setTimeout(fail, 10_000)
    const validOutcome = (outcome: FinalDecisionOutcome) =>
      outcome.sceneId === initial.sceneId &&
      outcome.holderId === initial.holder.id &&
      outcome.evicteeId !== outcome.keptId &&
      initial.nominees.some((player) => player.id === outcome.evicteeId) &&
      initial.nominees.some((player) => player.id === outcome.keptId)

    void Promise.all([
      import('./finalDecisionScene.mjs'),
      prepareFinalDecisionArtwork(initial.holder, initial.nominees, abort.signal),
    ])
      .then(([scene, artwork]) => {
        if (cancelled || abort.signal.aborted || !target.current) return
        window.clearTimeout(watchdog)
        controller.current = scene.mountFinalDecision(target.current, {
          sceneId: initial.sceneId,
          preview: false,
          reducedMotion: false,
          fixture: {
            holder: { id: initial.holder.id, name: initial.holder.name },
            nominees: initial.nominees.map((player, index) => ({
              id: player.id,
              name: player.name,
              assetKey: index === 0 ? 'nominee-a' : 'nominee-b',
              plea: initial.pleas[player.id],
              comparison: initial.comparisons[player.id],
            })),
          },
          ...artwork,
          monitor: {
            aspectRatio: 1923 / 818,
            screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
          },
          onCheckpoint: (checkpoint) => {
            if (cancelled || choiceOpened || checkpoint.stage !== 'choose') return
            choiceOpened = true
            callbacks.current.onChoiceReady()
          },
          onDecision: (outcome) => {
            if (cancelled || decision || !validOutcome(outcome)) return
            decision = outcome
            callbacks.current.onDecision(outcome.evicteeId)
          },
          onComplete: (outcome) => {
            if (
              cancelled ||
              completed ||
              !decision ||
              !validOutcome(outcome) ||
              outcome.evicteeId !== decision.evicteeId
            ) {
              return
            }
            completed = true
            callbacks.current.onComplete()
          },
        })
        if (!activeRef.current) controller.current.pause('presentation')
        setReady(true)
      })
      .catch(() => {
        if (!cancelled && !abort.signal.aborted) fail()
      })

    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
      abort.abort()
      controller.current?.dispose()
      controller.current = null
    }
  }, [initial, onFallback, started])

  useEffect(() => {
    if (active) controller.current?.resume('presentation')
    else controller.current?.pause('presentation')
  }, [active, ready])

  useEffect(() => {
    if (!active) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []
      ).filter((button) => !button.closest('[hidden]'))
    const first = focusable()[0] ?? dialog.current
    first?.focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const buttons = focusable()
      const firstButton = buttons[0]
      const lastButton = buttons.at(-1)
      if (!firstButton || !lastButton) {
        event.preventDefault()
        dialog.current?.focus()
      } else if (!dialog.current?.contains(document.activeElement)) {
        event.preventDefault()
        firstButton.focus()
      } else if (event.shiftKey && document.activeElement === firstButton) {
        event.preventDefault()
        lastButton.focus()
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault()
        firstButton.focus()
      }
    }
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keyboard, true)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [active, ready])

  return createPortal(
    <section
      ref={dialog}
      className="final-decision-presentation"
      role="dialog"
      aria-modal="true"
      aria-label="Final Power Decision"
      tabIndex={-1}
      hidden={!active}
      data-cinematic-active={active ? 'true' : undefined}
    >
      <div id="final-decision-scene" ref={target} />
      {!ready && (
        <div className="final-decision-presentation__loading">
          <p role="status">Final Power Decision</p>
          <button type="button" onClick={onFallback}>
            Continue without animation
          </button>
        </div>
      )}
    </section>,
    document.body
  )
}

/** Presentation only: the native choice and existing exit remain authoritative. */
export default function FinalDecisionPresentation(props: Props) {
  const eligible = useAppSelector(
    (state) =>
      shouldPlayCinematic(state, selectIsVipActive(state)) &&
      isCinematicSceneAllowed(state.game, 'final3')
  )
  const reducedMotion = usePresentationReducedMotion()
  const shortViewport = useSyncExternalStore(subscribeViewport, viewportTooShort, () => false)
  const validCast =
    props.holder.isUser === true &&
    props.nominees.length === 2 &&
    props.nominees[0].id !== props.nominees[1].id &&
    props.nominees.every((player) => player.id !== props.holder.id)
  const canPresent = eligible && !reducedMotion && !shortViewport && validCast
  // Never insert a cinematic into an existing native presentation or replay a confirmed choice.
  const [session, setSession] = useState(() => canPresent && props.phase === 'pleas')
  const [fallback, setFallback] = useState(false)
  const fallBack = useCallback(() => setFallback(true), [])
  if (session && !canPresent) setSession(false)

  if (!session || fallback || !canPresent) return props.fallback
  return <PremiumFinalDecision {...props} onFallback={fallBack} />
}
