import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { usePresentationReducedMotion } from '../../services/presentation/usePresentationReducedMotion'
import { usePresentationTimeline } from '../../services/presentation/usePresentationTimeline'
import { createPortal } from 'react-dom'
import type { CeremonyTile } from '../CeremonyOverlay/CeremonyOverlay'
import {
  PRESENTATION_PRIORITY,
  usePresentationOwner,
  usePresentationForeground,
} from '../../services/presentation/presentationOwnership'
import rosterStyles from '../HouseguestGrid/HouseguestGrid.module.css'
import './WinnerTileLiftAnimation.css'

const MAX_CAPTURE_FRAMES = 24
const LIFT_DURATION_MS = 520
const RETURN_DURATION_MS = 560
const MIN_STAGE_TILE_SIZE = 112
const MAX_STAGE_TILE_SIZE = 184
const STAGE_GAP = 18

type LiftPhase = 'captured' | 'lifted' | 'awarded' | 'returning'

interface LiftTarget {
  id: string
  source: HTMLElement
  snapshot: HTMLElement
  sourceRect: DOMRect
  returnRect: DOMRect
  tile: CeremonyTile
  compact: boolean
}

const SOURCE_HIDE_PROPERTIES = [
  'visibility',
  'opacity',
  'content-visibility',
  'clip-path',
  '-webkit-clip-path',
  'pointer-events',
] as const

type SourceHideProperty = (typeof SOURCE_HIDE_PROPERTIES)[number]

interface InlineStyleValue {
  value: string
  priority: string
}

type LiftedSourceStyles = Record<SourceHideProperty, InlineStyleValue>

export interface WinnerTileLiftAnimationProps {
  targetIds: string[]
  tiles: CeremonyTile[]
  caption: string
  subtitle?: string
  ariaLabel?: string
  durationMs?: number
  resolveTarget: (playerId: string) => HTMLElement | null
  onDone: () => void
}

function hasTileDimensions(rect: DOMRect): boolean {
  // An undecoded/rebuilding portrait can temporarily expose only its border.
  // Treat that as unavailable rather than stretching a two-pixel snapshot.
  return rect.width >= 16 && rect.height >= 16
}

function isMeasurable(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected && hasTileDimensions(element.getBoundingClientRect()))
}

function stripDuplicateIds(root: HTMLElement) {
  root.removeAttribute('id')
  root.querySelectorAll<HTMLElement>('[id]').forEach((element) => element.removeAttribute('id'))
}

function captureLiftedSourceStyles(element: HTMLElement): LiftedSourceStyles {
  return Object.fromEntries(
    SOURCE_HIDE_PROPERTIES.map((property) => [
      property,
      {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      },
    ])
  ) as LiftedSourceStyles
}

function hideLiftedSource(element: HTMLElement) {
  // Mobile WebKit/Chromium can retain an independently composited avatar image
  // after a parent-only visibility change. Combine layout-preserving paint
  // suppression mechanisms and use !important so Framer Motion cannot replace
  // the hidden state while the source remains the live layout anchor.
  element.setAttribute('data-ceremony-tile-lifted', 'true')
  element.style.setProperty('visibility', 'hidden', 'important')
  element.style.setProperty('opacity', '0', 'important')
  element.style.setProperty('content-visibility', 'hidden', 'important')
  element.style.setProperty('clip-path', 'inset(50%)', 'important')
  element.style.setProperty('-webkit-clip-path', 'inset(50%)', 'important')
  element.style.setProperty('pointer-events', 'none', 'important')
}

function restoreLiftedSourceStyles(element: HTMLElement, styles: LiftedSourceStyles) {
  SOURCE_HIDE_PROPERTIES.forEach((property) => {
    const { value, priority } = styles[property]
    if (value) {
      element.style.setProperty(property, value, priority)
    } else {
      element.style.removeProperty(property)
    }
  })
  element.removeAttribute('data-ceremony-tile-lifted')
}

function measureLiftedSources(targets: LiftTarget[]): DOMRect[] {
  const visibility = targets.map(({ source }) => ({
    source,
    value: source.style.getPropertyValue('content-visibility'),
    priority: source.style.getPropertyPriority('content-visibility'),
  }))
  // Restore layout while the other paint-suppression properties stay active.
  // A hidden auto-sized anchor can otherwise collapse to its border height.
  visibility.forEach(({ source }) =>
    source.style.setProperty('content-visibility', 'visible', 'important')
  )
  try {
    return targets.map(({ source }) => source.getBoundingClientRect())
  } finally {
    visibility.forEach(({ source, value, priority }) => {
      if (value) source.style.setProperty('content-visibility', value, priority)
      else source.style.removeProperty('content-visibility')
    })
  }
}

function freezeVisualStyles(source: HTMLElement, clone: HTMLElement) {
  const computed = window.getComputedStyle(source)
  for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
    const property = computed.item(propertyIndex)
    if (property.startsWith('--')) {
      clone.style.setProperty(property, computed.getPropertyValue(property))
    }
  }

  ;[clone, ...clone.querySelectorAll<HTMLElement>('*')].forEach((cloneElement) => {
    cloneElement.style.animation = 'none'
    cloneElement.style.transition = 'none'
  })

  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.transform = 'none'
  clone.style.pointerEvents = 'none'
  stripDuplicateIds(clone)
}

function FrozenTile({ snapshot }: { snapshot: HTMLElement }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren(snapshot)
    return () => snapshot.remove()
  }, [snapshot])

  return <div ref={hostRef} className="winner-tile-lift__snapshot" aria-hidden="true" />
}

function getVisibleViewport() {
  const viewport = window.visualViewport
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  }
}

function calculateStageRects(targets: LiftTarget[], viewport = getVisibleViewport()): DOMRect[] {
  const availableWidth = Math.max(1, viewport.width - 32 - STAGE_GAP * (targets.length - 1))
  const maxPerTile = availableWidth / Math.max(1, targets.length)
  const largestSource = Math.max(...targets.map((target) => target.sourceRect.width))
  const size = Math.min(
    maxPerTile,
    MAX_STAGE_TILE_SIZE,
    Math.max(MIN_STAGE_TILE_SIZE, largestSource * 1.35)
  )
  const totalWidth = size * targets.length + STAGE_GAP * (targets.length - 1)
  const left = viewport.left + (viewport.width - totalWidth) / 2
  const top = viewport.top + Math.max(28, (viewport.height - size) * 0.34)

  return targets.map((_, index) => new DOMRect(left + index * (size + STAGE_GAP), top, size, size))
}

function rectStyle(rect: DOMRect): CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function transformBetweenRects(source: DOMRect, destination: DOMRect): string {
  if (source.width <= 0 || source.height <= 0) return 'none'
  const translateX = destination.left - source.left
  const translateY = destination.top - source.top
  const scaleX = destination.width / source.width
  const scaleY = destination.height / source.height
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
}

export default function WinnerTileLiftAnimation({
  targetIds,
  tiles,
  caption,
  subtitle,
  ariaLabel,
  durationMs = 2800,
  resolveTarget,
  onDone,
}: WinnerTileLiftAnimationProps) {
  const prefersReducedMotion = usePresentationReducedMotion()
  const { isOwner } = usePresentationOwner('winner-award', PRESENTATION_PRIORITY.winnerAward)
  const active = usePresentationForeground() && isOwner
  const [targets, setTargets] = useState<LiftTarget[]>([])
  const [phase, setPhase] = useState<LiftPhase>('captured')
  const [viewport, setViewport] = useState(getVisibleViewport)
  const targetsRef = useRef<LiftTarget[]>([])
  const originalStylesRef = useRef(new Map<HTMLElement, LiftedSourceStyles>())
  const finishedRef = useRef(false)
  const cancelTimelineRef = useRef<() => void>(() => {})

  const restoreOriginals = useCallback(() => {
    originalStylesRef.current.forEach((styles, element) => {
      restoreLiftedSourceStyles(element, styles)
    })
    originalStylesRef.current.clear()
  }, [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    cancelTimelineRef.current()
    restoreOriginals()
    onDone()
  }, [onDone, restoreOriginals])

  useLayoutEffect(() => {
    if (!active) return undefined
    if (targetsRef.current.length > 0) {
      // A covered/backgrounded award resumes its existing frozen tiles and
      // timeline. It does not clone them again or replay the landing badge.
      targetsRef.current.forEach(({ source }) => {
        originalStylesRef.current.set(source, captureLiftedSourceStyles(source))
        hideLiftedSource(source)
      })
      if (prefersReducedMotion) finish()
      return restoreOriginals
    }
    let frame = 0
    let raf = 0
    let cancelled = false

    const capture = () => {
      if (cancelled) return
      if (prefersReducedMotion || document.body.classList.contains('no-animations')) {
        finish()
        return
      }
      const elements = targetIds.map((targetId) => resolveTarget(targetId))
      if (elements.every(isMeasurable)) {
        const currentRects = elements.map((element) => element.getBoundingClientRect())
        const captured = elements.map((source, index) => {
          const sourceRect = currentRects[index]
          const snapshot = source.cloneNode(true) as HTMLElement
          freezeVisualStyles(source, snapshot)
          originalStylesRef.current.set(source, captureLiftedSourceStyles(source))
          return {
            id: targetIds[index],
            source,
            snapshot,
            sourceRect,
            returnRect: sourceRect,
            tile: tiles[index] ?? tiles[0] ?? { rect: sourceRect },
            compact: Boolean(source.closest(`.${rosterStyles.compact}`)),
          }
        })
        // Batch source paint suppression and force at most one style/layout
        // flush after all reads. Repeated per-tile reads here caused N flushes.
        captured.forEach(({ source }) => hideLiftedSource(source))
        void document.documentElement.offsetHeight
        targetsRef.current = captured
        setPhase('captured')
        setTargets(captured)
        return
      }

      frame += 1
      if (frame >= MAX_CAPTURE_FRAMES) {
        finish()
        return
      }
      raf = requestAnimationFrame(capture)
    }

    raf = requestAnimationFrame(capture)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      restoreOriginals()
    }
  }, [active, finish, prefersReducedMotion, resolveTarget, restoreOriginals, targetIds, tiles])

  useEffect(() => {
    if (!active || targets.length === 0) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [active, targets.length])

  useLayoutEffect(() => {
    if (!active || targets.length === 0) return undefined
    let frame = 0
    let cancelled = false
    const queueViewport = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (cancelled) return
        const next = getVisibleViewport()
        setViewport((current) =>
          current.left === next.left &&
          current.top === next.top &&
          current.width === next.width &&
          current.height === next.height
            ? current
            : next
        )
      })
    }
    const visualViewport = window.visualViewport
    window.addEventListener('resize', queueViewport, { passive: true })
    visualViewport?.addEventListener?.('resize', queueViewport, { passive: true })
    visualViewport?.addEventListener?.('scroll', queueViewport, { passive: true })
    queueViewport()
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', queueViewport)
      visualViewport?.removeEventListener?.('resize', queueViewport)
      visualViewport?.removeEventListener?.('scroll', queueViewport)
    }
  }, [active, targets.length])

  useEffect(() => {
    if (!active || targets.length === 0 || phase !== 'captured') return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPhase('lifted'))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [active, phase, targets.length])

  const cues = useMemo(() => {
    const returnAt = Math.max(LIFT_DURATION_MS + 650, durationMs - RETURN_DURATION_MS)
    return [
      { atMs: LIFT_DURATION_MS, run: () => setPhase('awarded') },
      {
        atMs: returnAt,
        run: () => {
          const rects = measureLiftedSources(targetsRef.current)
          const refreshed = targetsRef.current.map((target, index) => {
            const rect = rects[index]
            return {
              ...target,
              returnRect: hasTileDimensions(rect) ? rect : target.sourceRect,
            }
          })
          targetsRef.current = refreshed
          setTargets(refreshed)
          setPhase('returning')
        },
      },
      { atMs: returnAt + RETURN_DURATION_MS, run: finish },
    ]
  }, [durationMs, finish])
  const cancelTimeline = usePresentationTimeline(active && targets.length > 0, cues)
  useLayoutEffect(() => {
    cancelTimelineRef.current = cancelTimeline
  }, [cancelTimeline])

  const stageRects = useMemo(() => calculateStageRects(targets, viewport), [targets, viewport])

  if (targets.length === 0 || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`winner-tile-lift winner-tile-lift--${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={ariaLabel ?? caption}
      data-winner-tile-lift-phase={phase}
      data-presentation-root="winner-tile-lift"
      data-presentation-suspended={!active || undefined}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
    >
      <div className="winner-tile-lift__backdrop" aria-hidden="true" />
      {targets.map((target, index) => {
        const destination =
          phase === 'captured'
            ? target.sourceRect
            : phase === 'returning'
              ? target.returnRect
              : stageRects[index]
        const tileStyle: CSSProperties = {
          ...rectStyle(target.sourceRect),
          transform: transformBetweenRects(target.sourceRect, destination),
        }
        const badgeActive = phase === 'awarded' || phase === 'returning'
        return (
          <div
            key={target.id}
            className="winner-tile-lift__tile"
            style={tileStyle}
            data-winner-tile-id={target.id}
            data-winner-target-left={destination.left}
            data-winner-target-top={destination.top}
            data-winner-target-width={destination.width}
            data-winner-target-height={destination.height}
          >
            <FrozenTile snapshot={target.snapshot} />
            <div className="winner-tile-lift__glow" aria-hidden="true" />
            {(target.tile.badgeImageSrc || target.tile.badge) && (
              <div
                className={`${rosterStyles.badgeStack} winner-tile-lift__badge-stack ${
                  target.compact ? rosterStyles.compact : ''
                }`}
                role="list"
              >
                <span
                  className={[
                    rosterStyles.statusBadge,
                    target.tile.badgeCode
                      ? (rosterStyles[`badge_${target.tile.badgeCode}`] ?? '')
                      : '',
                    target.tile.badgeVariant === 'cupid-kiss' ? rosterStyles.cupidPermanentLoh : '',
                    target.tile.badgeVariant === 'cupid-hug' ? rosterStyles.cupidPermanentPos : '',
                    'winner-tile-lift__badge',
                    badgeActive ? 'winner-tile-lift__badge--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="listitem"
                  aria-label={target.tile.badgeLabel ?? `${target.tile.badge ?? 'Role'} badge`}
                >
                  {target.tile.badgeImageSrc ? (
                    <img
                      className={`${rosterStyles.statusBadgeImage} ceremony-overlay__badge-image`}
                      src={target.tile.badgeImageSrc}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    target.tile.badge
                  )}
                </span>
              </div>
            )}
          </div>
        )
      })}
      <div className="winner-tile-lift__caption" aria-hidden="true">
        <p>{caption}</p>
        {subtitle && <span>{subtitle}</span>}
      </div>
    </div>,
    document.body
  )
}
