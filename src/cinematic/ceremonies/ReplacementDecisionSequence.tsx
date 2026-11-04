import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from 'react-redux'
import type { RootState } from '../../store/store'
import type { ReplacementPresentation } from './replacementPresentation'
import type { ClipController } from './renderer'
import { ceremonyCast, ceremonyQueue } from './runtime.mjs'
import {
  PRESENTATION_PRIORITY,
  usePresentationForeground,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import CinematicSkipButton from '../../components/CinematicSkipButton/CinematicSkipButton'
import './replacement-sequence.css'
interface Sequence {
  active: boolean
  playing: ReplacementPresentation | null
  held: ReplacementPresentation | null
  onDone: () => void
  onError: () => void
}
export default function ReplacementDecisionSequence({
  sequence,
  children,
  onRequestDecision,
}: {
  sequence: Sequence
  children: ReactNode
  onRequestDecision: () => void
}) {
  const store = useStore<RootState>()
  const target = useRef<HTMLDivElement>(null),
    shell = useRef<HTMLDivElement>(null)
  const clip = useRef<ClipController | null>(null),
    requested = useRef<string | null>(null)
  const callbacks = useRef({ sequence, onRequestDecision })
  callbacks.current = { sequence, onRequestDecision }
  const owner = usePresentationOwner(
    'vip-cinematic',
    PRESENTATION_PRIORITY.ceremony,
    sequence.active
  )
  const foreground = usePresentationForeground(),
    visible = owner.isOwner && foreground
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const outcome = sequence.playing ?? sequence.held
  const key = outcome
    ? `${outcome.eventKey}:${outcome.decisionOnly ? JSON.stringify(outcome.decision) : 'film'}`
    : null
  const request = useRef(() => {})
  request.current = () => {
    if (!key || requested.current === key || !callbacks.current.sequence.held) return
    requested.current = key
    callbacks.current.onRequestDecision()
  }
  useEffect(() => {
    if (!sequence.active || !outcome || !target.current) return
    let cancelled = false,
      displayed = false
    let controller: ClipController | null = null
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const done = () => {
      if (cancelled) return
      if (outcome.decisionOnly) request.current()
      else callbacks.current.sequence.onDone()
    }
    const fail = () => {
      if (!cancelled) callbacks.current.sequence.onError()
    }
    if (outcome.decisionOnly && outcome.skipAuthority) {
      queueMicrotask(() => {
        if (!cancelled) request.current()
      })
      return () => {
        cancelled = true
      }
    }
    const release = ceremonyQueue.acquire(
      () => {
        watchdog = setTimeout(() => {
          controller?.stop()
          fail()
        }, 10000)
        void Promise.all([import('./renderer.js'), import('./cast.json')])
          .then(async ([renderer, catalog]) => {
            if (cancelled) return
            const cast = ceremonyCast(
              'replacement',
              { replacementOutcome: outcome },
              store.getState().game,
              catalog.default.characters
            )
            if (!cast) {
              fail()
              return
            }
            controller = renderer.createClip()
            const prepared = await controller.prepare('replacement', cast, 'generic', {
              replacementOutcome: outcome,
            })
            if (cancelled || !prepared || !target.current) return
            clearTimeout(watchdog)
            const old = clip.current
            controller.mount(target.current, done, done, 'generic', { retainLastFrame: true })
            displayed = true
            clip.current = controller
            old?.stop()
            controller.setVisible(visibleRef.current)
            if (!visibleRef.current) controller.pause()
          })
          .catch(fail)
      },
      1,
      fail
    )
    return () => {
      cancelled = true
      clearTimeout(watchdog)
      // Keep the last composed frame through preparation of the next segment.
      if (!displayed) controller?.stop()
      release()
    }
    // The immutable receipt owns this film. Unrelated game updates cannot restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sequence.active, store])
  useEffect(
    () => () => {
      clip.current?.stop()
      clip.current = null
    },
    []
  )
  useEffect(() => {
    clip.current?.setVisible(visible)
    if (visible) clip.current?.resume()
    else clip.current?.pause()
  }, [visible])
  useEffect(() => {
    if (!sequence.active || !visible) return
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const button = shell.current?.querySelector<HTMLButtonElement>('button')
    button?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        button?.focus()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (callbacks.current.sequence.held) request.current()
        else {
          clip.current?.stop()
          callbacks.current.sequence.onDone()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [key, sequence.active, visible])
  return (
    <>
      {!sequence.active && children}
      {createPortal(
        <AnimatePresence
          onExitComplete={() => {
            if (!callbacks.current.sequence.active) {
              clip.current?.stop()
              clip.current = null
            }
          }}
        >
          {sequence.active && (
            <motion.div
              ref={shell}
              className="replacement-sequence"
              data-cinematic-active="true"
              key="replacement-sequence"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              role="dialog"
              aria-modal="true"
              aria-label="Safety and replacement ceremony"
              style={{ visibility: visible ? 'visible' : 'hidden' }}
            >
              <div ref={target} className="replacement-sequence-film" />
              <CinematicSkipButton
                ariaLabel={sequence.held ? 'Continue to Confessional' : 'Skip this ceremony scene'}
                onClick={() => {
                  if (callbacks.current.sequence.held) request.current()
                  else {
                    clip.current?.stop()
                    callbacks.current.sequence.onDone()
                  }
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
