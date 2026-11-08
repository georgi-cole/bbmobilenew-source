import { compareSocialClock } from './reality/clock'
import { getIncomingInteractionValidityRule } from './incomingInteractionValidityBank'
import type {
  IncomingInteraction,
  IncomingInteractionType,
  ScheduledIncomingInteraction,
} from './types'
import type { RealityDeadline, RealityClock } from './reality'

const LABELS: Record<string, string> = {
  week_start: 'day start',
  loh_results: 'the power result',
  social_1: 'the first social window',
  nominations: 'nominations',
  nomination_results: 'the nomination ceremony',
  pos_results: 'the Safety result',
  pos_ceremony: 'the Safety decision',
  pos_ceremony_results: 'the Safety ceremony',
  social_2: 'the final campaign window',
  live_vote: 'the live vote',
  eviction_results: 'eviction',
}

export function compareIncomingClock(left: RealityClock, right: RealityClock): number {
  return compareSocialClock(left, right)
}

export function deriveIncomingDeadline(input: {
  day: number
  phase: string
  type: IncomingInteractionType
  payload?: Record<string, unknown>
  required: boolean
}): RealityDeadline | undefined {
  if (!input.required) return undefined
  const authoredPhase =
    typeof input.payload?.deadlinePhase === 'string' ? input.payload.deadlinePhase : undefined
  const scenario = typeof input.payload?.scenarioKey === 'string' ? input.payload.scenarioKey : ''
  let phase =
    authoredPhase ??
    (
      {
        background_nominate_human: 'nomination_results',
        nominee_hoh_plea: 'nomination_results',
        hoh_safety_request: 'nomination_results',
        nominee_veto_pitch: 'pos_ceremony_results',
        loh_consults_safety_holder: 'pos_ceremony_results',
        safety_holder_consults_loh: 'pos_ceremony',
      } as Record<string, string>
    )[scenario]
  if (!phase && scenario.includes('safety')) phase = 'pos_ceremony_results'
  if (!phase && (input.type === 'nomination_plea' || input.type === 'deal_offer')) {
    phase = 'live_vote'
  }
  if (!phase && input.type === 'warning') phase = 'pos_ceremony_results'
  if (!phase && input.type === 'alliance_proposal') phase = 'social_2'
  if (!phase) phase = 'eviction_results'
  const deadline = { day: input.day, phase }
  const deadlineDay =
    compareIncomingClock(deadline, { day: input.day, phase: input.phase }) < 0
      ? input.day + 1
      : input.day
  return {
    day: deadlineDay,
    phase,
    policy: 'AUTO_IGNORE',
  }
}

export function getIncomingDeadline(interaction: IncomingInteraction): RealityDeadline {
  const deadline: RealityDeadline = interaction.deadline ?? {
    day: interaction.expiresAtWeek,
    phase: 'eviction_results',
    policy: 'AUTO_IGNORE',
  }
  const scenarioKey = interaction.payload?.scenarioKey
  const decision =
    typeof scenarioKey === 'string'
      ? getIncomingInteractionValidityRule(scenarioKey)?.directDecision
      : undefined
  if (!decision || interaction.resolved) return deadline

  const latest: RealityDeadline = {
    day: interaction.createdDay ?? interaction.createdWeek,
    phase: {
      nomination: 'nomination_results',
      replacement: 'pos_ceremony_results',
      vote: 'live_vote',
    }[decision],
    policy: deadline.policy,
  }
  return compareIncomingClock(deadline, latest) > 0 ? latest : deadline
}

export function getScheduledIncomingInteractionClock(
  entry: ScheduledIncomingInteraction,
  fallback: RealityClock
): RealityClock {
  return {
    day: entry.scheduledForDay ?? entry.scheduledForWeek ?? fallback.day,
    phase: entry.scheduledForPhase ?? fallback.phase,
  }
}

export function isIncomingInteractionOverdue(
  interaction: IncomingInteraction,
  now: RealityClock
): boolean {
  return !interaction.resolved && compareIncomingClock(getIncomingDeadline(interaction), now) < 0
}

export function isIncomingInteractionUrgent(
  interaction: IncomingInteraction,
  now: RealityClock
): boolean {
  if (interaction.resolved) return false
  const deadline = getIncomingDeadline(interaction)
  return deadline.day === now.day && compareIncomingClock(now, deadline) <= 0
}

export function formatIncomingDeadline(interaction: IncomingInteraction): string {
  const deadline = getIncomingDeadline(interaction)
  return `Answer before ${LABELS[deadline.phase] ?? deadline.phase.replaceAll('_', ' ')}`
}

export function formatIncomingDecisionDeadline(interaction: IncomingInteraction): string {
  const deadline = getIncomingDeadline(interaction)
  const phase = LABELS[deadline.phase] ?? deadline.phase.replaceAll('_', ' ')
  return `Offer closes Day ${deadline.day} · end of ${phase}`
}
