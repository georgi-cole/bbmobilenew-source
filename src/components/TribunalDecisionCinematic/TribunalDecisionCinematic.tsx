import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameHistoryEvent, Player } from '../../types'
import { useAppSelector } from '../../store/hooks'
import TribunalStageFigure from './TribunalStageFigure'
import { joinPublicAssetPath } from '../../utils/avatar'
import { recentTribunalMembers } from './recentTribunalMembers'
import './TribunalDecisionCinematic.css'

const DURATION_MS = 2400

interface Props {
  destination: 'sequester' | 'exit'
  player: Player
  members: Player[]
  history: readonly GameHistoryEvent[]
  onComplete: () => Promise<boolean>
}

/** A reusable architectural set with the actual cast on independent layers. */
export default function TribunalDecisionCinematic({
  destination,
  player,
  members,
  history,
  onComplete,
}: Props) {
  const settings = useAppSelector((state) => state.settings)
  const reduced =
    settings.display.reduceMotion ||
    !settings.gameUX.animations ||
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const arrival = destination === 'sequester'
  const waiting = recentTribunalMembers(player, members, history)
  const waitingCount = waiting.length
  const cast = arrival ? [player, ...waiting] : [player]
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'ready'>(
    reduced ? 'ready' : 'preparing'
  )
  const [settled, setSettled] = useState<string[]>([])
  const requiredArt = arrival ? ['backplate'] : ['backplate', 'door-left', 'door-right', 'luggage']
  const artState = [...cast.map((member) => member.id), ...requiredArt].every((id) =>
    settled.includes(id)
  )
    ? 'resolved'
    : 'pending'
  function settle(id: string) {
    setSettled((current) => (current.includes(id) ? current : [...current, id]))
  }
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const completing = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const sceneRoot = useRef<HTMLDivElement>(null)
  const planeRoot = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    const scene = sceneRoot.current
    const plane = planeRoot.current
    if (!scene || !plane) return
    const fit = (width: number, height: number) => {
      const fittedWidth = Math.max(0, Math.min(width, height * 0.8))
      plane.style.width = `${fittedWidth}px`
      plane.style.height = `${fittedWidth * 1.25}px`
    }
    const measure = () => fit(scene.clientWidth, scene.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(([entry]) =>
      fit(entry.contentRect.width, entry.contentRect.height)
    )
    observer.observe(scene)
    return () => observer.disconnect()
  }, [])

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
      ? members.some((member) => member.id !== player.id)
        ? 'Your seat is ready. Settle in.'
        : "You're the first to arrive. Your seat is ready."
      : waitingCount === 1
        ? 'A fellow Tribunal member is waiting. Settle in.'
        : 'Settle in. Your fellow Tribunal members are waiting.'
    : 'Your season ends here. Thank you for being part of the Hub.'
  const sceneLabel = arrival
    ? waitingCount === 0
      ? members.some((member) => member.id !== player.id)
        ? 'Your arrival at sequester'
        : 'Your arrival at sequester as its first Tribunal member'
      : `Your arrival at sequester with ${waitingCount} waiting Tribunal member${waitingCount === 1 ? '' : 's'}`
    : 'Your last look back from outside the Hub as its doors close'

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
          ref={sceneRoot}
          className="tdc-scene"
          data-phase={phase}
          data-waiting-members={arrival ? waitingCount : 0}
          data-image-state={artState}
          aria-label={sceneLabel}
          role="group"
        >
          <div ref={planeRoot} className="tdc-stage-plane">
            <div className="tdc-camera">
              <div className="tdc-room" aria-hidden="true">
                <img
                  className="tdc-backplate"
                  src={joinPublicAssetPath(
                    `assets/tribunal/${arrival ? 'sequester-window-v4' : 'farewell-set-v4'}.webp`
                  )}
                  alt=""
                  onLoad={() => settle('backplate')}
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden'
                    settle('backplate')
                  }}
                />
              </div>
              <div className="tdc-cast">
                {cast.map((member, index) => (
                  <TribunalStageFigure
                    key={member.id}
                    player={member}
                    placement={index === 0 ? 'player' : index === 1 ? 'left' : 'right'}
                    onSettled={settle}
                  />
                ))}
                {!arrival && (
                  <div className="tdc-luggage" aria-hidden="true">
                    <img
                      src={joinPublicAssetPath('assets/tribunal/farewell-luggage-v4.webp')}
                      alt=""
                      onLoad={() => settle('luggage')}
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden'
                        settle('luggage')
                      }}
                    />
                  </div>
                )}
              </div>
              {!arrival && (
                <div className="tdc-room__portal" aria-hidden="true">
                  {(['left', 'right'] as const).map((side) => (
                    <div key={side} className={`tdc-room__door tdc-room__door--${side}`}>
                      <img
                        src={joinPublicAssetPath('assets/tribunal/farewell-door-v4.webp')}
                        alt=""
                        onLoad={() => settle(`door-${side}`)}
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                          settle(`door-${side}`)
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {arrival && <div className="tdc-near-frame" aria-hidden="true" />}
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
            className="tdc-action game-button"
            type="button"
            disabled={phase !== 'ready' || busy}
            onClick={() => void finish()}
          >
            <span>
              {busy ? 'Finishing…' : arrival ? 'Continue season' : failed ? 'Retry exit' : 'Home'}
            </span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
