import type { GameState } from '../types'
import { isBeforeInitialNominations } from './lohConsultationCopy'

export type LohDecisionStage = 'opening' | 'conditional_replacement' | 'replacement' | 'locked'

/** The Safety save has happened, but the LOH has not named the backup nominee. */
export function isLohReplacementPending(game: {
  phase?: string | null
  replacementNeeded?: boolean
  aiReplacementStep?: number
}): boolean {
  return (
    game.phase === 'pos_ceremony_results' &&
    (game.replacementNeeded === true || (game.aiReplacementStep ?? 0) > 0)
  )
}

export function getLohDecisionStage(game: {
  phase?: string
  replacementNeeded?: boolean
  aiReplacementStep?: number
}): LohDecisionStage {
  if (isBeforeInitialNominations(game.phase)) return 'opening'
  if (isLohReplacementPending(game)) return 'replacement'
  if (['pos_ceremony_results', 'social_2', 'live_vote'].includes(game.phase ?? '')) return 'locked'
  return 'conditional_replacement'
}

export function getLohDecisionKey(
  game: GameState,
  targetId: string | null,
  eligibleIds: readonly string[]
): string {
  const stage = getLohDecisionStage(game)
  return JSON.stringify([
    stage,
    game.lohNominationPlan?.revision ?? 1,
    game.doubleEviction?.weekActive === true,
    game.posWinnerId,
    game.povSavedId,
    stage === 'opening' ? [] : [...game.nomineeIds].sort(),
    targetId,
    [...eligibleIds].sort(),
  ])
}
