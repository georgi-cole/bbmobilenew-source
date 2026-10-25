import { type CSSProperties, type ReactNode, useState } from 'react'
import type { HolidayThemeKey } from '../../utils/skinAssets'
import HolidayButtonArtwork from './HolidayButtonArtwork'
import './GameButton.css'

export type GameButtonVariant =
  | 'primary_large'
  | 'secondary_medium'
  | 'secondary_wide'
  | 'secondary_small'

type GameButtonState = 'normal' | 'hover' | 'pressed' | 'disabled'

interface GameButtonProps {
  label: string
  icon?: ReactNode
  badge?: ReactNode
  variant: GameButtonVariant
  disabled?: boolean
  className?: string
  holidayTheme?: HolidayThemeKey | null
  onClick?: () => void
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function resolveAsset(variant: GameButtonVariant, state: GameButtonState): string {
  return `${BASE}/assets/buttons/${variant}_${state}.svg`
}

export default function GameButton({
  label,
  icon,
  badge,
  variant,
  disabled = false,
  className = '',
  holidayTheme = null,
  onClick,
}: GameButtonProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  // Temporarily keep Surprise Me out of the UI without changing season-selection logic.
  if (label === 'Surprise Me') return null

  const state: GameButtonState = disabled
    ? 'disabled'
    : isPressed
      ? 'pressed'
      : isHovered
        ? 'hover'
        : 'normal'

  const src = resolveAsset(variant, state)
  const holidayClassName = holidayTheme ? ` game-btn--holiday-${holidayTheme}` : ''
  const showHolidayArtwork = Boolean(holidayTheme && variant === 'primary_large')

  return (
    <button
      className={`game-btn game-btn--${variant}${holidayTheme ? ' game-btn--holiday' : ''}${holidayClassName}${disabled ? ' game-btn--disabled' : ''}${badge ? ' game-btn--has-badge' : ''}${!disabled && isPressed ? ' game-btn--pressed' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--button-mask': `url("${src}")` } as CSSProperties}
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => {
        if (!disabled) setIsHovered(true)
      }}
      onMouseLeave={() => {
        setIsHovered(false)
        setIsPressed(false)
      }}
      onMouseDown={() => {
        if (!disabled) setIsPressed(true)
      }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => {
        if (!disabled) setIsPressed(true)
      }}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      onBlur={() => {
        setIsHovered(false)
        setIsPressed(false)
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) setIsPressed(true)
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setIsPressed(false)
      }}
    >
      {!showHolidayArtwork && (
        <img className="btn-bg" src={src} alt="" aria-hidden="true" draggable={false} />
      )}
      <div className="btn-content">
        {icon && (
          <span className="btn-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="btn-label">{label}</span>
      </div>
      {showHolidayArtwork && holidayTheme && <HolidayButtonArtwork theme={holidayTheme} />}
      {badge && (
        <span className="btn-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  )
}
