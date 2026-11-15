import type { AppDispatch, RootState } from '../store/store'
import type { SocialActionDefinition } from './socialActions'
import { getEffectiveSocialMode } from './socialMode'
import { getRuntimeSocialActionById } from './socialActionManager'
import { normalizeActionCosts } from './smExecNormalize'
import { validateSocialExecution } from './socialExecutionGuard'
import { allianceKind, isCurrentAlliance } from './reality/allianceIdentity'
import { executeHumanRealityAction } from './reality/humanFlow'
import { replaceRealityDomain } from './socialSlice'
import type { RealityResponseKind } from './reality/types'

export const SWAY_ALLIANCE_VOTE: SocialActionDefinition = {
  id: 'sway_alliance_vote',
  title: 'Sway the vote',
  icon: '🗳️',
  category: 'alliance',
  kind: 'political_spend',
  targetMode: 'none',
  baseCost: 0,
  realityExclusive: true,
  description: 'Ask your alliance to back your choice for elimination.',
}

export function getAllianceVoteSway(
  state: RootState,
  allianceId: string | null,
  subjectIds: readonly string[] = []
) {
  const { game, social } = state
  const human = game.players.find((player) => player.isUser)
  const windowOpen = Boolean(
    human &&
    game.lohId === human.id &&
    !['evicted', 'jury'].includes(human.status) &&
    getEffectiveSocialMode(state) === 'drama' &&
    game.voxPopuli?.status !== 'active' &&
    ['pos_ceremony_results', 'social_2'].includes(game.phase) &&
    !game.replacementNeeded &&
    !game.weekendInterlude?.active
  )
  const groups = Object.values(social.reality.alliances).filter(
    (group) =>
      windowOpen &&
      isCurrentAlliance(group) &&
      allianceKind(group) === 'GROUP' &&
      human &&
      group.memberIds.includes(human.id)
  )
  const alliance = groups.find((group) => group.id === allianceId)
  const voters = alliance
    ? game.players.filter(
        (player) =>
          alliance.memberIds.includes(player.id) &&
          !player.isUser &&
          !['evicted', 'jury'].includes(player.status) &&
          !player.status.split('+').includes('loh') &&
          !game.coLohIds?.includes(player.id) &&
          !game.nomineeIds.includes(player.id)
      )
    : []
  const nominees = game.players.filter(
    (player) =>
      game.nomineeIds.includes(player.id) &&
      !player.isUser &&
      !['evicted', 'jury'].includes(player.status)
  )
  const maxTargets = game.doubleEviction?.weekActive ? 2 : 1
  const action = getRuntimeSocialActionById('rally_votes_against')
  const unit = action ? normalizeActionCosts(action, 1, true) : { energy: 0, influence: 0, info: 0 }
  const count = voters.length * Math.max(1, subjectIds.length)
  const costs = {
    energy: unit.energy * count,
    influence: unit.influence * count,
    info: unit.info * count,
  }
  let reason = !windowOpen
    ? 'Wait until the final nominees are settled.'
    : !alliance
      ? 'Choose an alliance.'
      : !voters.length
        ? 'No alliance members can cast a vote.'
        : !subjectIds.length
          ? 'Choose an elimination target.'
          : subjectIds.length > maxTargets || new Set(subjectIds).size !== subjectIds.length
            ? `Choose up to ${maxTargets} nominees.`
            : subjectIds.some((id) => !nominees.some((nominee) => nominee.id === id))
              ? 'Choose a current nominee.'
              : ''
  if (!reason && human && action) {
    for (const subjectId of subjectIds)
      for (const voter of voters) {
        const eligibility = validateSocialExecution(state, {
          action,
          actorId: human.id,
          targetIds: [voter.id],
          subjectId,
          requireCompleteSelection: true,
        })
        if (!eligibility.eligible) reason ||= eligibility.reason
      }
    if (
      (social.energyBank[human.id] ?? 0) < costs.energy ||
      (social.influenceBank[human.id] ?? 0) < costs.influence ||
      (social.infoBank[human.id] ?? 0) < costs.info
    )
      reason = 'Not enough resources for this alliance request. Nothing will be spent.'
  }
  if (!action) reason = 'This action is unavailable.'
  return { groups, alliance, voters, nominees, maxTargets, costs, eligible: !reason, reason }
}

interface VoteReaction {
  voterId: string
  name: string
  subjectId: string
  reaction?: RealityResponseKind
}

function joinNames(names: readonly string[]) {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Group matching public responses without exposing a private lie or inventing a ballot. */
export function formatAllianceVoteReactions(
  replies: readonly VoteReaction[],
  nominees: readonly { id: string; name: string }[]
) {
  type VisibleReaction = Exclude<RealityResponseKind, 'LIE'> | 'NONE'
  const full: Record<VisibleReaction, string> = {
    ACCEPT: 'said they would back the plan',
    COUNTER: 'wanted different terms',
    QUESTION: 'asked for a stronger case',
    REJECT: 'opposed the plan',
    ESCALATE: 'pushed back against the plan',
    WALK_AWAY: 'left without committing',
    DE_ESCALATE: 'kept the discussion calm without committing',
    NONE: 'made no commitment',
  }
  const groups = new Map<string, string[]>()
  for (const voterId of new Set(replies.map((reply) => reply.voterId))) {
    const responses = replies.filter((reply) => reply.voterId === voterId)
    const byReaction = new Map<VisibleReaction, string[]>()
    for (const response of responses) {
      const reaction = response.reaction === 'LIE' ? 'ACCEPT' : (response.reaction ?? 'NONE')
      const name =
        nominees.find((nominee) => nominee.id === response.subjectId)?.name ?? 'that nominee'
      byReaction.set(reaction, [...(byReaction.get(reaction) ?? []), name])
    }
    const wording =
      byReaction.size === 1
        ? full[[...byReaction.keys()][0]]
        : [...byReaction]
            .map(([reaction, names]) => {
              const target = joinNames(names)
              if (reaction === 'ACCEPT') return `said they would target ${target}`
              if (reaction === 'COUNTER') return `wanted different terms for ${target}`
              if (reaction === 'QUESTION') return `asked for a stronger case against ${target}`
              if (reaction === 'REJECT' || reaction === 'ESCALATE')
                return `opposed targeting ${target}`
              return `made no commitment on ${target}`
            })
            .join(' and ')
    groups.set(wording, [...(groups.get(wording) ?? []), responses[0].name])
  }
  return [...groups].map(([wording, names]) => `${joinNames(names)} ${wording}.`).join(' ')
}

/** One group gesture using the established pitch responses and ballot preferences. */
export function swayAllianceVote(allianceId: string, subjectIds: string[]) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()
    const plan = getAllianceVoteSway(state, allianceId, subjectIds)
    const human = state.game.players.find((player) => player.isUser)
    if (!plan.eligible || !human || !plan.alliance) return { success: false, summary: plan.reason }
    const accepted = new Map<string, string[]>()
    const replies: VoteReaction[] = []
    let performed = false
    for (const subjectId of subjectIds)
      for (const voter of plan.voters) {
        const beforeSequence = getState().social.reality.nextSequence
        const previousReceiptId = getState().social.sessionLogs.at(-1)?.id
        const outcome = dispatch(
          executeHumanRealityAction({
            actorId: human.id,
            targetId: voter.id,
            actionId: 'rally_votes_against',
            subjectId,
            coordinationAllianceId: allianceId,
          })
        )
        performed ||= outcome.success
        const receipt = getState().social.sessionLogs.at(-1)
        replies.push({
          voterId: voter.id,
          name: voter.name,
          subjectId,
          reaction:
            receipt?.id !== previousReceiptId && receipt?.targetId === voter.id
              ? receipt.targetReactions?.[voter.id]
              : undefined,
        })
        const coordinated = getState().social.reality.events.some(
          (event) =>
            event.sequence >= beforeSequence &&
            event.type === 'ALLIANCE_TARGET_COORDINATED' &&
            event.allianceId === allianceId &&
            event.actorId === human.id &&
            event.participantIds.includes(voter.id) &&
            event.targetIds.includes(subjectId)
        )
        if (coordinated) accepted.set(voter.id, [...(accepted.get(voter.id) ?? []), subjectId])
      }
    // A second accepted pitch must not erase the first target in a double elimination.
    if (subjectIds.length > 1 && accepted.size) {
      const domain = structuredClone(getState().social.reality)
      const alliance = domain.alliances[allianceId]
      const targets = subjectIds.filter((id) =>
        [...accepted.values()].some((ids) => ids.includes(id))
      )
      alliance.currentTargetIds = targets.filter((id) => !alliance.memberIds.includes(id))
      alliance.memberPlanBeliefs[human.id] = targets.map((id) => `target:${id}`)
      for (const [voterId, ids] of accepted)
        alliance.memberPlanBeliefs[voterId] = ids.map((id) => `target:${id}`)
      dispatch(replaceRealityDomain(domain))
    }
    const names = plan.nominees
      .filter((player) => subjectIds.includes(player.id))
      .map((player) => player.name)
    return {
      success: performed,
      summary: `You asked ${plan.alliance.name ?? 'your alliance'} to vote out ${names.join(' and ')}. ${formatAllianceVoteReactions(replies, plan.nominees)}`,
    }
  }
}
