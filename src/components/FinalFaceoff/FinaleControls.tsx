interface Props {
  opening: boolean
  showOpeningCue: boolean
  isComplete: boolean
  onSkipAll: () => void
  onDismiss: () => void
  onPlay: () => void
}

export default function FinaleControls({
  opening,
  showOpeningCue,
  isComplete,
  onSkipAll,
  onDismiss,
  onPlay,
}: Props) {
  if (opening && !showOpeningCue) return null

  return (
    <div className="fo-controls">
      {opening ? (
        <button className="fo-btn" onClick={onPlay}>
          Begin Tribunal ▸
        </button>
      ) : isComplete ? (
        <button className="fo-btn" onClick={onDismiss}>
          Continue →
        </button>
      ) : (
        <button className="fo-btn fo-btn--secondary" onClick={onSkipAll}>
          Skip All ▶▶
        </button>
      )}
    </div>
  )
}
