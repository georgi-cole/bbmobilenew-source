import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from 'react-redux'
import type { RootState } from '../../store/store'
import type { ReplacementPresentation } from './replacementPresentation'
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
}: {
  sequence: Sequence
  children: ReactNode
}) {
  const store = useStore<RootState>()
  const target = useRef<HTMLDivElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const clip = useRef<{
    stop(): void
    pause(): void
    resume(): void
    setVisible(value: boolean): void
  } | null>(null)
  const callbacks = useRef(sequence)
  callbacks.current = sequence
  const owner = usePresentationOwner(
    'vip-cinematic',
    PRESENTATION_PRIORITY.ceremony,
    sequence.active
  )
  const foreground = usePresentationForeground()
  const visible = owner.isOwner && foreground
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const outcome = sequence.playing ?? sequence.held
  const key = outcome
    ? `${outcome.eventKey}:${outcome.decisionOnly ? JSON.stringify(outcome.decision) : 'film'}`
    : null
  useEffect(() => {
    if (!sequence.active || !outcome || !target.current) return
    let cancelled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let controller: ReturnType<(typeof import('./renderer.js'))['createClip']> | null = null
    const done = () => {
      if (!cancelled) callbacks.current.onDone()
    }
    const fail = () => {
      if (!cancelled) callbacks.current.onError()
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
            clip.current = controller
            const prepared = await controller.prepare('replacement', cast, 'generic', {
              replacementOutcome: outcome,
            })
            if (cancelled || !prepared || !target.current) return
            clearTimeout(watchdog)
            controller.mount(target.current, done, done)
            // A mandatory choice is a still camera shot, with no running timers.
            // The game reducer, never the film's clock or Skip, commits that choice.
            if (outcome.decisionOnly) controller.seek(900)
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
      controller?.stop()
      clip.current = null
      release()
    }
    // Each receipt is immutable. Unrelated store updates must not restart its film.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sequence.active, store])
  useEffect(() => {
    clip.current?.setVisible(visible)
    if (visible) clip.current?.resume()
    else clip.current?.pause()
  }, [visible])
  useEffect(() => {
    if (!sequence.active || !visible) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const buttons = () => [
      ...(shell.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ??
        []),
    ]
    buttons()[0]?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (callbacks.current.playing) {
          clip.current?.stop()
          callbacks.current.onDone()
        }
      } else if (event.key === 'Tab') {
        const targets = buttons()
        if (!targets.length) {
          event.preventDefault()
          return
        }
        const index = targets.indexOf(document.activeElement as HTMLElement)
        if (
          index < 0 ||
          (!event.shiftKey && index === targets.length - 1) ||
          (event.shiftKey && index === 0)
        ) {
          event.preventDefault()
          targets[event.shiftKey ? targets.length - 1 : 0]?.focus()
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
        <AnimatePresence>
          {sequence.active && (
            <motion.div
              ref={shell}
              className="replacement-sequence"
              data-cinematic-active="true"
              key="replacement-sequence"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              role="dialog"
              aria-modal="true"
              aria-label="Safety and replacement ceremony"
              style={{ visibility: visible ? 'visible' : 'hidden' }}
            >
              <div ref={target} className="replacement-sequence-film" />
              {sequence.playing && (
                <CinematicSkipButton
                  ariaLabel="Skip this ceremony scene"
                  onClick={() => {
                    clip.current?.stop()
                    callbacks.current.onDone()
                  }}
                />
              )}
              {!sequence.playing && (
                <div key={key} className="replacement-sequence-input">
                  {children}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
