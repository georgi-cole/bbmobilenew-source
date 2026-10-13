import type { GameState } from '../types'

/**
 * Reuse a whole GameState value while only its relevant top-level fields are
 * compared. This lets views keep their existing GameState API while skipping
 * renders for unrelated reducer updates.
 */
export function createGameFieldEquality(fields: readonly (keyof GameState)[]) {
  return (previous: GameState, next: GameState): boolean =>
    previous === next || fields.every((field) => previous[field] === next[field])
}
