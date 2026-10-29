import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Player } from '../../types'
import { useAppSelector } from '../../store/hooks'
import {
  getProfilePhotoAvatarId,
  joinPublicAssetPath,
  resolveInformalCutoutCandidates,
} from '../../utils/avatar'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import sceneArtwork from './artwork.json'
import './TribunalDecisionCinematic.css'

const DURATION_MS = 4600
const MAX_WAITING_MEMBERS = 4

function SceneCharacter({ player, onReady }: { player: Player; onReady: () => void }) {
  const [fallback, setFallback] = useState(false)
  const [resolved, setResolved] = useState(false)
  const source = resolveInformalCutoutCandidates(player)[0]?.split('/').at(-1) ?? ''
  const thumbnail = (sceneArtwork as Record<string, string>)[source]
  if (fallback || !thumbnail || getProfilePhotoAvatarId(player.avatar)) {
    return (
      <FullSizeCutoutImage player={player} alt={player.name} onLoad={onReady} onError={onReady} />
    )
  }
  return (
    <img
      alt={player.name}
      src={joinPublicAssetPath(thumbnail)}
      data-image-state={resolved ? 'resolved' : 'pending'}
      onLoad={() => {
        setResolved(true)
        onReady()
      }}
      onError={() => setFallback(true)}
    />
  )
}

interface Props {
  destination: 'sequester' | 'exit'
  player: Player
  members: Player[]
  onComplete: () => Promise<boolean>
}

/** A mounted-only scene: existing character art, one room/frame, finite CSS motion. */
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
  const waiting = members.filter((member) => member.id !== player.id)
  const visibleMembers = arrival ? waiting.slice(0, MAX_WAITING_MEMBERS) : []
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'ready'>(
    reduced ? 'ready' : 'preparing'
  )
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const completing = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const expectedImages = 2 + (arrival ? 1 : 0) + visibleMembers.length
  const markLoaded = useCallback((key: string) => {
    setLoaded((current) => {
      if (current.has(key)) return current
      return new Set([...current, key])
    })
  }, [])

  useEffect(() => {
    if (phase !== 'preparing') return
    // Cached artwork starts immediately; a failed/slow asset cannot strand the scene.
    const timer = window.setTimeout(
      () => setPhase('playing'),
      loaded.size >= expectedImages ? 0 : 1800
    )
    return () => window.clearTimeout(timer)
  }, [expectedImages, loaded.size, phase])

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
      // Preserve the scene and selected outcome when durable storage needs a retry.
    }
    completing.current = false
    setBusy(false)
    setFailed(true)
  }

  const title = arrival ? 'Welcome to sequester' : 'One last goodbye'
  const description = arrival
    ? waiting.length
      ? `Your fellow Tribunal members are here. Together, you'll help choose this season's winner.`
      : "You're the first to arrive. Your place is ready; the other Tribunal members will join you."
    : 'The door closes on your season. Thank you for being part of the Hub.'

  return createPortal(
    <div className="tdc-backdrop">
      <div
        ref={root}
        className="tdc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && phase !== 'ready') setPhase('ready')
          if (event.key !== 'Tab') return
          const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
          if (!buttons?.length) return
          const first = buttons[0]
          const last = buttons[buttons.length - 1]
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
        <header className="tdc-header">
          <span>{arrival ? 'THE TRIBUNAL · SEQUESTER' : 'LEAVING THE HUB'}</span>
          <button type="button" onClick={() => setPhase('ready')} disabled={phase === 'ready'}>
            Skip animation
          </button>
        </header>
        <div
          className={`tdc-scene tdc-scene--${destination}`}
          data-phase={phase}
          data-reduced-motion={reduced}
          aria-label={arrival ? 'Arriving in sequester' : 'Leaving through the Hub exit'}
          role="group"
        >
          {arrival && (
            <img
              className="tdc-room"
              alt=""
              src={joinPublicAssetPath('assets/tribunal/sequester.webp')}
              onLoad={() => markLoaded('room')}
              onError={() => markLoaded('room')}
            />
          )}
          <div className="tdc-room-light" />
          <div className="tdc-door">
            <div className="tdc-door-opening" />
            <div className="tdc-door-leaf" />
            <img
              alt=""
              src={joinPublicAssetPath('assets/tribunal/exit-doorframe.webp')}
              onLoad={() => markLoaded('door')}
              onError={() => markLoaded('door')}
            />
          </div>
          {visibleMembers.map((member, index) => (
            <div
              className="tdc-member"
              key={member.id}
              style={
                {
                  '--member-index': index,
                  '--member-count': visibleMembers.length,
                } as CSSProperties
              }
            >
              <SceneCharacter player={member} onReady={() => markLoaded(`member:${member.id}`)} />
              <span>{member.name}</span>
            </div>
          ))}
          <div className="tdc-player">
            <SceneCharacter player={player} onReady={() => markLoaded('player')} />
            <svg className="tdc-baggage" viewBox="0 0 60 100" aria-hidden="true">
              <path d="M21 32V6h18v26" fill="none" stroke="#c8b48a" strokeWidth="3" />
              <rect
                x="7"
                y="30"
                width="46"
                height="62"
                rx="8"
                fill="#302638"
                stroke="#b69a68"
                strokeWidth="2"
              />
              <path d="M18 40v42M30 40v42M42 40v42" stroke="#75647b" strokeWidth="2" />
              <circle cx="16" cy="96" r="4" fill="#b69a68" />
              <circle cx="44" cy="96" r="4" fill="#b69a68" />
            </svg>
            <span>{player.name}</span>
          </div>
          <div className="tdc-fade" />
          {arrival && (
            <p className="tdc-waiting-label">
              {waiting.length
                ? `${waiting.length} Tribunal member${waiting.length === 1 ? '' : 's'} waiting`
                : 'Your place is ready'}
            </p>
          )}
        </div>
        <footer className="tdc-copy">
          <p className="tdc-eyebrow">
            {arrival ? 'A NEW ROLE. THE SAME SEASON.' : 'THE END OF THIS CHAPTER'}
          </p>
          <h2 id={titleId}>{title}</h2>
          <p id={`${titleId}-description`}>{description}</p>
          {failed && <p role="alert">Your season could not be closed. Please try again.</p>}
          <button
            ref={primary}
            type="button"
            disabled={phase !== 'ready' || busy}
            onClick={() => void finish()}
          >
            {busy
              ? 'Finishing…'
              : arrival
                ? 'Continue season'
                : failed
                  ? 'Retry exit'
                  : 'Return home'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
