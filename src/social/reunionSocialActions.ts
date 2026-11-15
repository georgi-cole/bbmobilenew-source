import { spendWeekendSocialResources } from '../store/gameSlice'
import type { AppDispatch, RootState } from '../store/store'

export const REUNION_ACTION_IDS = ['compliment', 'apologize'] as const

export function getReunionActionCosts(actionId: string | null) {
  if (actionId !== 'compliment' && actionId !== 'apologize') return null
  return { energy: actionId === 'compliment' ? 1 : 2, influence: 0, info: 0 }
}

/** Returning guests use the reunion wallet, with the same price in the cards and execution. */
export function performReunionSocialAction(targetId: string, actionId: string) {
  return (dispatch: AppDispatch, getState: () => RootState): boolean => {
    const game = getState().game
    const weekend = game.weekendInterlude
    const human = game.players.find((player) => player.isUser)
    const guest = game.players.find((player) => player.id === targetId)
    const costs = getReunionActionCosts(actionId)
    if (
      !costs ||
      !human ||
      human.status === 'evicted' ||
      human.status === 'jury' ||
      !guest ||
      guest.isUser ||
      !['evicted', 'jury'].includes(guest.status) ||
      !weekend?.active ||
      !weekend.finaleWeekend ||
      weekend.weekendDay !== 2 ||
      weekend.stage !== 'finale_reunion_social' ||
      weekend.reunionDepartureActive ||
      weekend.reunionDeparted ||
      weekend.wallet.energy < costs.energy
    )
      return false
    dispatch(spendWeekendSocialResources(costs))
    return true
  }
}
