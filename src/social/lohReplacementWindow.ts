/** The Safety save has happened, but the LOH has not named the backup nominee. */
export function isLohReplacementPending(game: {
  phase?: string | null
  replacementNeeded?: boolean
  aiReplacementStep?: number
}): boolean {
  return (
    game.phase === 'pos_ceremony_results' &&
    (game.replacementNeeded === true || (game.aiReplacementStep ?? 0) > 0)
  )
}
