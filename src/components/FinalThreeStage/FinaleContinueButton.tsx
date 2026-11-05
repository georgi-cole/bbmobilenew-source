import GameButton from '../GameButton/GameButton'
import './FinaleContinueButton.css'

export default function FinaleContinueButton({
  onContinue,
  ariaLabel = 'Continue',
}: {
  onContinue: () => void
  ariaLabel?: string
}) {
  return (
    <div className="finale-continue">
      <GameButton
        label="Continue"
        ariaLabel={ariaLabel}
        variant="primary_large"
        onClick={onContinue}
      />
    </div>
  )
}
