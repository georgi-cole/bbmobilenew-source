import type { GameState } from '../types'

export const SURVIVAL_AD_RECOVERY_LIMIT = 7

function recoveryCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/** Identify one elimination, so delayed ads or purchases cannot revive another run. */
export function getSurvivalRecoveryKey(game: GameState): string | null {
  if (game.mode !== 'survival' || game.status !== 'failed') return null
  const mode = game.modeSpecific?.kind === 'survival' ? game.modeSpecific : null
  const human = game.players.find((player) => player.isUser)
  const runId = game.runId ?? game.gameId
  if (!mode || !runId || !human || !['evicted', 'jury'].includes(human.status)) return null

  return `${runId}:day-${Math.max(mode.currentDay, game.week)}:ad-${recoveryCount(mode.adContinueCount)}:paid-${recoveryCount(mode.paidContinueCount)}`
}

export function getSurvivalAdRecoveriesRemaining(game: GameState): number {
  const used = game.modeSpecific?.kind === 'survival' ? game.modeSpecific.adContinueCount : 0
  return Math.max(0, SURVIVAL_AD_RECOVERY_LIMIT - recoveryCount(used))
}

/** Shared reset for earned ads and explicitly redeemed purchased credits. */
export function applySurvivalRecovery(game: GameState, source: 'ad' | 'paid'): void {
  const mode = game.modeSpecific?.kind === 'survival' ? game.modeSpecific : null
  const human = game.players.find((player) => player.isUser)
  if (!mode || !human) return

  human.status = 'active'
  game.status = 'active'
  game.phase = 'week_start'
  game.pendingEviction = null
  game.evictionSplashId = null
  game.evictionOverlayPlayerId = null
  game.voteResults = null
  game.votes = {}
  game.nomineeIds = []
  game.awaitingHumanVote = false
  game.awaitingTieBreak = false
  game.tiedNomineeIds = null
  game.modeSpecific = {
    ...mode,
    replacementPending: null,
    replacementTransition: null,
    adContinueCount: recoveryCount(mode.adContinueCount) + (source === 'ad' ? 1 : 0),
    paidContinueCount: recoveryCount(mode.paidContinueCount) + (source === 'paid' ? 1 : 0),
  }
}
