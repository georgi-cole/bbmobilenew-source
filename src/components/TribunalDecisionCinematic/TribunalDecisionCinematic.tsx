import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import { useAppSelector } from '../../store/hooks'
import TribunalStageFigure from './TribunalStageFigure'
import CityView from './CityView'
import './TribunalDecisionCinematic.css'

const DURATION_MS = 2400

interface Props {
  destination: 'sequester' | 'exit'
  player: Player
  members: Player[]
  onComplete: () => Promise<boolean>
}

/** A reusable architectural set with the actual cast on independent layers. */
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
  const waiting = members.filter((member) => member.id !== player.id).slice(0, 2)
  const waitingCount = waiting.length
  const cast = arrival ? [player, ...waiting] : [player]
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'ready'>(
    reduced ? 'ready' : 'preparing'
  )
  const [settled, setSettled] = useState<string[]>([])
  const artState = cast.every((member) => settled.includes(member.id)) ? 'resolved' : 'pending'
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
      ? 'Your arrival at sequester as its first Tribunal member'
      : `Your arrival at sequester with ${waitingCount} waiting Tribunal member${waitingCount === 1 ? '' : 's'}`
    : 'Your farewell inside the Hub exit, facing the city outside'

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
          data-image-state={artState}
          aria-label={sceneLabel}
          role="group"
        >
          <div className="tdc-room" aria-hidden="true">
            <div className="tdc-room__wall" />
            {arrival ? (
              <div className="tdc-room__window">
                <CityView />
                <div className="tdc-room__mullions" />
              </div>
            ) : (
              <div className="tdc-room__portal">
                <CityView />
                <span>
                  Exit <span aria-hidden="true">↗</span>
                </span>
                <div className="tdc-room__door tdc-room__door--left" />
                <div className="tdc-room__door tdc-room__door--right" />
              </div>
            )}
            <div className="tdc-room__sconce tdc-room__sconce--left" />
            <div className="tdc-room__sconce tdc-room__sconce--right" />
            <div className="tdc-room__floor" />
          </div>
          <div className="tdc-cast">
            {cast.map((member, index) => (
              <TribunalStageFigure
                key={member.id}
                player={member}
                placement={index === 0 ? 'player' : index === 1 ? 'left' : 'right'}
                onSettled={(id) =>
                  setSettled((current) => (current.includes(id) ? current : [...current, id]))
                }
              />
            ))}
          </div>
        </div>
        <header className="tdc-header">
          <span>{arrival ? 'The Tribunal' : 'Leaving the Hub'}</span>
          <button
            type="button"
            aria-label="Skip animation"
            className="game-button game-button--ghost"
            onClick={() => setPhase('ready')}
            disabled={phase === 'ready'}
          >
            Skip
          </button>
        </header>
        <footer className="tdc-copy">
          <p className="tdc-eyebrow">{arrival ? 'Your next chapter' : 'Season complete'}</p>
          <h2 id={titleId} aria-label={title}>
            {arrival ? (
              <>
                Welcome to <span>sequester</span>
              </>
            ) : (
              <>
                One last <span>goodbye</span>
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
            className="tdc-action game-button game-button--primary"
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
