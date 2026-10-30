import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameHistoryEvent, Player } from '../../types'
import { useAppSelector } from '../../store/hooks'
import TribunalStageFigure from './TribunalStageFigure'
import { joinPublicAssetPath } from '../../utils/avatar'
import { recentTribunalMembers } from './recentTribunalMembers'
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio'
import './TribunalDecisionCinematic.css'

const ARRIVAL_DURATION_MS = 6400
const EXIT_DURATION_MS = 6200
const MUSIC_FADE_MS = 220
const ART_DEADLINE_MS = 1800

function dataSavingRequested() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  return (
    connection?.saveData === true || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  )
}

function CityLights() {
  return (
    <div className="tdc-city-lights" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}

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
  const [presentation, setPresentation] = useState<'film' | 'slate'>(() =>
    dataSavingRequested() ? 'slate' : 'film'
  )
  const [phase, setPhase] = useState<'preparing' | 'playing' | 'ready'>(
    presentation === 'slate' ? 'ready' : 'preparing'
  )
  const [settled, setSettled] = useState<string[]>([])
  const requiredArt = arrival
    ? ['backplate', 'city']
    : ['backplate', 'city', 'door-left', 'door-right', 'luggage']
  const artState = [...cast.map((member) => member.id), ...requiredArt].every((id) =>
    settled.includes(id)
  )
    ? 'resolved'
    : 'pending'
  function settle(id: string) {
    setSettled((current) => (current.includes(id) ? current : [...current, id]))
  }
  function showSlate() {
    setPresentation('slate')
    setPhase('ready')
  }
  function skipMotion() {
    if (artState === 'pending') setPresentation('slate')
    setPhase('ready')
  }
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const completing = useRef(false)
  const audioRef = useRef<CinematicAudioController | null>(null)
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
      plane.style.width = `${width}px`
      plane.style.height = `${height}px`
      const setWidth = arrival ? width : Math.max(width, height * 0.8)
      const setHeight = arrival ? height : setWidth * 1.25
      plane.style.setProperty('--tdc-set-width', `${setWidth}px`)
      plane.style.setProperty('--tdc-set-height', `${setHeight}px`)
      const exitStart = setWidth > 0 ? Math.min(0.678, 1 - width / setWidth / 2) : 0.678
      plane.style.setProperty('--tdc-exit-start-x', `${exitStart * -100}%`)
      const exitZoom =
        setWidth > 0 && setHeight > 0
          ? Math.max(1.9, (width * 0.9) / (setWidth * 0.249), height / (setHeight * 0.525))
          : 2.08
      plane.style.setProperty('--tdc-exit-zoom', String(exitZoom))
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
  }, [arrival, presentation])

  const playFilmCue = presentation === 'film' && phase !== 'preparing'
  useEffect(() => {
    if (!playFilmCue) return
    const audio = createCinematicAudio(
      joinPublicAssetPath('assets/sounds/cinematic/Twin_shock_presentation.mp4'),
      0.62,
      { loop: true }
    )
    audioRef.current = audio
    if ((window as Window & { _introhubMusicOn?: boolean })._introhubMusicOn !== false) audio.play()
    return () => {
      audio.dispose()
      audioRef.current = null
    }
  }, [playFilmCue])

  useEffect(() => {
    if (phase !== 'preparing') return
    const timer = window.setTimeout(
      () => {
        if (artState === 'resolved') {
          setPhase(reduced ? 'ready' : 'playing')
        } else {
          setPresentation('slate')
          setPhase('ready')
        }
      },
      artState === 'pending' ? ART_DEADLINE_MS : 0
    )
    return () => window.clearTimeout(timer)
  }, [artState, phase, reduced])

  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setTimeout(
      () => setPhase('ready'),
      reduced ? 0 : arrival ? ARRIVAL_DURATION_MS : EXIT_DURATION_MS
    )
    return () => window.clearTimeout(timer)
  }, [arrival, phase, reduced])

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
    if (audioRef.current) {
      audioRef.current.fadeOutAndStop(MUSIC_FADE_MS)
      await new Promise<void>((resolve) => window.setTimeout(resolve, MUSIC_FADE_MS))
    }
    if (!root.current?.isConnected) return
    try {
      if (await onComplete()) return
    } catch {
      // Keep the selected outcome available when durable storage needs a retry.
    }
    completing.current = false
    setBusy(false)
    setFailed(true)
  }

  const [headline, accent] = arrival ? ['Welcome to', 'sequester'] : ['One last', 'goodbye']
  const title = `${headline} ${accent}`
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
        data-presentation={presentation}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && phase !== 'ready') {
            event.preventDefault()
            skipMotion()
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
        {presentation === 'film' && (
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
              <div className="tdc-city-view" aria-hidden="true">
                <img
                  src={joinPublicAssetPath('assets/tribunal/phone-city-v8.webp')}
                  alt=""
                  onLoad={() => settle('city')}
                  onError={() => {
                    settle('city')
                    showSlate()
                  }}
                />
                <CityLights />
              </div>
              <div className="tdc-camera">
                <div className="tdc-set-content">
                  <div className="tdc-room" aria-hidden="true">
                    <img
                      className="tdc-backplate"
                      src={joinPublicAssetPath(
                        `assets/tribunal/${arrival ? 'sequester-room-v9' : 'farewell-window-v7'}.webp`
                      )}
                      alt=""
                      onLoad={() => settle('backplate')}
                      onError={(event) => {
                        settle('backplate')
                        event.currentTarget.style.visibility = 'hidden'
                        showSlate()
                      }}
                    />
                  </div>
                  <div className="tdc-window-glazing" aria-hidden="true">
                    <div className="tdc-glass" />
                    <span className="tdc-mullion tdc-mullion--left" />
                    <span className="tdc-mullion tdc-mullion--right" />
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
                              settle(`door-${side}`)
                              event.currentTarget.style.visibility = 'hidden'
                              showSlate()
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {arrival && <div className="tdc-near-frame" aria-hidden="true" />}
            </div>
          </div>
        )}
        {(presentation === 'slate' || phase === 'preparing') && (
          <div className="tdc-slate" aria-hidden="true" />
        )}
        {phase === 'preparing' && (
          <p className="tdc-loading-title" role="status">
            {arrival ? 'Your next chapter' : 'One last goodbye'}
          </p>
        )}
        <header className="tdc-header">
          <span>{arrival ? 'The Tribunal' : 'Leaving the Hub'}</span>
          <button
            type="button"
            aria-label="Skip animation"
            className="game-button game-button--ghost"
            onClick={skipMotion}
            disabled={phase === 'ready'}
          >
            Skip
          </button>
        </header>
        <footer className="tdc-copy">
          <p className="tdc-eyebrow">{arrival ? 'Your next chapter' : 'Season complete'}</p>
          <h2 id={titleId} aria-label={title}>
            {headline} <span>{accent}</span>
          </h2>
          <p id={`${titleId}-description`}>{description}</p>
          {failed && (
            <p role="alert">
              {arrival
                ? 'Your season could not continue. Please try again.'
                : 'Your season could not be closed. Please try again.'}
            </p>
          )}
          <button
            ref={primary}
            className="tdc-action game-button"
            type="button"
            disabled={phase !== 'ready' || busy}
            onClick={() => void finish()}
          >
            <span>
              {busy
                ? 'Finishing…'
                : failed
                  ? arrival
                    ? 'Try again'
                    : 'Retry exit'
                  : arrival
                    ? 'Continue season'
                    : 'Home'}
            </span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
