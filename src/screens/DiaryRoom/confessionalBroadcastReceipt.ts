import type { TvEvent } from '../../types'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'

type DecisionType = ActiveConfessionalDecision['type']

const TEMPLATE_IDS_BY_DECISION: Partial<Record<DecisionType, readonly string[]>> = {
  pos_decision: ['safety.halo-prompt'],
}

function legacyPromptMatches(decisionType: DecisionType | null, text: string): boolean {
  if (decisionType === 'pos_decision') {
    return /will you use (?:halo exchange|double trouble|detox|(?:the )?power of safety)/i.test(
      text
    )
  }
  if (decisionType === 'double_vote_offer') {
    return /(?:double vote.*(?:available|use|activate)|(?:use|activate).*double vote)/i.test(text)
  }
  if (decisionType === 'mission_immunity_offer') {
    return /secret immunity.*(?:use|activate)|(?:use|activate).*secret immunity/i.test(text)
  }
  return false
}

/**
 * Resolve the exact Faux-TV receipt that launched a required Confessional
 * decision. Structured Broadcast Manager metadata wins; text matching exists
 * only for legacy saves/events that pre-date broadcastTemplateId.
 */
export function findConfessionalSourceBroadcast(
  tvFeed: readonly TvEvent[],
  decisionType: DecisionType | null,
  currentWeek: number
): TvEvent | null {
  if (!decisionType) return null
  const eligible = tvFeed
    .filter((event) => event.meta?.broadcastConsumed !== true)
    .filter((event) => {
      const eventWeek = event.meta?.week
      return typeof eventWeek !== 'number' || eventWeek === currentWeek
    })
    .sort((left, right) => right.timestamp - left.timestamp)

  const templateIds = TEMPLATE_IDS_BY_DECISION[decisionType] ?? []
  const structured = eligible.find((event) => {
    const templateId = event.meta?.broadcastTemplateId
    return typeof templateId === 'string' && templateIds.includes(templateId)
  })
  if (structured) return structured

  // Do not parse copy for events that already have a structured template id:
  // a future localized/renamed broadcast must never be mistaken for this prompt.
  return (
    eligible.find(
      (event) =>
        typeof event.meta?.broadcastTemplateId !== 'string' &&
        legacyPromptMatches(decisionType, event.text)
    ) ?? null
  )
}
