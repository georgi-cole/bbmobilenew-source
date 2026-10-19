/** A live Safety offer is a concrete save, not a promise about a later vote. */
export function isSafetyProtectionOffer(input: {
  phase?: string
  actorHoldsSafety: boolean
  targetIsNominated: boolean
}): boolean {
  return (
    input.actorHoldsSafety &&
    input.targetIsNominated &&
    ['pos_results', 'pos_ceremony'].includes(input.phase ?? '')
  )
}
