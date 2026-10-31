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
  if (!isVoxPopuli) return phase === 'loh_results' ? (publicAutoNomineeId ?? null) : null

  // Vox's last-place nominee is known as soon as the immunity competition
  // ends, but the final nominee list is not committed until the ballot
  // ceremony. Keep the roster marker visible throughout that gap.
  if (!['loh_results', 'social_1', 'nominations', 'nomination_results', 'social_2'].includes(phase))
    return null
  return voxAutoNomineeId ?? lastHohCompFinisherId ?? null
}
