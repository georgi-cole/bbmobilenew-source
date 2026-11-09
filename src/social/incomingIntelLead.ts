import { getIncomingDialogueBeat } from './incomingDialogueOutcomeBank'
import type { IncomingInteraction } from './types'

export const INCOMING_INTEL_LEAD = 'private_intel_lead'

export function isIncomingIntelLead(interaction: IncomingInteraction): boolean {
  return (
    (interaction.type === 'warning' || interaction.type === 'gossip') &&
    typeof interaction.payload?.intelFactId === 'string' &&
    typeof interaction.payload?.originActionId !== 'string'
  )
}

/** Display older intel replies in context without replaying their effects. */
export function getIncomingReactionForDisplay(
  interaction: IncomingInteraction,
  fromName: string
): string | undefined {
  if (
    !isIncomingIntelLead(interaction) ||
    interaction.payload?.scenarioKey === INCOMING_INTEL_LEAD ||
    !interaction.resolved ||
    !interaction.resolvedWith ||
    !interaction.reactionText
  ) {
    return interaction.reactionText
  }
  const reply = getIncomingDialogueBeat({
    scenarioKey: INCOMING_INTEL_LEAD,
    responseType:
      interaction.resolvedWith === 'positive' &&
      /^(talk|ask|hear|compare)\b/i.test(interaction.resolvedLabel ?? '')
        ? 'neutral'
        : interaction.resolvedWith,
    fromName,
    subjectName:
      typeof interaction.payload?.subjectName === 'string'
        ? interaction.payload.subjectName
        : undefined,
    seed: Math.abs(interaction.createdAt),
  })
  return reply ? `${fromName} replies: ${reply}` : undefined
}
