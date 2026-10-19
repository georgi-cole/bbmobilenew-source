export function isBeforeInitialNominations(phase: string | undefined): boolean {
  return ['loh_results', 'democracia_results', 'social_1', 'nominations'].includes(phase ?? '')
}

/** Use the phase of the conversation, including when rendering its saved receipt. */
export function formatVagueLohPlan(lohName: string, phase: string | undefined): string {
  return `${lohName} kept the ${isBeforeInitialNominations(phase) ? 'opening nomination' : 'replacement'} plan vague.`
}
