import type { Player } from '../types'

export interface TribunalConfigLike {
  tribunalSize?: number
  /** Legacy saved-game alias retained for hydration compatibility. */
  jurySize?: number
}

function largestOddAtMost(value: number): number {
  const whole = Math.max(0, Math.floor(value))
  if (whole === 0) return 0
  return whole % 2 === 1 ? whole : whole - 1
}

/**
 * Canonical Tribunal size for a Classic season.
 *
 * The standard 16-player cast uses 9 members, leaving five genuine
 * pre-Tribunal exits before the Final 2. Smaller casts scale down to keep the
 * final vote odd without making Tribunal membership automatic.
 */
export function defaultTribunalSizeForCast(startingCastSize: number): number {
  const castSize = Math.max(2, Math.floor(startingCastSize))
  const desired =
    castSize >= 14 ? 9 : castSize >= 10 ? 7 : castSize >= 8 ? 5 : castSize >= 5 ? 3 : 1
  const maximum = largestOddAtMost(Math.max(0, castSize - 2))
  return Math.min(desired, maximum)
}

/**
 * Resolve a season's locked Tribunal size. `tribunalSize` is canonical;
 * `jurySize` is accepted only so older saves/configs continue to hydrate.
 */
export function resolveTribunalSize(
  startingCastSize: number,
  cfg?: TribunalConfigLike | null
): number {
  const castSize = Math.max(2, Math.floor(startingCastSize))
  const requested = cfg?.tribunalSize ?? cfg?.jurySize

  if (!Number.isFinite(requested)) return defaultTribunalSizeForCast(castSize)

  const maximum = Math.max(0, castSize - 2)
  const clamped = Math.max(0, Math.min(Math.floor(requested as number), maximum))
  if (clamped === 0) return 0

  // The standard rules always keep the Tribunal odd. Legacy even values are
  // normalized down rather than manufacturing an extra voter at the finale.
  return largestOddAtMost(clamped)
}

export function preTribunalExitCount(startingCastSize: number, tribunalSize: number): number {
  return Math.max(0, Math.floor(startingCastSize) - 2 - Math.max(0, Math.floor(tribunalSize)))
}

/**
 * `exitIndex` is zero-based across every committed season exit, not merely
 * players whose current status is "evicted". This keeps the formation boundary
 * stable once the first Tribunal member has joined.
 */
export function shouldJoinTribunal(
  exitIndex: number,
  startingCastSize: number,
  tribunalSize: number
): boolean {
  return exitIndex >= preTribunalExitCount(startingCastSize, tribunalSize)
}

export function isTribunalEligiblePlayer(player: Player): boolean {
  return player.tribunalEligible !== false
}

export function getTribunalMembers(players: readonly Player[]): Player[] {
  return players.filter(
    (player) => player.status === 'jury' && isTribunalEligiblePlayer(player)
  )
}
