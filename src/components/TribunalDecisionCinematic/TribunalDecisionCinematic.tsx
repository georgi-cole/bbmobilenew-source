import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import { useAppSelector } from '../../store/hooks'
import { joinPublicAssetPath } from '../../utils/avatar'
import './TribunalDecisionCinematic.css'

const DURATION_MS = 2400

interface Props {
  destination: 'sequester' | 'exit'
  player: Player
  members: Player[]
  onComplete: () => Promise<boolean>
}

/** A first-person establishing shot, followed by a quiet editorial title. */
export default function TribunalDecisionCinematic({
  destination,
  player,
  members,
  onComplete,
}: Props) {
  const settings = useAppSelector((state) => state.settings)
  const reduced =
    settings.display.reduceMotion ||
    !settings.gameUX.animations ||
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const arrival = destination === 'sequester'
  const waitingCount = Math.min(2, members.filter((member) => member.id !== player.id).length)
  const arrivalArt = ['arrival-empty-v2.webp', 'arrival-one-v2.webp', 'arrival-two-v2.webp'][
    waitingCount
  ]
  const image = arrival ? arrivalArt : 'departure-v2.webp'
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'ready'>(
    reduced ? 'ready' : 'preparing'
  )
  const [artState, setArtState] = useState<'pending' | 'resolved' | 'failed'>('pending')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const completing = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (phase !== 'preparing') return
    const timer = window.setTimeout(() => setPhase('playing'), artState === 'pending' ? 1800 : 0)
    return () => window.clearTimeout(timer)
  }, [artState, phase])

  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setTimeout(() => setPhase('ready'), reduced ? 0 : DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [phase, reduced])

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (phase === 'ready') primary.current?.focus()
  }, [phase])

  async function finish() {
    if (completing.current) return
    completing.current = true
    setBusy(true)
    setFailed(false)
    try {
      if (await onComplete()) return
    } catch {
      // Keep the selected outcome available when durable storage needs a retry.
    }
    completing.current = false
    setBusy(false)
    setFailed(true)
  }

  const title = arrival ? 'Welcome to sequester' : 'One last goodbye'
  const description = arrival
    ? waitingCount === 0
      ? "You're the first to arrive. Your seat is ready."
      : waitingCount === 1
        ? 'A fellow Tribunal member is waiting. Settle in.'
        : 'Settle in. Your fellow Tribunal members are waiting.'
    : 'Your season ends here. Thank you for being part of the Hub.'
  const sceneLabel = arrival
    ? waitingCount === 0
      ? 'An empty sequester lounge, seen from the arriving player’s point of view'
      : `A sequester lounge with ${waitingCount} seated Tribunal member${waitingCount === 1 ? '' : 's'}`
    : 'The closed Hub doors at the end of your season'

  return createPortal(
    <div className="tdc-backdrop">
      <div
        ref={root}
        className={`tdc-dialog tdc-dialog--${destination}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
        tabIndex={-1}
        data-phase={phase}
        data-reduced-motion={reduced}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && phase !== 'ready') {
            event.preventDefault()
            setPhase('ready')
          }
          if (event.key !== 'Tab') return
          const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
          if (!buttons?.length) return
          const first = buttons[0],
            last = buttons[buttons.length - 1]
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === root.current)
          ) {
            event.preventDefault()
            last.focus()
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === root.current)
          ) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div
          className="tdc-scene"
          data-phase={phase}
          data-waiting-members={arrival ? waitingCount : 0}
          aria-label={sceneLabel}
          role="group"
        >
          <img
            className="tdc-art"
            alt=""
            src={joinPublicAssetPath(`assets/tribunal/${image}`)}
            data-image-state={artState}
            onLoad={() => setArtState('resolved')}
            onError={() => setArtState('failed')}
          />
          <div className="tdc-shade" />
        </div>
        <header className="tdc-header">
          <span>{arrival ? 'The Tribunal' : 'The Big Eye'}</span>
          <button
            type="button"
            aria-label="Skip animation"
            onClick={() => setPhase('ready')}
            disabled={phase === 'ready'}
          >
            Skip
          </button>
        </header>
        <footer className="tdc-copy">
          <p className="tdc-eyebrow">{arrival ? 'Your next chapter' : 'The end of this chapter'}</p>
          <h2 id={titleId} aria-label={title}>
            {arrival ? (
              <>
                Welcome to <em>sequester</em>
              </>
            ) : (
              <>
                One last <em>goodbye</em>
              </>
            )}
          </h2>
          <p id={`${titleId}-description`}>{description}</p>
          {arrival && player.name !== 'You' && (
            <p className="tdc-name">{player.name} · Tribunal member</p>
          )}
          {failed && <p role="alert">Your season could not be closed. Please try again.</p>}
          <button
            ref={primary}
            type="button"
            disabled={phase !== 'ready' || busy}
            onClick={() => void finish()}
          >
            <span>
              {busy
                ? 'Finishing…'
                : arrival
                  ? 'Continue season'
                  : failed
                    ? 'Retry exit'
                    : 'Return home'}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
