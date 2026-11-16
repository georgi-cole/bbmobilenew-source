/** Preserve the original draw, but give each Reverse Time attempt a fresh,
 * deterministic stream shared by the human and simulated contestants. */
export function competitionAttemptSeed(seed: number, attempt: number): number {
  if (attempt <= 0) return seed
  return ((seed >>> 0) + Math.imul(attempt, 0x9e3779b9)) >>> 0
}
