import type { Player } from '../../types'

export const BATTLE_BACK_EXCLUDED_PLAYER_IDS = new Set(['bella'])
export const BATTLE_BACK_RETRY_LIMIT = 3

export type BattleBackActivationSource =
  | 'human-guarantee'
  | 'ai-director'
  | 'legacy-random'
  | 'forced-debug'
  | 'manual'

export function isBattleBackEligiblePlayer(
  player: Player,
  options: { allowLegacyEvicted?: boolean } = {}
): boolean {
  if (BATTLE_BACK_EXCLUDED_PLAYER_IDS.has(player.id)) return false
  if (player.tribunalEligible === false) return false
  if (player.status === 'jury') return true
  return options.allowLegacyEvicted === true && player.status === 'evicted'
}

export function getBattleBackEligiblePlayers(players: readonly Player[]): Player[] {
  return players.filter((player) => isBattleBackEligiblePlayer(player))
}

/**
 * Resolve the authoritative stored candidate pool. Normal activation only stores
 * current Tribunal members; legacy saves may contain an already-stored candidate
 * whose status was serialized as evicted, so the compatibility exception is
 * deliberately limited to IDs already present in the Battle Back session.
 */
export function getStoredBattleBackCandidates(
  players: readonly Player[],
  candidateIds: readonly string[]
): Player[] {
  const ids = new Set(candidateIds)
  return players.filter(
    (player) =>
      ids.has(player.id) &&
      isBattleBackEligiblePlayer(player, {
        allowLegacyEvicted: true,
      })
  )
}

export function sanitizeBattleBackCandidateIds(
  players: readonly Player[],
  candidateIds: readonly string[]
): string[] {
  const eligible = new Set(getBattleBackEligiblePlayers(players).map((player) => player.id))
  return [...new Set(candidateIds)].filter((id) => eligible.has(id))
}
