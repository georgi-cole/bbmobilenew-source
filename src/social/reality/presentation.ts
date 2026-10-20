const PLAYER_FACING_PHASE_LABELS: Readonly<Record<string, string>> = {
  social_1: 'Before nominations',
  social_2: 'Before the vote',
  live_vote: 'During the vote',
  eviction_results: 'After the elimination',
  loh_results: 'After the Leader competition',
  nomination_results: 'After nominations',
  pos_results: 'After the Safety competition',
}

export function formatPlayerFacingPhase(phase: string): string {
  return PLAYER_FACING_PHASE_LABELS[phase] ?? phase.replaceAll('_', ' ')
}
