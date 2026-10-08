import type { AppDispatch, RootState } from '../store/store'
import { spendWeekendSocialResources } from '../store/gameSlice'
import {
  applyEnergyDelta,
  applyInfoDelta,
  applyInfluenceDelta,
  replaceRealityDomain,
} from './socialSlice'
import {
  manageAlliance,
  type AllianceManagementCommand,
  type AllianceManagementContext,
} from './reality/allianceManagement'
import { normalizeRealityDomainState } from './reality/state'

export function allianceManagementContext(
  state: Pick<RootState, 'game'>
): AllianceManagementContext {
  return {
    at: { day: state.game.week, phase: state.game.phase },
    activeActorIds: state.game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id),
    humanActorIds: state.game.players.filter((player) => player.isUser).map((player) => player.id),
    displayNames: Object.fromEntries(state.game.players.map((player) => [player.id, player.name])),
    viewerActorId: state.game.players.find((player) => player.isUser)?.id,
    seed: state.game.seed ?? 0,
    disabled: state.game.mode === 'survival',
    terminal: /final3|finale|season_end|complete|winner/.test(state.game.phase),
  }
}

/** Charge only a newly submitted player proposal; decisions and exits remain free. */
export function executeAllianceManagementCommand(
  command: AllianceManagementCommand,
  costs?: { energy: number; influence?: number; info?: number }
) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    const domain = normalizeRealityDomainState(state.social.reality)
    const result = manageAlliance(domain, command, allianceManagementContext(state))

    const proposalKind = command.type === 'PROPOSE' ? command.kind : undefined
    const isPaidProposal =
      costs !== undefined &&
      command.type === 'PROPOSE' &&
      ['PACT', 'FOUND', 'ADMIT'].includes(proposalKind ?? '') &&
      result.status === 'APPLIED' &&
      Boolean(result.requestId)
    if (isPaidProposal && costs && command.type === 'PROPOSE') {
      const price = {
        energy: Math.max(0, costs.energy),
        influence: Math.max(0, costs.influence ?? 0),
        info: Math.max(0, costs.info ?? 0),
      }
      const actor = state.game.players.find((player) => player.id === command.actorId)
      const weekendWallet =
        state.game.weekendInterlude?.active && actor?.isUser
          ? state.game.weekendInterlude.wallet
          : undefined
      const balances = weekendWallet ?? {
        energy: state.social.energyBank[command.actorId] ?? 0,
        influence: state.social.influenceBank[command.actorId] ?? 0,
        info: state.social.infoBank[command.actorId] ?? 0,
      }
      const shortfalls = [
        balances.energy < price.energy ? `⚡${price.energy}` : null,
        balances.influence < price.influence ? `🤝${price.influence}` : null,
        balances.info < price.info ? `💡${price.info}` : null,
      ].filter(Boolean)
      if (shortfalls.length > 0) {
        return {
          ...result,
          status: 'REJECTED' as const,
          reason: `Insufficient resources — this proposal needs ${shortfalls.join(', ')}; nothing was spent.`,
        }
      }
      if (weekendWallet) dispatch(spendWeekendSocialResources(price))
      else {
        if (price.energy)
          dispatch(applyEnergyDelta({ playerId: command.actorId, delta: -price.energy }))
        if (price.influence)
          dispatch(applyInfluenceDelta({ playerId: command.actorId, delta: -price.influence }))
        if (price.info) dispatch(applyInfoDelta({ playerId: command.actorId, delta: -price.info }))
      }
      result.reason = `${result.reason} Spent ⚡${price.energy} to submit.`
    }

    if (JSON.stringify(domain) !== JSON.stringify(state.social.reality))
      dispatch(replaceRealityDomain(domain))
    return result
  }
}
