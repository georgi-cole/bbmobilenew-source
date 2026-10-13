const ORIENTATION_DEAD_ZONE_DEGREES = 1.5
export const TILT_LABYRINTH_BASE_FRAME_MS = 1000 / 60
export const TILT_LABYRINTH_MAX_FRAME_SCALE = 6

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizeTiltDelta(
  deltaDegrees: number,
  deadZoneDegrees = ORIENTATION_DEAD_ZONE_DEGREES
): number {
  if (!Number.isFinite(deltaDegrees)) return 0
  if (Math.abs(deltaDegrees) <= deadZoneDegrees) return 0
  const adjusted = deltaDegrees - Math.sign(deltaDegrees) * deadZoneDegrees
  return clamp(adjusted / 30, -1, 1)
}

/** Scale physics by elapsed time so input speed is consistent across frame rates. */
export function tiltLabyrinthFrameScale(frameDeltaMs: number): number {
  if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return 0
  return Math.min(frameDeltaMs / TILT_LABYRINTH_BASE_FRAME_MS, TILT_LABYRINTH_MAX_FRAME_SCALE)
}
