import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { TwinShockRevealAnimation } from '../../types'
import { preloadImages } from '../../utils/preload'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import tileStyles from '../HouseguestGrid/HouseguestGrid.module.css'
import './TwinShockRevealOverlay.css'

type TwinShockRevealOverlayProps = {
  active?: boolean
  reveal: TwinShockRevealAnimation
  getTile: (playerId: string) => HTMLElement | null
  onDone: () => void
}

const HOLD_MS = 650
const WIPE_MS = 1050
const SETTLE_MS = 220
const PORTRAIT_TIMEOUT_MS = 1400

function PortraitWipe({
  active,
  tile,
  reveal,
  onDone,
}: Pick<TwinShockRevealOverlayProps, 'reveal' | 'onDone'> & {
  active: boolean
  tile: HTMLElement
}) {
  const combined = reveal.type === 'combined'
  const name = combined ? reveal.fromName : reveal.replacedPlayerName
  const avatar = combined ? reveal.fromAvatar : reveal.replacedPlayerAvatar
  const [revealing, setRevealing] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)

  useEffect(() => {
    if (!active) return undefined
    // The live roster already has the final portrait, including any optimized
    // variant or fallback. Wait for that image before uncovering the tile.
    const liveAvatar = tile.querySelector<HTMLImageElement>('img[alt]:not([alt=""])')?.src
    const portraits = liveAvatar ? [avatar, liveAvatar] : [avatar]
    let cancelled = false
    let revealTimer: number | undefined
    let doneTimer: number | undefined
    void preloadImages(portraits, undefined, PORTRAIT_TIMEOUT_MS).then(() => {
      if (cancelled) return
      revealTimer = window.setTimeout(() => setRevealing(true), HOLD_MS)
      doneTimer = window.setTimeout(onDone, HOLD_MS + WIPE_MS + SETTLE_MS)
    })
    return () => {
      cancelled = true
      window.clearTimeout(revealTimer)
      window.clearTimeout(doneTimer)
    }
  }, [active, avatar, onDone, tile])

  return (
    <div
      className={`twin-shock-reveal twin-shock-reveal--${reveal.type}${revealing ? ' twin-shock-reveal--revealing' : ''}`}
      style={{ '--twin-shock-wipe-duration': `${WIPE_MS}ms` } as CSSProperties}
      role={active ? 'status' : undefined}
      aria-hidden={!active}
      aria-label={
        revealing ? (combined ? reveal.toName : reveal.incomingName) : 'Twin Shock reveal'
      }
      data-presentation-root="twin-shock-reveal"
    >
      <div className="twin-shock-reveal__outgoing" aria-hidden="true">
        {avatar && !avatarFailed ? (
          <img
            className="twin-shock-reveal__portrait"
            src={avatar}
            alt=""
            draggable={false}
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span className="twin-shock-reveal__fallback">{name.slice(0, 2).toUpperCase()}</span>
        )}
        <span className={tileStyles.nameOverlay}>{name}</span>
      </div>
      <span className="twin-shock-reveal__light" aria-hidden="true" />
    </div>
  )
}

export default function TwinShockRevealOverlay({
  active = true,
  reveal,
  getTile,
  onDone,
}: TwinShockRevealOverlayProps) {
  const reducedMotion = usePresentationReducedMotion()
  const targetId = reveal.type === 'combined' ? reveal.playerId : reveal.incomingPlayerId
  const { isOwner } = usePresentationOwner('twin-shock', PRESENTATION_PRIORITY.twinShock, active)
  const [tile, setTile] = useState<HTMLElement | null>(null)
  const [completed, setCompleted] = useState(false)
  const completedRef = useRef(false)

  const complete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setCompleted(true)
    onDone()
  }, [onDone])

  useLayoutEffect(() => {
    if (!isOwner || reducedMotion || completed) return undefined
    const frame = window.requestAnimationFrame(() => {
      const target = getTile(targetId)
      if (target) setTile(target)
      else if (active) complete()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, complete, completed, getTile, isOwner, reducedMotion, targetId])

  useEffect(() => {
    if (!isOwner || !active || !reducedMotion) return undefined
    const timer = window.setTimeout(complete, 0)
    return () => window.clearTimeout(timer)
  }, [active, complete, isOwner, reducedMotion])

  if (!isOwner || reducedMotion || completed || !tile) return null

  // Anchoring inside the roster frame keeps the wipe aligned as the layout moves.
  return createPortal(
    <PortraitWipe active={active} tile={tile} reveal={reveal} onDone={complete} />,
    tile
  )
}
