export const LEGACY_QUICK_TAP_AI_TUNING = 1
export const CURRENT_QUICK_TAP_AI_TUNING = 2
export type QuickTapAiTuningVersion =
  | typeof LEGACY_QUICK_TAP_AI_TUNING
  | typeof CURRENT_QUICK_TAP_AI_TUNING

export function getQuickTapAiBandStrength(
  version: QuickTapAiTuningVersion = CURRENT_QUICK_TAP_AI_TUNING
): number {
  return version === LEGACY_QUICK_TAP_AI_TUNING ? 1 : 1.1
}

/** Select a tap-cadence band without letting a cast member's profile change its weight. */
export function selectQuickTapPaceBand<T extends { weight: number }>(
  bands: readonly T[],
  roll: number
): T {
  let ticket = roll * 100
  return bands.find(({ weight }) => (ticket -= weight) < 0) ?? bands[bands.length - 1]
}
