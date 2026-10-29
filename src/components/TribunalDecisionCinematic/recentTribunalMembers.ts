import type { GameHistoryEvent, Player } from '../../types'

/** Latest departures before this arrival, including same-day double eliminations. */
export function recentTribunalMembers(
  player: Player,
  members: readonly Player[],
  history: readonly GameHistoryEvent[]
): Player[] {
  const latestExit = new Map<string, number>()
  history.forEach((event, index) => {
    if (event.type === 'seasonExit' && typeof event.data.playerId === 'string') {
      latestExit.set(event.data.playerId, index)
    }
  })
  const arrivalIndex = latestExit.get(player.id)
  const compare = (left: Player, right: Player) => {
    const leftExit = latestExit.get(left.id)
    const rightExit = latestExit.get(right.id)
    if (leftExit != null && rightExit != null) return rightExit - leftExit
    if (left.seasonPlacement != null && right.seasonPlacement != null) {
      return left.seasonPlacement - right.seasonPlacement
    }
    return (right.evictedAtWeek ?? -1) - (left.evictedAtWeek ?? -1)
  }
  const ordered = members
    .filter((member) => {
      if (member.id === player.id || member.status !== 'jury') return false
      const exitIndex = latestExit.get(member.id)
      if (arrivalIndex != null && exitIndex != null) return exitIndex < arrivalIndex
      if (player.seasonPlacement != null && member.seasonPlacement != null) {
        return member.seasonPlacement > player.seasonPlacement
      }
      if (player.evictedAtWeek != null && member.evictedAtWeek != null) {
        return member.evictedAtWeek < player.evictedAtWeek
      }
      return exitIndex != null && arrivalIndex == null
    })
    .sort(compare)
  const selected = ordered.slice(0, 2)
  // Old saves can lack within-week order. Do not pick an arbitrary subset of
  // a tied group straddling the two-person cutoff.
  if (ordered.length > 2 && compare(ordered[1], ordered[2]) === 0) {
    return selected.filter((member) => compare(member, ordered[2]) !== 0)
  }
  return selected
}
