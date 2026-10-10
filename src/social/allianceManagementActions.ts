import type { AppDispatch, RootState } from '../store/store'
import { spendWeekendSocialResources } from '../store/gameSlice'
import {
  applyEnergyDelta,
  applyInfoDelta,
  applyInfluenceDelta,
  recordSocialAction,
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

/** The authoritative price for player-submitted alliance commitments. */
export function allianceProposalPrice(command: AllianceManagementCommand): {
  energy: number
  influence: number
  info: number
} | null {
  if (command.type !== 'PROPOSE') return null
  if (command.kind === 'PACT')
    return command.basePactId
      ? { energy: 1, influence: 0, info: 0 }
      : { energy: 2, influence: 0, info: 0 }
  if (command.kind === 'FOUND')
    return { energy: Math.max(3, command.memberIds?.length ?? 0), influence: 5, info: 0 }
  if (command.kind === 'ADMIT') return { energy: 1, influence: 5, info: 0 }
  return null
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

    const actor = state.game.players.find((player) => player.id === command.actorId)
    const proposalPrice = allianceProposalPrice(command)
    const isPaidProposal =
      actor?.isUser === true &&
      proposalPrice !== null &&
      command.type === 'PROPOSE' &&
      result.status === 'APPLIED' &&
      Boolean(result.requestId)
    if (isPaidProposal && proposalPrice && command.type === 'PROPOSE') {
      const price = {
        energy: proposalPrice.energy,
        influence: proposalPrice.influence,
        info: proposalPrice.info,
      }
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
      const spent = [
        price.energy ? `⚡${price.energy}` : null,
        price.influence ? `🤝${price.influence}` : null,
        price.info ? `💡${price.info}` : null,
      ]
        .filter(Boolean)
        .join(', ')
      result.reason = `${result.reason} Spent ${spent} to submit.`
      const displayedPriceChanged =
        costs !== undefined &&
        (costs.energy !== price.energy ||
          (costs.influence ?? 0) !== price.influence ||
          (costs.info ?? 0) !== price.info)
      if (displayedPriceChanged)
        result.reason = `${result.reason} The current proposal price is ${spent}.`

      const latest = getState()
      const balancesAfter = weekendWallet
        ? {
            energy: weekendWallet.energy - price.energy,
            influence: weekendWallet.influence - price.influence,
            info: weekendWallet.info - price.info,
          }
        : {
            energy: latest.social.energyBank[command.actorId] ?? 0,
            influence: latest.social.influenceBank[command.actorId] ?? 0,
            info: latest.social.infoBank[command.actorId] ?? 0,
          }
      const targetIds =
        command.kind === 'FOUND'
          ? (command.memberIds ?? []).filter((id) => id !== command.actorId)
          : command.candidateId
            ? [command.candidateId]
            : []
      dispatch(
        recordSocialAction({
          entry: {
            actionId:
              command.kind === 'FOUND'
                ? 'alliance_found'
                : command.kind === 'ADMIT'
                  ? 'alliance_admit'
                  : 'proposeAlliance',
            actorId: command.actorId,
            targetId: targetIds[0] ?? command.actorId,
            targetIds,
            cost: price.energy,
            costs: price,
            delta: 0,
            outcome: 'success',
            label: 'Submitted',
            newEnergy: balancesAfter.energy,
            balancesAfter,
            timestamp: Date.now(),
            week: latest.game.week,
            phase: latest.game.phase,
            source: 'manual',
            narrative: 'Alliance proposal was submitted and is awaiting approval.',
          },
        })
      )
    }

    if (JSON.stringify(domain) !== JSON.stringify(state.social.reality))
      dispatch(replaceRealityDomain(domain))
    return result
  }
}
