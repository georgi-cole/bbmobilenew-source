export type HintTileSide = 'left' | 'right'

const HINT_LEFT_BREAK_CHANCE_BY_SIDE: Record<HintTileSide, readonly number[]> = {
  left: [35, 10, 1],
  right: [65, 90, 99],
}

/** Returns the percentage shown by The Expert for the left platform breaking. */
export function getHintLeftBreakChance(safeSide: HintTileSide, sameRowHintCount: number): number {
  const tierIndex = Math.min(2, Math.max(0, sameRowHintCount - 1))
  return HINT_LEFT_BREAK_CHANCE_BY_SIDE[safeSide][tierIndex]
}

/**
 * Interprets the displayed clue. Its percentage is currently generated from
 * the actual safe side, so the public hint identifies which side is safe.
 */
export function inferSafeSideFromHint(leftBreakChance: number): HintTileSide {
  return leftBreakChance > 50 ? 'right' : 'left'
}
