import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import { appendRealityEvent } from './events'
import { nemesisThreadId } from './relationshipAutonomy'
import type {
  RealityClock,
  RealityDomainState,
  RealityNemesisObjective,
  RealitySocialEvent,
} from './types'

export const ASK_NEMESIS_REASON_ACTION_ID = 'ask_nemesis_reason'

/** A contextual card must never reveal a private or already-resolved enemy objective. */
export function getNemesisReasonAvailability(
  domain: RealityDomainState | undefined,
  humanId: string,
  targetId: string,
  day?: number
): { eligible: boolean; reason: string; objective?: RealityNemesisObjective } {
  const objective = Object.values(domain?.relationshipAutonomy.nemeses ?? {}).find(
    (entry) => entry.ownerId === targetId && entry.targetId === humanId
  )
  if (
    !objective ||
    objective.status !== 'ACTIVE' ||
    !objective.revealEventId ||
    !objective.revealedAt
  ) {
    return { eligible: false, reason: 'There is no revealed active Nemesis to question.' }
  }
  if (objective.reasonDisclosedAt) {
    return { eligible: false, reason: 'This hubmate has already explained their decision.' }
  }
  if (day !== undefined && objective.reasonLastAskedDay === day) {
    return { eligible: false, reason: 'You have already asked this hubmate today.' }
  }
  return { eligible: true, reason: '', objective }
}

function stableUnit(seed: string): number {
  let hash = 2166136261
  for (const letter of seed) {
    hash ^= letter.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0x1_0000_0000
}

function causalSource(
  domain: RealityDomainState,
  objective: RealityNemesisObjective
): RealitySocialEvent | undefined {
  return (
    domain.events.find((event) => event.id === objective.triggerEventId) ??
    domain.events.find((event) => event.id === objective.sourceEventId)
  )
}

/** Refer only to verified decisions that can actually be tied to the rivalry. */
function actualReason(
  domain: RealityDomainState,
  objective: RealityNemesisObjective,
  names: Readonly<Record<string, string>>
): { text: string; specific: boolean } {
  const source = causalSource(domain, objective)
  const trigger = source?.reason?.toLowerCase() ?? ''
  const relevantEvent = (type: string) =>
    [...domain.events]
      .reverse()
      .find(
        (event) =>
          event.type === type &&
          event.day <= objective.createdAt.day &&
          event.actorId === objective.targetId &&
          (event.targetIds.includes(objective.ownerId) ||
            event.participantIds.includes(objective.ownerId))
      )
  const voteEvent =
    source?.type === 'ALLIANCE_REQUEST_VOTE'
      ? source
      : source?.type === 'ALLIANCE_REQUEST_ACCEPTED'
        ? [...domain.events]
            .reverse()
            .find(
              (event) =>
                event.type === 'ALLIANCE_REQUEST_VOTE' &&
                event.allianceRequestId === source.allianceRequestId &&
                event.actorId === objective.ownerId &&
                event.allianceRequestSnapshot?.accepted === false
            )
        : undefined
  const rejectedInvite =
    voteEvent?.allianceRequestSnapshot?.kind === 'ADMIT' &&
    voteEvent.actorId === objective.ownerId &&
    voteEvent.allianceRequestSnapshot.accepted === false &&
    voteEvent.allianceRequestId
      ? domain.allianceManagement.requests[voteEvent.allianceRequestId]
      : undefined
  if (
    rejectedInvite?.kind === 'ADMIT' &&
    rejectedInvite.proposerId === objective.targetId &&
    rejectedInvite.status === 'ACCEPTED' &&
    rejectedInvite.candidateId &&
    rejectedInvite.votes[objective.ownerId] === false
  ) {
    const newcomer = names[rejectedInvite.candidateId] ?? 'someone new'
    return {
      text: `You brought ${newcomer} into our alliance despite my vote against it. I stopped trusting your judgment.`,
      specific: true,
    }
  }
  if (source?.type === 'ALLIANCE_BETRAYAL' && source.actorId === objective.targetId) {
    if (trigger.startsWith('safety_abandon:')) {
      return {
        text: 'You had the chance to protect me with Safety and left me vulnerable. That changed how much I trusted you.',
        specific: true,
      }
    }
    if (trigger.startsWith('nomination:')) {
      return {
        text: `You nominated me on Day ${source.day} while we were supposed to be working together.`,
        specific: true,
      }
    }
    if (trigger.startsWith('vote:')) {
      return {
        text: `You voted against me on Day ${source.day} despite our agreement.`,
        specific: true,
      }
    }
    return {
      text: 'You broke a commitment between us, and I stopped trusting our partnership.',
      specific: true,
    }
  }
  if (
    source?.type === 'CEREMONY_NOMINATIONS_LOCKED' &&
    source.actorId === objective.targetId &&
    source.targetIds.includes(objective.ownerId)
  ) {
    return {
      text: `You put me on the block on Day ${source.day}. I could not overlook that.`,
      specific: true,
    }
  }
  if (
    source?.type === 'ALLIANCE_PLAN_DEFIED' &&
    source.actorId === objective.targetId &&
    source.participantIds.includes(objective.ownerId)
  ) {
    return {
      text: `You ignored our alliance's agreed plan on Day ${source.day}. It cost me my trust in you.`,
      specific: true,
    }
  }
  if (source?.type === 'PROVOCATEUR_CONFLICT_STARTED') {
    if (trigger.includes('nomination')) {
      const nomination = relevantEvent('CEREMONY_NOMINATIONS_LOCKED')
      return {
        text: nomination
          ? `You put me on the block on Day ${nomination.day}. I could not overlook that.`
          : 'You put my position at risk with a nomination, and I did not forgive it.',
        specific: true,
      }
    }
    if (trigger.includes('betrayal') || trigger.includes('plan_defied')) {
      const betrayed = relevantEvent('ALLIANCE_BETRAYAL')
      const plan = relevantEvent('ALLIANCE_PLAN_DEFIED')
      return {
        text: betrayed
          ? `You broke our alliance agreement on Day ${betrayed.day}, and my trust was gone.`
          : plan
            ? `You went against our alliance plan on Day ${plan.day}. I stopped relying on you.`
            : 'I thought you had broken our agreement. I stopped believing I could rely on you.',
        specific: true,
      }
    }
  }
  switch (objective.reason) {
    case 'PERSONAL_FRICTION':
      return {
        text: 'Too much distrust built up between us. I stopped believing we could work together.',
        specific: false,
      }
    case 'JEALOUSY':
      return {
        text: 'I resented how much attention and influence you had. I let it turn into rivalry.',
        specific: false,
      }
    case 'COMPETITION_THREAT':
      return {
        text: 'You kept becoming a bigger competitive threat. I thought opposing you would protect my own game.',
        specific: false,
      }
    case 'SOCIAL_REACH':
      return {
        text: 'Everyone was starting to listen to you. I felt my own influence slipping away.',
        specific: false,
      }
    case 'VOLATILE_READ':
      return {
        text: 'I was suspicious of your plans and decided it was safer to compete against you.',
        specific: false,
      }
  }
}

export interface NemesisInquiryResponse {
  answered: boolean
  text: string
  eventId: string
}

/**
 * Answer a single paid private question. Refusal is uncommon and more likely
 * under severe tension. An opportunist may admit a pure strategic motive only
 * when no specific causal betrayal has been established.
 */
export function askRevealedNemesisWhy(
  domain: RealityDomainState,
  input: {
    humanId: string
    targetId: string
    name: string
    at: RealityClock
    seed: number
    identity?: AiGameIdentity
    playerNames?: Readonly<Record<string, string>>
  }
): NemesisInquiryResponse | null {
  const availability = getNemesisReasonAvailability(
    domain,
    input.humanId,
    input.targetId,
    input.at.day
  )
  if (!availability.eligible || !availability.objective) return null
  const nemesis = availability.objective
  const edge = domain.relationships[nemesis.ownerId]?.[nemesis.targetId]
  const tension = Math.min(1, Math.max(0, ((edge?.resentment ?? 0) + (edge?.suspicion ?? 0)) / 190))
  const refusalChance = Math.min(
    0.28,
    0.04 + tension * 0.17 + (input.identity?.temperament === 'secretive' ? 0.04 : 0)
  )
  const dice = stableUnit(`${input.seed}:${nemesis.id}:${input.at.day}:reply`)
  const actual = actualReason(domain, nemesis, input.playerNames ?? {})
  const schemer = [
    'double_agent',
    'opportunist',
    'puppet_master',
    'chaos_agent',
    'risk_taker',
  ].includes(input.identity?.archetype ?? '')
  const strategicAdmission =
    !actual.specific &&
    nemesis.reason !== 'PERSONAL_FRICTION' &&
    nemesis.reason !== 'JEALOUSY' &&
    schemer &&
    stableUnit(`${input.seed}:${nemesis.id}:strategy`) < 0.18
  const refused = dice < refusalChance
  const answer = refused
    ? "I don't owe you an explanation. I'm not discussing this with you."
    : strategicAdmission
      ? 'It was a game move. Nothing personal. I wanted a better position for myself.'
      : actual.text
  const text = `${input.name}: ${answer}`
  const event = appendRealityEvent(domain, {
    ...input.at,
    type: refused ? 'NEMESIS_REASON_REFUSED' : 'NEMESIS_REASON_EXPLAINED',
    actionId: ASK_NEMESIS_REASON_ACTION_ID,
    actorId: nemesis.ownerId,
    targetIds: [nemesis.targetId],
    participantIds: [nemesis.ownerId, nemesis.targetId],
    witnessIds: [],
    visibility: 'PAIR_ONLY',
    outcome: refused ? 'FAILURE' : 'SUCCESS',
    reason: text,
    tags: ['NEMESIS', 'PRIVATE_CONVERSATION', refused ? 'REFUSAL' : 'EXPLANATION'],
    relatedFactIds: [],
    relatedPromiseIds: [],
    relatedThreadIds: [nemesisThreadId(nemesis)],
    publicEligible: false,
    juryEligible: false,
  })
  nemesis.reasonLastAskedDay = input.at.day
  if (!refused) nemesis.reasonDisclosedAt = { ...input.at }
  return { answered: !refused, text, eventId: event.id }
}
