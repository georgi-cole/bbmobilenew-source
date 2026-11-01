import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ceremonyQueue } from '../../cinematic/ceremonies/runtime.mjs'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import { useAppSelector } from '../../store/hooks'
import CinematicSkipButton from '../CinematicSkipButton/CinematicSkipButton'
import {
  createFinalDecisionAudio,
  type FinalDecisionAudioController,
} from '../Final3Ceremony/finalDecisionAudio'
import type {
  FinalAudienceVoteResult,
  FinalDecisionCheckpoint,
  FinalDecisionController,
  FinalDecisionOutcome,
} from '../Final3Ceremony/finalDecisionScene.mjs'
import { prepareVoxFinalThreeArtwork } from './voxFinalThreeAssets'
import type { VoxFinalThreeCeremonyProps } from './useVoxFinalThreeCeremony'
import '../Final3Ceremony/FinalDecisionPresentation.css'

export default function VoxFinalThreeCeremony(props: VoxFinalThreeCeremonyProps) {
  const [initial] = useState(() => props)
  const callbacks = useRef(props)
  useLayoutEffect(() => {
    callbacks.current = props
  })
  const target = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const controller = useRef<FinalDecisionController | null>(null)
  const audio = useRef<FinalDecisionAudioController | null>(null)
  const preferences = useAppSelector((state) => state.settings.audio)
  const preferencesRef = useRef(preferences)
  useLayoutEffect(() => {
    preferencesRef.current = preferences
    audio.current?.setPreferences(preferences)
  }, [preferences])
  const [granted, setGranted] = useState(false)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const [canSkip, setCanSkip] = useState(false)
  const foreground = usePresentationForeground()
  const { isOwner } = usePresentationOwner(
    `vox-final-three:${initial.sceneId}`,
    PRESENTATION_PRIORITY.finale,
    granted
  )
  const active = granted && isOwner && foreground
  const activeRef = useRef(active)
  const resultRef = useRef<FinalAudienceVoteResult | null>(null)
  useLayoutEffect(() => {
    activeRef.current = active
    audio.current?.setActive(active)
  }, [active])
  const onFallback = props.onFallback
  useEffect(() => ceremonyQueue.acquire(() => setGranted(true), 1, onFallback), [onFallback])
  if (active && !started) setStarted(true)

  useEffect(() => {
    if (!started || !target.current) return undefined
    let cancelled = false
    let presented = false
    let voteRequested = false
    let appealed = false
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
      outcome.evicteeId === resultRef.current?.evicteeId &&
      outcome.evicteeId !== outcome.keptId &&
      initial.nominees.some((player) => player.id === outcome.evicteeId) &&
      initial.nominees.some((player) => player.id === outcome.keptId)
    void Promise.all([
      import('../Final3Ceremony/finalDecisionScene.mjs'),
      prepareVoxFinalThreeArtwork(initial.holder, initial.nominees, abort.signal),
    ])
      .then(([scene, artwork]) => {
        if (cancelled || abort.signal.aborted || !target.current) return
        window.clearTimeout(watchdog)
        audio.current = createFinalDecisionAudio(initial.sceneId, preferencesRef.current)
        audio.current.setActive(activeRef.current)
        controller.current = scene.mountFinalDecision(target.current, {
          sceneId: initial.sceneId,
          preview: false,
          reducedMotion: false,
          initiallyPaused: !activeRef.current,
          viewerId: initial.viewerId,
          audienceVote: { appeal: initial.appeal },
          fixture: {
            holder: { id: initial.holder.id, name: initial.holder.name },
            nominees: initial.nominees.map((player, index) => ({
              id: player.id,
              name: player.name,
              assetKey: index === 0 ? 'nominee-a' : 'nominee-b',
              plea: initial.pleas[player.id],
            })),
          },
          ...artwork,
          monitor: {
            aspectRatio: 1923 / 818,
            screen: { x: 0.071, y: 0.165, width: 0.858, height: 0.642 },
          },
          onCheckpoint: (checkpoint: FinalDecisionCheckpoint) => {
            if (cancelled) return
            setCanSkip(checkpoint.canSkip === true)
            audio.current?.setStage(checkpoint.stage)
            if (!presented && activeRef.current) {
              presented = true
              callbacks.current.onPresented()
            }
          },
          onCue: ({ cue }) => {
            if (!cancelled) audio.current?.cue(cue)
          },
          onAppeal: (appeal) => {
            if (
              cancelled ||
              appealed ||
              !initial.appeal?.choices.some((item) => item.id === appeal)
            )
              return
            appealed = true
            callbacks.current.onAppeal(appeal)
          },
          onVoteRequested: () => {
            if (cancelled || voteRequested || (initial.appeal && !appealed)) return
            voteRequested = callbacks.current.onVoteRequested()
          },
          onDecision: (outcome) => {
            if (!cancelled && !decision && validOutcome(outcome)) decision = outcome
          },
          onComplete: (outcome) => {
            if (cancelled || completed || !decision || !validOutcome(outcome) || !audio.current)
              return
            completed = true
            const soundtrack = audio.current
            audio.current = null
            callbacks.current.onComplete(outcome, soundtrack)
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
      audio.current?.dispose()
      audio.current = null
      controller.current?.dispose()
      controller.current = null
      resultRef.current = null
    }
  }, [initial, onFallback, started])

  useEffect(() => {
    if (!ready || !props.result || !controller.current || resultRef.current) return
    const result = {
      ...props.result,
      percentages: { ...props.result.percentages },
    }
    // Set the receipt before feeding the scene: a waiting Skip may reveal now.
    resultRef.current = result
    if (!controller.current.setAudienceVote(result)) {
      resultRef.current = null
      onFallback()
    }
  }, [onFallback, props.result, ready])
  useEffect(() => {
    if (active) controller.current?.resume('presentation')
    else controller.current?.pause('presentation')
  }, [active, ready])
  useEffect(() => {
    if (!active) return undefined
    const ownPlay = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener('ui:playPressed', ownPlay, { capture: true })
    return () => window.removeEventListener('ui:playPressed', ownPlay, { capture: true })
  }, [active])
  useEffect(() => {
    if (!active) return undefined
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          ':is(button, [tabindex="0"]):not(:disabled)'
        ) ?? []
      ).filter((element) => !element.closest('[hidden]'))
    ;(focusable()[0] ?? dialog.current)?.focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialog.current?.focus()
      } else if (!dialog.current?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
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
      aria-label="Vox Final Three audience verdict"
      data-vox-final-three-presentation="true"
      data-cinematic-active={active ? 'true' : undefined}
      tabIndex={-1}
      hidden={!active}
    >
      <div id="final-decision-scene" ref={target} />
      {ready && canSkip && (
        <CinematicSkipButton
          ariaLabel="Skip presentation; the audience result stays the same"
          onClick={() => controller.current?.skip()}
        />
      )}
      {!ready && (
        <div className="final-decision-presentation__loading">
          <p role="status">The audience decides</p>
          <button type="button" onClick={onFallback}>
            Continue without animation
          </button>
        </div>
      )}
    </section>,
    document.body
  )
}
