import { getCurrentPact } from './reality/allianceIdentity'
import type { RealityDomainState } from './reality/types'

const PROTECTION_SCENES = new Set([
  'hoh_safety_request',
  'nominee_hoh_plea',
  'nominee_veto_pitch',
  'nominee_campaign',
  'live_vote_pitch',
])

/**
 * A clarification question is not a refusal, nomination promise or vote
 * commitment. Interpret the *selected words*, not simply the generic
 * positive/neutral slot occupied by their button.
 */
export function isProtectionClarification(
  scene: string | undefined,
  choice: string | undefined
): boolean {
  return (
    PROTECTION_SCENES.has(scene ?? '') &&
    /^(?:ask (?:what (?:they|you) need|for their case|what (?:they are|they're) offering|what changes|for reasons)|hear (?:the campaign|their plan)|what do you need\??)$/i.test(
      choice?.trim() ?? ''
    )
  )
}

/**
 * Only the AI's visible, recorded *same-day* rejection of this human's pact
 * may inform its subsequent private answer. Never infer a rejection from
 * relationship values or another housemate's private state.
 */
export function getSameDayPactRefusal(
  domain: RealityDomainState,
  humanId: string,
  respondentId: string,
  day: number
): string | null {
  if (getCurrentPact(domain, humanId, respondentId)) return null
  const matching = Object.values(domain.allianceManagement.requests)
    .filter(
      (request) =>
        request.kind === 'PACT' &&
        request.status === 'DECLINED' &&
        request.proposerId === humanId &&
        request.createdAt.day === day &&
        request.settledAt?.day === day &&
        request.memberIds.length === 2 &&
        request.memberIds.includes(humanId) &&
        request.memberIds.includes(respondentId) &&
        request.responsesByActorId?.[respondentId]?.style === 'DECLINED'
    )
    .sort((a, b) => b.createdAt.day - a.createdAt.day || b.id.localeCompare(a.id))
  return matching[0]?.responsesByActorId?.[respondentId]?.reason ?? null
}

/** First-person, source-grounded follow-up to a *real* declined pact. */
export function explainProtectionWithoutPact(
  recordedRefusal: string,
  scene: string | undefined
): string {
  const reason = recordedRefusal.toLowerCase()
  const immediateNeed =
    scene === 'nominee_campaign' || scene === 'live_vote_pitch'
      ? 'help surviving the vote'
      : scene === 'nominee_veto_pitch'
        ? 'help with the Safety decision'
        : 'help staying off the block'

  if (/broken deals|broken promises|cannot rely on this protection/.test(reason)) {
    return `"I asked for ${immediateNeed}, but I need to see you keep your word before I trust a longer pact. Those are different commitments."`
  }
  if (/already have people|existing commitments|turn on them/.test(reason)) {
    return `"I still need ${immediateNeed}. I already owe commitments to other people, so I cannot sign a personal pact on top of them."`
  }
  if (/unresolved conflict|cannot commit to this pact yet/.test(reason)) {
    return `"I need us to settle the conflict first. Asking for ${immediateNeed} does not mean I can promise you long-term loyalty."`
  }
  if (/not enough trust|do not have enough trust/.test(reason)) {
    return `"I need ${immediateNeed}, but I am not ready to promise future votes until we have built more trust."`
  }
  if (/do not see enough protection|not enough protection/.test(reason)) {
    return `"I am asking for ${immediateNeed}, not a standing pact. I need a concrete short-term decision before I can promise anything longer."`
  }
  // Unknown refusal copy: neither invent a cause nor assign the human a no.
  return `"I need ${immediateNeed}. A personal pact is a bigger commitment, and I have not agreed to that yet."`
}

/** A question should be answered according to its actual decision window. */
export function explainProtectionNeed(scene: string | undefined): string | null {
  switch (scene) {
    case 'hoh_safety_request':
    case 'nominee_hoh_plea':
      return '"I need to know whether you intend to keep me off the block. You still make the nomination decision; I am asking, not assuming."'
    case 'nominee_veto_pitch':
      return '"I need you to consider using Safety on me. I know the power and the replacement decision are yours."'
    case 'nominee_campaign':
    case 'live_vote_pitch':
      return '"I need votes to stay. If you can help me talk to someone who is undecided, that would matter."'
    default:
      return null
  }
}
