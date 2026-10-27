import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { joinPublicAssetPath } from '../utils/avatar'
import { getAppearanceAsset, SELECTABLE_LOOKS } from './catalog'
import { warmAppearanceRole } from './preloadAppearance'
import arrowLeft from './assets/arrow-left.svg'
import arrowRight from './assets/arrow-right.svg'
import './AppearanceCarousel.css'

interface AppearanceCarouselProps {
  selectedId: string
  onSelect: (lookId: string) => void
  onConfirm?: () => void
  confirmLabel?: string
}

function lookAt(index: number) {
  return SELECTABLE_LOOKS[(index + SELECTABLE_LOOKS.length) % SELECTABLE_LOOKS.length]
}

function figureUrl(lookId: string) {
  const look = SELECTABLE_LOOKS.find((candidate) => candidate.id === lookId)
  const asset =
    look && getAppearanceAsset({ kind: 'catalog', lookId, revision: look.revision }, 'casual')
  return asset ? joinPublicAssetPath(asset) : ''
}

export default function AppearanceCarousel({
  selectedId,
  onSelect,
  onConfirm,
  confirmLabel = 'Choose this look',
}: AppearanceCarouselProps) {
  const reducedMotion = useReducedMotion()
  const touchStartX = useRef<number | null>(null)
  const currentIndex = Math.max(
    0,
    SELECTABLE_LOOKS.findIndex((look) => look.id === selectedId)
  )
  const current = lookAt(currentIndex)
  const previous = lookAt(currentIndex - 1)
  const next = lookAt(currentIndex + 1)

  useEffect(() => {
    if (!current) return
    for (const look of [previous, current, next]) {
      if (look)
        void warmAppearanceRole(
          { kind: 'catalog', lookId: look.id, revision: look.revision },
          'casual'
        )
    }
  }, [current, next, previous])

  if (!current) return <p className="appearance-carousel__empty">No looks are available yet.</p>

  function move(offset: number) {
    const target = lookAt(currentIndex + offset)
    if (target) onSelect(target.id)
  }

  return (
    <div
      className="appearance-carousel"
      tabIndex={0}
      role="group"
      aria-label="Choose your character look"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return
        const delta =
          (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
        touchStartX.current = null
        if (Math.abs(delta) >= 45) move(delta < 0 ? 1 : -1)
      }}
    >
      <div
        className="appearance-carousel__stage"
        style={{
          backgroundImage: `url("${joinPublicAssetPath('assets/dressing-room/dressing-room-mobile.webp')}")`,
        }}
      >
        <motion.img
          key={current.id}
          className="appearance-carousel__figure"
          src={figureUrl(current.id)}
          alt={current.label}
          style={
            {
              '--appearance-center-offset': `${current.footCenterXPercent}%`,
              '--appearance-foot-bottom-offset': `${current.footBottomPercent * 0.86}%`,
            } as CSSProperties
          }
          initial={reducedMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.24 }}
          draggable={false}
        />
        <button
          type="button"
          className="appearance-carousel__arrow appearance-carousel__arrow--left"
          onClick={() => move(-1)}
          aria-label="Previous look"
        >
          <img className="appearance-carousel__arrow-icon" src={arrowLeft} alt="" />
        </button>
        <button
          type="button"
          className="appearance-carousel__arrow appearance-carousel__arrow--right"
          onClick={() => move(1)}
          aria-label="Next look"
        >
          <img className="appearance-carousel__arrow-icon" src={arrowRight} alt="" />
        </button>
      </div>
      <div className="appearance-carousel__caption" aria-live="polite">
        <strong>{current.label}</strong>
      </div>
      {onConfirm && (
        <button type="button" className="appearance-carousel__confirm" onClick={onConfirm}>
          {confirmLabel}
        </button>
      )}
    </div>
  )
}
