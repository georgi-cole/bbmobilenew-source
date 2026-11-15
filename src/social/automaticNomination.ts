export interface AutomaticNominationGame {
  phase?: string
  publicModeEnabled?: boolean
  lastHohCompFinisherId?: string | null
  doubleEviction?: { weekActive?: boolean }
  nominationContext?: { autoNomineeId: string | null } | null
  missionPowers?: { automaticNomineeToId?: string }
  voxPopuli?: { status?: string } | null
}

/** Before the ceremony, the last-place nomination is already decided by the rules. */
export function getPendingAutomaticNomineeId(
  game: AutomaticNominationGame | undefined
): string | null {
  if (
    !game?.publicModeEnabled ||
    game.doubleEviction?.weekActive ||
    game.voxPopuli?.status === 'active' ||
    !['loh_results', 'social_1', 'nominations'].includes(game.phase ?? '')
  )
    return null
  return (
    game.missionPowers?.automaticNomineeToId ??
    game.nominationContext?.autoNomineeId ??
    game.lastHohCompFinisherId ??
    null
  )
}
