import type { Middleware } from '@reduxjs/toolkit'
import type { GameState } from '../../types'
import {
  createReplacementPresentationTracker,
  type ReplacementPresentation,
} from './replacementPresentation'

const outcomes = new WeakMap<GameState, ReplacementPresentation | null>()
export const getReplacementPresentation = (game: GameState) => outcomes.get(game) ?? null
export const getReplacementFilmPresentation = (game: GameState) => {
  const outcome = getReplacementPresentation(game)
  return outcome?.owner === 'replacement' ? outcome : null
}

/** Observe committed reducer state, including nested Ambush normalization dispatches.
 * The tracker is per store; snapshots are weakly held and never persist gameplay state.
 */
export const replacementPresentationMiddleware: Middleware = (api) => {
  const tracker = createReplacementPresentationTracker()
  tracker.restore(api.getState().game)
  return (next) => (action) => {
    const before = api.getState().game as GameState
    const result = next(action)
    const game = api.getState().game as GameState
    const actionType =
      typeof action === 'object' && action !== null && 'type' in action ? String(action.type) : ''
    if (actionType === 'game/hydrateGame') {
      tracker.restore(game)
      outcomes.set(game, null)
      return result
    }
    if (game === before) return result
    const replacementRelevant =
      game.gameId !== before.gameId ||
      game.week !== before.week ||
      game.phase !== before.phase ||
      game.mode !== before.mode ||
      game.nomineeIds !== before.nomineeIds ||
      game.povSavedId !== before.povSavedId ||
      game.replacementNeeded !== before.replacementNeeded ||
      game.awaitingPovDecision !== before.awaitingPovDecision ||
      game.awaitingPovSaveTarget !== before.awaitingPovSaveTarget ||
      game.aiReplacementStep !== before.aiReplacementStep ||
      game.specialVeto !== before.specialVeto ||
      game.lohNominationPlan !== before.lohNominationPlan ||
      game.missionPowers?.backupChooserId !== before.missionPowers?.backupChooserId ||
      game.coLohReplacementOwnerId !== before.coLohReplacementOwnerId ||
      game.coLohNomineeByCoLohId !== before.coLohNomineeByCoLohId ||
      game.voxPopuli?.status !== before.voxPopuli?.status ||
      game.cupidArrow?.status !== before.cupidArrow?.status ||
      game.cupidArrow?.pairs !== before.cupidArrow?.pairs
    if (!replacementRelevant) {
      // Broadcast acknowledgements and other unrelated immutable game updates
      // must not drop an already committed presentation before its handoff.
      outcomes.set(game, outcomes.get(before) ?? null)
      return result
    }
    outcomes.set(game, tracker.observe(game))
    return result
  }
}
