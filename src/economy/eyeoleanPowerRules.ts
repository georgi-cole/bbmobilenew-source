import type { GameState } from '../types'
import {
  getEyeoleanPowerModeRule,
  type EyeoleanPowerModeRule,
  type EyeoleanPowerSeasonMode,
  type EyeoleanStoreProductKey,
} from './storeCatalog'

export interface EyeoleanPowerAvailability {
  available: boolean
  reason: string
}

export interface EyeoleanPowerModeResolution {
  mode: EyeoleanPowerSeasonMode | null
  rule: EyeoleanPowerModeRule | null
  unavailableReason: string | null
}

/**
 * The single ruleset gate for Store vote powers. Unsupported formats never
 * receive a fallback Classic interpretation; an inventory item simply remains
 * unarmed for a compatible season.
 */
export function resolveEyeoleanPowerMode(game: GameState): EyeoleanPowerSeasonMode | null {
  if (game.voxPopuli?.status === 'active') return 'vox'
  if (game.mode === 'survival' || game.cupidArrow?.status === 'active') return null
  return 'classic'
}

export function getEyeoleanPowerModeResolution(
  game: GameState,
  productKey: EyeoleanStoreProductKey
): EyeoleanPowerModeResolution {
  const mode = resolveEyeoleanPowerMode(game)
  if (!mode) {
    return {
      mode: null,
      rule: null,
      unavailableReason: 'This voting power is not available in this season format.',
    }
  }

  const rule = getEyeoleanPowerModeRule(productKey, mode)
  return {
    mode,
    rule,
    unavailableReason: rule.available ? null : rule.unavailableReason,
  }
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
  const modeResolution = getEyeoleanPowerModeResolution(game, productKey)
  if (!modeResolution.rule || !modeResolution.rule.available) {
    return {
      available: false,
      reason: modeResolution.unavailableReason ?? 'This power is unavailable in this season.',
    }
  }
  if (
    game.phase === 'live_vote' ||
    game.phase === 'eviction_results' ||
    (game.phase === 'nomination_results' &&
      (modeResolution.rule.votingMoment === 'nomination' || game.awaitingNominations === true))
  ) {
    return {
      available: false,
      reason:
        modeResolution.mode === 'vox'
          ? 'Today’s nomination ballot is already locked. Arm this for a later nomination.'
          : 'The ceremony is already underway. Arm this before a later nomination or vote.',
    }
  }

  return {
    available: true,
    reason: modeResolution.rule.armMessage,
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

export function canTriggerStoreVoxExtraVote(game: GameState): boolean {
  const modeResolution = getEyeoleanPowerModeResolution(game, 'extra_vote')
  if (modeResolution.mode !== 'vox' || !modeResolution.rule?.available) return false
  if (modeResolution.rule.votingMoment !== 'nomination') return false
  if (isEyeoleanPowerEndgameLocked(game)) return false
  if (game.phase !== 'nomination_results' || !game.awaitingNominations) return false
  if (game.storeVoxExtraNominationChoiceActive) return false
  const human = game.players.find((player) => player.isUser)
  return Boolean(human && human.status !== 'evicted' && human.status !== 'jury')
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

export function canTriggerStoreVoxVoteRemoval(game: GameState): boolean {
  const modeResolution = getEyeoleanPowerModeResolution(game, 'remove_vote')
  if (modeResolution.mode !== 'vox' || !modeResolution.rule?.available) return false
  if (modeResolution.rule.votingMoment !== 'nomination') return false
  if (isEyeoleanPowerEndgameLocked(game)) return false
  if (game.phase !== 'nomination_results' || game.awaitingNominations) return false
  const human = game.players.find((player) => player.isUser)
  if (!human || !game.nomineeIds.includes(human.id)) return false
  if ((game.voxPopuli?.nominationVoteCounts[human.id] ?? 0) <= 0) return false
  return Object.values(game.voxPopuli?.nominationBallots ?? {}).some((ballot) =>
    ballot.includes(human.id)
  )
}

export function isEyeoleanPowerDisarmLocked(game: GameState): boolean {
  return (
    game.phase === 'live_vote' ||
    game.phase === 'eviction_results' ||
    (game.phase === 'nomination_results' && game.awaitingNominations === true)
  )
}
