import type { IncomingInteraction } from './types'

export type IncomingSafetyChoice =
  | { kind: 'save'; targetId?: string; targetName: string }
  | { kind: 'hold' }
  | { kind: 'ask_advice' }
  | { kind: 'delegate' }

type Nominee = { id?: string; name: string }

interface SafetyNomineeContext {
  nomineeIds?: readonly string[]
  players?: readonly { id: string; name: string; status: string }[]
}

export function getSafetyConsultationScenario(interaction: IncomingInteraction) {
  const scenario = interaction.payload?.scenarioKey
  return scenario === 'loh_consults_safety_holder' || scenario === 'safety_holder_consults_loh'
    ? scenario
    : null
}

export function getSafetyConsultationNominees(
  interaction: IncomingInteraction,
  live?: SafetyNomineeContext
): Nominee[] {
  if (live) {
    const players = live.players ?? []
    return [...new Set(live.nomineeIds ?? [])].flatMap((id) => {
      const player = players.find((entry) => entry.id === id)
      return player && player.status !== 'evicted' && player.status !== 'jury'
        ? [{ id, name: player.name }]
        : []
    })
  }

  const names = interaction.payload?.nomineeNames
  const ids = interaction.payload?.nomineeIds
  if (!Array.isArray(names)) return []
  return names.flatMap((name, index) => {
    if (typeof name !== 'string' || !name.trim()) return []
    const id: unknown = Array.isArray(ids) ? ids[index] : undefined
    return [{ name, id: typeof id === 'string' ? id : undefined }]
  })
}

export function isSafetyChoiceAligned(
  interaction: IncomingInteraction,
  choice: IncomingSafetyChoice
): boolean {
  return (
    (choice.kind === 'hold' && interaction.payload?.preferredSafetyAdvice === 'hold') ||
    (choice.kind === 'save' &&
      interaction.payload?.preferredSafetyAdvice === 'save' &&
      choice.targetId !== undefined &&
      choice.targetId === interaction.payload?.preferredSafetyTargetId)
  )
}
