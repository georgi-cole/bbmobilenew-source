import type { AppDispatch, RootState } from '../store/store'
import { replaceRealityDomain } from './socialSlice'
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
    seed: state.game.seed ?? 0,
    disabled: state.game.mode === 'survival',
    terminal: /final3|finale|season_end|complete|winner/.test(state.game.phase),
  }
}

/** Governance has no resource reward or energy barrier; only applied commands commit. */
export function executeAllianceManagementCommand(command: AllianceManagementCommand) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    const domain = normalizeRealityDomainState(state.social.reality)
    const result = manageAlliance(domain, command, allianceManagementContext(state))
    if (JSON.stringify(domain) !== JSON.stringify(state.social.reality))
      dispatch(replaceRealityDomain(domain))
    return result
  }
}
