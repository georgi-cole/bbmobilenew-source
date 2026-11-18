import { getEligibleNominationTargets } from '../store/gameSlice'
import type { GameState } from '../types'
import { getPendingAutomaticNomineeId } from './automaticNomination'
import type { IncomingDialogueQuestion, IncomingInteraction } from './types'

const DEAL_TERMS: Record<string, { accept: string; terms: string }> = {
  hoh_safety_request: {
    accept: 'Promise to keep them off the block',
    terms:
      'Keep me off the block at nominations. In return, I’ll share what I hear and help you find support for your plan.',
  },
  nominee_veto_pitch: {
    accept: 'Promise to use Safety on them',
    terms:
      'Use Safety to take me off the block. In return, I’ll owe you a favor and help you rally support for your next move.',
  },
  live_vote_pitch: {
    accept: 'Promise to vote to keep them',
    terms:
      'Vote to keep me tonight. If I stay, I’ll back you when the Hub starts counting votes again.',
  },
  tie_break_campaign: {
    accept: 'Promise your deciding vote',
    terms:
      'Use your deciding vote to keep me. If I get through this, I’ll help you build support for the next round.',
  },
  protection_deal: {
    accept: 'Take the deal',
    terms:
      'I’m offering to keep you off the block. If I end up nominated, I want your vote to keep me.',
  },
  protection_deal_future_vote: {
    accept: 'Take the deal',
    terms:
      'I’m offering to use Safety on you now. If I’m nominated next round, I want your vote to keep me.',
  },
  trade_secrets_offer: {
    accept: 'Take the trade',
    terms:
      'I’ll share my lead with you in exchange for anything useful you’ve heard. Neither of us has to promise a vote.',
  },
}

type DialogueChoice = {
  id: string
  label: string
  responseType: 'positive' | 'neutral' | 'negative' | 'accept' | 'decline' | 'dismiss'
  action?: IncomingDialogueQuestion
  nominationTargetId?: string
}

function getDeal(interaction: IncomingInteraction) {
  const scenario = interaction.payload?.scenarioKey
  if (interaction.type !== 'deal_offer' || typeof scenario !== 'string') return undefined
  return Object.hasOwn(DEAL_TERMS, scenario) ? DEAL_TERMS[scenario] : undefined
}

function isNominationCheckIn(interaction: IncomingInteraction): boolean {
  return (
    interaction.type === 'check_in' &&
    interaction.payload?.scenarioKey === 'allied_loh_plan_check_in'
  )
}

export function getIncomingDialogueQuestion(
  interaction: IncomingInteraction
): IncomingDialogueQuestion | undefined {
  if (interaction.dialogue) return undefined
  if (getDeal(interaction)) return 'ask_deal_terms'
  if (isNominationCheckIn(interaction)) return 'ask_nomination_read'
  return undefined
}

function getNominationCandidates(interaction: IncomingInteraction, game?: GameState) {
  if (!game?.lohId) return []
  const automaticNomineeId = getPendingAutomaticNomineeId(game)
  return getEligibleNominationTargets(game, game.lohId).filter(
    ({ id }) => id !== interaction.fromId && id !== automaticNomineeId
  )
}

export function getIncomingDialogueChoices(
  interaction: IncomingInteraction,
  game?: GameState
): DialogueChoice[] | undefined {
  const deal = getDeal(interaction)
  if (deal) {
    return [
      {
        id: 'deal-accept',
        responseType: 'accept',
        label:
          interaction.dialogue && interaction.payload?.scenarioKey !== 'trade_secrets_offer'
            ? 'Take the deal'
            : deal.accept,
      },
      ...(interaction.dialogue
        ? []
        : [
            {
              id: 'ask_deal_terms',
              label: 'Ask what they are offering',
              action: 'ask_deal_terms',
              responseType: 'neutral',
            } as const,
          ]),
      { id: 'deal-decline', label: 'Reject the deal', responseType: 'decline' },
      { id: 'deal-dismiss', label: 'Walk away', responseType: 'dismiss' },
    ]
  }
  if (!isNominationCheckIn(interaction)) return undefined

  const candidates = interaction.dialogue ? getNominationCandidates(interaction, game) : []
  return [
    ...(interaction.dialogue
      ? candidates.map(
          ({ id, name }): DialogueChoice => ({
            id: `keep-clear:${id}`,
            label: `Keep clear of ${name}`,
            nominationTargetId: id,
            responseType: 'positive',
          })
        )
      : [
          {
            id: 'ask_nomination_read',
            label: 'Ask who they’re worried about',
            action: 'ask_nomination_read',
            responseType: 'neutral',
          } as const,
        ]),
    { id: 'loh-private', label: 'Keep my nomination plans private', responseType: 'neutral' },
    { id: 'loh-end', label: 'End the check-in', responseType: 'dismiss' },
  ]
}

export function getIncomingDialogueReply(
  interaction: IncomingInteraction,
  question: IncomingDialogueQuestion,
  game: GameState,
  actorRelationships: Record<string, { affinity: number }> = {}
): string | undefined {
  if (getIncomingDialogueQuestion(interaction) !== question) return undefined
  if (question === 'ask_deal_terms') return getDeal(interaction)?.terms

  const [concern] = getNominationCandidates(interaction, game).sort(
    (left, right) =>
      (actorRelationships[left.id]?.affinity ?? 0) -
        (actorRelationships[right.id]?.affinity ?? 0) || left.id.localeCompare(right.id)
  )
  return concern
    ? `If I had to pick one name to watch, it’d be ${concern.name}. That’s my read for now. Who would you rather I keep clear of?`
    : 'I don’t have a name I feel sure about yet. We can keep the plan between us until you’re ready.'
}

export function getIncomingDialogueFinalReply(
  interaction: IncomingInteraction,
  choiceId: string | undefined,
  targetName?: string
): string | undefined {
  if (isNominationCheckIn(interaction)) {
    if (targetName)
      return `I hear you about ${targetName}. I’ll keep that in mind when I talk strategy. The nominations are your call.`
    if (choiceId === 'loh-private') return 'Fair enough. I’ll leave the nominations with you.'
    if (choiceId === 'loh-end') return 'All right. I won’t press you on it.'
  }
  if (getDeal(interaction)) {
    if (choiceId === 'deal-accept' && interaction.payload?.scenarioKey === 'trade_secrets_offer')
      return 'All right. Tell me what you’ve heard, and I’ll share my lead.'
    if (choiceId === 'deal-accept') return 'Deal. I’m counting on you to follow through.'
    if (choiceId === 'deal-decline') return 'I hear you. I’ll look for another way through.'
    if (choiceId === 'deal-dismiss') return 'All right. I’ll leave it there.'
  }
  return undefined
}
