import { forwardRef } from 'react'
import './CinematicSkipButton.css'

interface CinematicSkipButtonProps {
  ariaLabel: string
  onClick: () => void
  label?: string
  indicator?: 'close' | 'forward'
}

const CinematicSkipButton = forwardRef<HTMLButtonElement, CinematicSkipButtonProps>(
  function CinematicSkipButton({ ariaLabel, onClick, label = 'Skip', indicator = 'close' }, ref) {
    return (
      <button
        ref={ref}
        className="cinematic-skip-button"
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {label} <span aria-hidden="true">{indicator === 'forward' ? '→' : '×'}</span>
      </button>
    )
  }
)

export default CinematicSkipButton
