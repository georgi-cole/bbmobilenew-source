import type { RootState } from '../store/store'
import { canCastClassicEvictionVote } from '../store/criticalGameRules'
import type { Player } from '../types'
import { hasPresentationEventClaim } from '../broadcasting/fauxTvPresentation'
import { isCurrentIncomingConversation } from './incomingDecisions'
import { isIncomingIntelLead } from './incomingIntelLead'
import { getRuntimeSocialActionById } from './socialActionManager'
import { validateSocialExecution } from './socialExecutionGuard'
import { getEffectiveSocialMode } from './socialMode'
import {
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
} from './socialModuleAvailability'
import { normalizeActionCosts } from './smExecNormalize'
import type { IncomingInteraction, SocialPanelFocus } from './types'

export type SocialOpportunity =
  | { kind: 'incoming'; interactionId: string; label: string }
  | ({ kind: 'social'; label: string } & SocialPanelFocus)

export function getSocialTipClaim(game: RootState['game'], kind: SocialOpportunity['kind']) {
  const topic =
    kind === 'incoming'
      ? 'incoming'
      : game.phase === 'social_1'
        ? 'nominations'
        : game.phase === 'pos_results'
          ? 'safety'
          : 'vote'
  return { gameId: game.gameId, runId: 'tutorial', eventId: `social-tip:${topic}` }
}

function conversationLead(interaction: IncomingInteraction, name: string): string | null {
  if (interaction.payload?.source === 'broken_promise')
    return `${name} wants to talk about your promise.`
  if (isIncomingIntelLead(interaction)) return `${name} has something to tell you in private.`
  switch (interaction.payload?.scenarioKey) {
    case 'direct_vote_pitch':
    case 'live_vote_pitch':
    case 'alliance_vote_pitch':
    case 'nominee_campaign':
    case 'post_veto_campaign':
    case 'tie_break_campaign':
      return `${name} wants your read on the vote.`
    case 'vote_rally_warning':
      return `${name} wants to talk about your place on the block.`
    case 'direct_nomination_pitch':
    case 'nomination_advice_inquiry':
    case 'loh_target_inquiry':
    case 'nominee_hoh_plea':
      return `${name} wants to talk before nominations.`
    case 'nominee_veto_pitch':
    case 'safety_holder_consults_loh':
    case 'loh_consults_safety_holder':
    case 'protection_deal_future_vote':
      return `${name} wants to talk about Safety.`
    case 'direct_replacement_pitch':
      return `${name} has a suggestion for the replacement.`
    case 'betrayal_warning':
      return `${name} wants to warn you about a Hubmate.`
    default:
      return null
  }
}

function hasUsedOpportunityAction(
  state: RootState,
  humanId: string,
  targetId: string,
  actionIds: readonly string[]
): boolean {
  const { game, social } = state
  return Boolean(
    social.actionHistory?.some(
      (entry) =>
        entry.actorId === humanId &&
        entry.week === game.week &&
        entry.phase === game.phase &&
        actionIds.includes(entry.actionId) &&
        (entry.targetId === targetId || entry.targetIds?.includes(targetId))
    )
  )
}

function outgoingOpportunity(
  state: RootState,
  human: Player,
  label: string,
  focus: SocialPanelFocus
): SocialOpportunity | null {
  const { targetId, actionId, subjectId } = focus
  const action = getRuntimeSocialActionById(actionId)
  const { social } = state
  const drama = getEffectiveSocialMode(state) === 'drama'
  if (
    !action ||
    !validateSocialExecution(state, {
      action,
      actorId: human.id,
      targetIds: [targetId],
      subjectId,
      requireCompleteSelection: true,
    }).eligible ||
    hasUsedOpportunityAction(state, human.id, targetId, [actionId])
  ) {
    return null
  }
  const cost = normalizeActionCosts(action, 1, drama)
  if (
    (social.energyBank[human.id] ?? 0) < cost.energy ||
    (social.influenceBank[human.id] ?? 0) < cost.influence ||
    (social.infoBank[human.id] ?? 0) < cost.info
  ) {
    return null
  }
  return { kind: 'social', label, ...focus }
}

/** Surface one live conversation or playable move, using roles the player has already seen. */
export function selectSocialOpportunity(
  state: RootState,
  visibleTipKind?: SocialOpportunity['kind']
): SocialOpportunity | null {
  const { game, social } = state
  if (
    game.seasonFinale ||
    (game.voteResults && !game.awaitingTieBreak) ||
    game.evictionOverlayPlayerId
  ) {
    return null
  }
  if (!getIncomingSocialModuleAvailability(game).canOpen) return null
  if (
    game.weekendInterlude?.active ||
    !['social_1', 'pos_results', 'social_2'].includes(game.phase)
  ) {
    return null
  }

  const human = game.players.find((player) => player.isUser)
  if (!human || !getSocialModuleAvailability(game).canOpen) return null
  const active = game.players.filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
  const canShowTip = (kind: SocialOpportunity['kind']) =>
    visibleTipKind
      ? visibleTipKind === kind
      : !hasPresentationEventClaim(game.presentationEventClaims, getSocialTipClaim(game, kind))
  if (canShowTip('incoming')) {
    for (const interaction of social.incomingInteractions) {
      if (interaction.read || !isCurrentIncomingConversation(state, interaction)) continue
      const sender = active.find((player) => player.id === interaction.fromId)
      const label = sender ? conversationLead(interaction, sender.name) : null
      if (label) return { kind: 'incoming', label, interactionId: interaction.id }
    }
  }
  if (!canShowTip('social')) return null

  const drama = getEffectiveSocialMode(state) === 'drama'
  const vox = game.voxPopuli?.status === 'active'
  if (game.phase === 'social_1' || game.phase === 'pos_results') {
    const beforeNominations = game.phase === 'social_1'
    if (beforeNominations && vox) return null
    const holder = active.find(
      (player) => player.id === (beforeNominations ? game.lohId : game.posWinnerId)
    )
    if (!holder || (!beforeNominations && game.povSavedId)) return null
    const questionId = beforeNominations ? 'ask_loh_target' : 'ask_safety_plan'
    if (hasUsedOpportunityAction(state, human.id, holder.id, [questionId, 'whisper'])) return null
    if (drama) {
      const label = beforeNominations
        ? `Ask ${holder.name} about their nomination plan.`
        : `Ask ${holder.name} about using Safety.`
      const lead = outgoingOpportunity(state, human, label, {
        targetId: holder.id,
        actionId: questionId,
      })
      if (lead) return lead
    }
    return outgoingOpportunity(
      state,
      human,
      beforeNominations
        ? `Talk to ${holder.name} before nominations.`
        : `Talk to ${holder.name} before the Safety decision.`,
      { targetId: holder.id, actionId: 'whisper' }
    )
  }

  const humanAffinity = (id: string) => social.relationships[human.id]?.[id]?.affinity ?? 0
  const nominees = active
    .filter((player) => game.nomineeIds.includes(player.id))
    .sort((left, right) => humanAffinity(right.id) - humanAffinity(left.id))
  if (nominees.length === 0 || game.replacementNeeded || game.aiReplacementStep) return null
  const humanOnBlock = game.nomineeIds.includes(human.id)
  const voters = active
    .filter((player) => canCastClassicEvictionVote(game, player.id))
    .sort((left, right) => humanAffinity(right.id) - humanAffinity(left.id))
  if (drama && !vox) {
    const subject = nominees[nominees.length - 1]
    for (const voter of voters) {
      const lead = outgoingOpportunity(
        state,
        human,
        `Ask ${voter.name} to vote against ${subject.name}.`,
        { targetId: voter.id, actionId: 'rally_votes_against', subjectId: subject.id }
      )
      if (lead) return lead
    }
  }
  const contact = humanOnBlock
    ? (voters[0] ?? active.find(({ id }) => !game.nomineeIds.includes(id)))
    : nominees[0]
  if (!contact) return null
  return outgoingOpportunity(
    state,
    human,
    humanOnBlock
      ? `Talk to ${contact.name} before the vote.`
      : `Check in with ${contact.name} on the block.`,
    { targetId: contact.id, actionId: humanOnBlock ? 'whisper' : 'reassure' }
  )
}
