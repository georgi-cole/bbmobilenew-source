import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TwinShockRevealAnimation } from '../../types'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
} from '../../services/presentation/presentationOwnership'
import './TwinShockRevealOverlay.css'

type TwinShockRevealOverlayProps = {
  reveal: TwinShockRevealAnimation
  getTileRect: (playerId: string) => DOMRect | null
  onDone: () => void
}

type RevealStage = 'intro' | 'transform' | 'settled' | 'done'

function getTileElement(playerId: string): HTMLElement | null {
  const tiles = document.querySelectorAll<HTMLElement>('[data-player-id]')
  return Array.from(tiles).find((tile) => tile.dataset.playerId === playerId) ?? null
}

export default function TwinShockRevealOverlay({
  reveal,
  getTileRect,
  onDone,
}: TwinShockRevealOverlayProps) {
  const reducedMotion = usePresentationReducedMotion()
  const targetId = reveal.type === 'combined' ? reveal.playerId : reveal.incomingPlayerId
  const { isOwner } = usePresentationOwner('twin-shock', PRESENTATION_PRIORITY.twinShock)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [stage, setStage] = useState<RevealStage>('intro')
  const completedRef = useRef(false)

  const complete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onDone()
  }, [onDone])

  useLayoutEffect(() => {
    if (!isOwner || reducedMotion) return undefined
    let doneFallbackId: number | null = null
    const frameId = window.requestAnimationFrame(() => {
      const measured = getTileRect(targetId)
      if (!measured) {
        doneFallbackId = window.setTimeout(complete, 100)
        return
      }
      setRect(measured)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      if (doneFallbackId !== null) window.clearTimeout(doneFallbackId)
    }
  }, [complete, getTileRect, isOwner, reducedMotion, targetId])

  useLayoutEffect(() => {
    if (!isOwner || reducedMotion) return undefined
    const tile = getTileElement(targetId)
    if (!tile) return undefined

    const previousOpacity = tile.style.opacity
    const previousVisibility = tile.style.visibility
    const previousTransition = tile.style.transition
    tile.style.opacity = '0'
    tile.style.visibility = 'hidden'

    return () => {
      tile.style.opacity = previousOpacity
      tile.style.visibility = previousVisibility
      tile.style.transition = previousTransition
    }
  }, [isOwner, reducedMotion, targetId])

  useEffect(() => {
    if (!isOwner || stage !== 'settled') return
    const tile = getTileElement(targetId)
    if (!tile) return

    tile.style.transition = 'opacity 420ms ease'
    tile.style.visibility = 'visible'
    tile.style.opacity = '1'
  }, [isOwner, stage, targetId])

  const timings = useMemo(
    () =>
      reveal.type === 'ali_enters'
        ? { transformAt: 2100, settledAt: 3900, doneAt: 4650 }
        : { transformAt: 1850, settledAt: 3450, doneAt: 4200 },
    [reveal.type]
  )

  useEffect(() => {
    if (!isOwner) return undefined
    if (reducedMotion) {
      const immediate = window.setTimeout(complete, 0)
      return () => window.clearTimeout(immediate)
    }
    if (!rect) return undefined
    const transformId = window.setTimeout(() => setStage('transform'), timings.transformAt)
    const settledId = window.setTimeout(() => setStage('settled'), timings.settledAt)
    const doneId = window.setTimeout(() => {
      setStage('done')
      complete()
    }, timings.doneAt)
    return () => {
      window.clearTimeout(transformId)
      window.clearTimeout(settledId)
      window.clearTimeout(doneId)
    }
  }, [complete, isOwner, rect, reducedMotion, timings])

  const display = useMemo(() => {
    if (reveal.type === 'combined') {
      return {
        beforeName: reveal.fromName,
        beforeAvatar: reveal.fromAvatar,
        afterName: reveal.toName,
        afterAvatar: reveal.toAvatar,
        ariaLabel: 'Twin Shock revealed',
      }
    }
    return {
      beforeName: reveal.replacedPlayerName,
      beforeAvatar: reveal.replacedPlayerAvatar,
      afterName: reveal.incomingName,
      afterAvatar: reveal.incomingAvatar,
      ariaLabel: 'New hubmate revealed',
    }
  }, [reveal])

  const showingIncomingAvatar = stage !== 'intro'
  const visibleAvatar = showingIncomingAvatar ? display.afterAvatar : display.beforeAvatar
  const visibleName = showingIncomingAvatar ? display.afterName : display.beforeName

  if (!isOwner || reducedMotion || !rect || stage === 'done') return null

  const style = {
    '--twin-shock-left': `${rect.left}px`,
    '--twin-shock-top': `${rect.top}px`,
    '--twin-shock-width': `${rect.width}px`,
    '--twin-shock-height': `${rect.height}px`,
  } as CSSProperties

  return (
    <div
      className={`twin-shock-reveal twin-shock-reveal--${reveal.type} twin-shock-reveal--${stage}`}
      style={style}
      role="status"
      aria-live="assertive"
      aria-label={display.ariaLabel}
      data-presentation-root="twin-shock-reveal"
    >
      <div className="twin-shock-reveal__shade" />
      <div className="twin-shock-reveal__flare" />
      <div className="twin-shock-reveal__beam" />
      <div className="twin-shock-reveal__tile">
        <div className="twin-shock-reveal__avatar-wrap">
          {visibleAvatar ? (
            <img
              key={`${showingIncomingAvatar ? 'after' : 'before'}-${visibleAvatar}`}
              className={`twin-shock-reveal__avatar twin-shock-reveal__avatar--${showingIncomingAvatar ? 'after' : 'before'}`}
              src={visibleAvatar}
              alt=""
              draggable={false}
            />
          ) : (
            <span
              className={`twin-shock-reveal__avatar-fallback twin-shock-reveal__avatar-fallback--${showingIncomingAvatar ? 'after' : 'before'}`}
            >
              {visibleName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
