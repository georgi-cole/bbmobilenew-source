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
import type { SocialActionReceipt } from './types'

export function allianceManagementContext(
  state: Pick<RootState, 'game'>
): AllianceManagementContext {
  return {
    at: { day: state.game.week, phase: state.game.phase },
    activeActorIds: state.game.players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id),
    humanActorIds: state.game.players.filter((player) => player.isUser).map((player) => player.id),
    atRiskActorIds: [...(state.game.nomineeIds ?? [])],
    juryActorIds: state.game.players
      .filter((player) => player.status === 'jury')
      .map((player) => player.id),
    competitionThreatByActorId: Object.fromEntries(
      state.game.players.map((player) => {
        const observed = state.game.competitionSeasonStateByPlayerId?.[player.id]
        const samples = Math.max(0, observed?.performanceSamples ?? 0)
        const observedStrength = observed?.observedStrength ?? 50
        const observedResults =
          samples > 0
            ? Math.min(2.2, Math.max(0, observedStrength - 50) * 0.055 + samples * 0.18)
            : 0
        const publicWins = Math.min(
          1.8,
          ((player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)) * 0.55
        )
        return [player.id, observedResults + publicWins]
      })
    ),
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

function allianceProposalReceipt(
  domain: RootState['social']['reality'],
  requestId: string | undefined,
  state: RootState
): string {
  const request = requestId ? domain.allianceManagement.requests[requestId] : undefined
  if (!request) return 'Alliance proposal submitted. Track its decision in Hub Wire.'

  const playerName = (id: string | undefined) =>
    id ? (state.game.players.find((player) => player.id === id)?.name ?? id) : 'the invitee'
  const allianceName = request.allianceId
    ? (domain.alliances[request.allianceId]?.name ?? request.name ?? 'the alliance')
    : (request.name ?? 'the alliance')
  const yesVotes = request.electorateIds.filter((id) => request.votes[id] === true).length
  const currentVotes = request.electorateIds
    .map((id) => {
      const name =
        id === state.game.players.find((player) => player.isUser)?.id ? 'You' : playerName(id)
      const vote = request.votes[id]
      return `${name} ${vote === true ? 'yes' : vote === false ? 'no' : 'not voted'}`
    })
    .join('; ')
  const voteSummary =
    request.voteSummary ??
    `Votes so far: ${currentVotes}. ${yesVotes} of ${request.electorateIds.length} members have voted yes. A majority passes; the leader breaks a tie. An unanswered vote counts against approval when the window closes.`

  if (request.kind === 'ADMIT') {
    const candidate = playerName(request.candidateId)
    if (request.status === 'VOTING')
      return `${allianceName} is voting on inviting ${candidate}. ${voteSummary} If approved, ${candidate} gets a separate invitation.`
    if (request.status === 'CONSENT')
      return `${voteSummary} ${candidate} still needs to accept the invitation in Incoming.`
    if (request.status === 'ACCEPTED')
      return `${voteSummary} ${request.reason ?? `${candidate} joined ${allianceName}.`}`
    return `${voteSummary} ${request.reason ?? `The invitation decision for ${candidate} ended: ${request.status}.`}`
  }

  if (request.status === 'ACCEPTED') return request.reason ?? 'The alliance agreement is active.'
  if (request.status === 'CONSENT')
    return `${allianceName} is waiting for the required members to agree. Follow the result in Hub Wire.`
  if (request.status === 'VOTING')
    return `${allianceName} is voting on your proposal. Follow the result in Hub Wire.`
  return request.reason ?? 'Alliance proposal submitted. Track its decision in Hub Wire.'
}

function allianceProposalOutcome(
  request: RootState['social']['reality']['allianceManagement']['requests'][string] | undefined
): Pick<SocialActionReceipt, 'outcomeLabel' | 'tone'> {
  if (!request || request.status === 'VOTING' || request.status === 'CONSENT')
    return { outcomeLabel: 'Pending approval', tone: 'neutral' }
  if (request.status === 'DECLINED') return { outcomeLabel: 'Declined', tone: 'negative' }
  if (request.status !== 'ACCEPTED') return { outcomeLabel: 'Ended', tone: 'neutral' }
  const responses = Object.values(request.responsesByActorId ?? {})
  return {
    outcomeLabel: responses.some((response) => response.style === 'LIMITED')
      ? 'Accepted with limits'
      : responses.some((response) => response.style === 'HESITANT')
        ? 'Accepted cautiously'
        : 'Accepted',
    tone: 'positive',
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
            narrative: allianceProposalReceipt(domain, result.requestId, latest),
            receipt: {
              summary: allianceProposalReceipt(domain, result.requestId, latest),
              ...allianceProposalOutcome(
                result.requestId ? domain.allianceManagement.requests[result.requestId] : undefined
              ),
            },
          },
        })
      )
      result.receiptRecorded = true
    }

    if (JSON.stringify(domain) !== JSON.stringify(state.social.reality))
      dispatch(replaceRealityDomain(domain))
    return result
  }
}
