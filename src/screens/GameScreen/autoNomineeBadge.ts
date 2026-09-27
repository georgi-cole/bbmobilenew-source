export function getImmediateAutoNomineeId({
  phase,
  isVoxPopuli,
  publicAutoNomineeId,
  voxAutoNomineeId,
  lastHohCompFinisherId,
}: {
  phase: string
  isVoxPopuli: boolean
  publicAutoNomineeId: string | null | undefined
  voxAutoNomineeId: string | null | undefined
  lastHohCompFinisherId: string | null | undefined
}): string | null {
  if (phase !== 'loh_results') return null
  return isVoxPopuli
    ? (voxAutoNomineeId ?? lastHohCompFinisherId ?? null)
    : (publicAutoNomineeId ?? null)
}
