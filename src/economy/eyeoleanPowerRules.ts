import type { GameState } from '../types'
import type { EyeoleanStoreProductKey } from './storeCatalog'

export interface EyeoleanPowerAvailability {
  available: boolean
  reason: string
}

export function getActiveHousemateCount(game: GameState): number {
  return game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    .length
}

export function isEyeoleanPowerEndgameLocked(game: GameState): boolean {
  return getActiveHousemateCount(game) <= 4 || Boolean(game.seasonFinale)
}

export function getEyeoleanPowerArmAvailability(
  game: GameState,
  productKey: EyeoleanStoreProductKey
): EyeoleanPowerAvailability {
  const human = game.players.find((player) => player.isUser)
  if (!human || human.status === 'evicted' || human.status === 'jury') {
    return { available: false, reason: 'Unavailable after you leave the House.' }
  }
  if (isEyeoleanPowerEndgameLocked(game)) {
    return {
      available: false,
      reason: 'Voting powers are disabled from Final 4 onward.',
    }
  }
  if (game.phase === 'live_vote' || game.phase === 'eviction_results') {
    return {
      available: false,
      reason: 'Tonight’s vote is already locked. Arm this for a later eviction.',
    }
  }
  if (game.mode === 'survival') {
    return { available: false, reason: 'This voting power is for Classic house evictions.' }
  }

  return {
    available: true,
    reason:
      productKey === 'extra_vote'
        ? 'Arms one extra ballot for your next eligible standard eviction.'
        : 'Arms one vote reduction for the next eligible eviction where you are nominated.',
  }
}

export function isStandardEyeoleanPowerEviction(game: GameState): boolean {
  if (game.mode === 'survival') return false
  if (isEyeoleanPowerEndgameLocked(game)) return false
  if (game.doubleEviction?.weekActive === true) return false
  if (game.cupidArrow?.status === 'active') return false
  if (game.voxPopuli?.status === 'active') return false
  return true
}

export function canTriggerStoreExtraVote(game: GameState): boolean {
  if (!isStandardEyeoleanPowerEviction(game) || game.phase !== 'live_vote') return false
  const human = game.players.find((player) => player.isUser)
  if (!human || !game.awaitingHumanVote) return false
  if (game.humanDoubleVoteActive || game.awaitingDoubleVoteOffer) return false
  if (game.batteryLowVoteEffects?.[human.id]?.type === 'doubleVote') return false
  if (
    game.bellaWill?.active &&
    game.bellaWill.inherited &&
    game.bellaWill.extraVotePending &&
    game.bellaWill.heirId === human.id
  ) {
    return false
  }
  return true
}

export function canTriggerStoreVoteRemoval(game: GameState): boolean {
  if (!isStandardEyeoleanPowerEviction(game) || game.phase !== 'eviction_results') return false
  const human = game.players.find((player) => player.isUser)
  if (!human || !game.nomineeIds.includes(human.id)) return false
  if (game.voteResultsMode === 'public' || !game.voteResults) return false
  if ((game.voteResults[human.id] ?? 0) <= 0) return false
  if (game.awaitingVoteDeductionPrompt) return false
  if (
    game.bellaWill?.active &&
    game.bellaWill.inherited &&
    game.bellaWill.voteRemovalPending &&
    game.bellaWill.heirId === human.id
  ) {
    return false
  }
  if (
    game.bellaWill?.lastVoteRemovalAdjustment?.week === game.week &&
    game.bellaWill.lastVoteRemovalAdjustment.targetId === human.id
  ) {
    return false
  }
  return true
}

export function isEyeoleanPowerDisarmLocked(game: GameState): boolean {
  return game.phase === 'live_vote' || game.phase === 'eviction_results'
}
