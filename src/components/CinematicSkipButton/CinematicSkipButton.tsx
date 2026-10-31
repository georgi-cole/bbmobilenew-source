import { forwardRef } from 'react'
import './CinematicSkipButton.css'

interface CinematicSkipButtonProps {
  ariaLabel: string
  onClick: () => void
  label?: string
}

const CinematicSkipButton = forwardRef<HTMLButtonElement, CinematicSkipButtonProps>(
  function CinematicSkipButton({ ariaLabel, onClick, label = 'Skip' }, ref) {
    return (
      <button
        ref={ref}
        className="cinematic-skip-button"
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {label} <span aria-hidden="true">×</span>
      </button>
    )
  }
)

export default CinematicSkipButton
