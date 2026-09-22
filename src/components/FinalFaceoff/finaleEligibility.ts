import type { Player } from '../../types'
import { getTribunalMembers, isTribunalEligiblePlayer } from '../../rules/tribunalPolicy'

export { isTribunalEligiblePlayer }

export function splitFinalePlayers(players: Player[]): {
  finalists: Player[]
  jurors: Player[]
  preJury: Player[]
} {
  return {
    finalists: players.filter((player) => player.status !== 'evicted' && player.status !== 'jury'),
    jurors: getTribunalMembers(players),
    // Kept for archive/debug consumers only. Finale composition must never
    // promote this group into the Tribunal.
    preJury: players.filter(
      (player) => player.status === 'evicted' && isTribunalEligiblePlayer(player)
    ),
  }
}
