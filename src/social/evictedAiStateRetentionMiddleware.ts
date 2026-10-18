import type { Middleware } from '@reduxjs/toolkit'
import {
  getEvictedAiIdsReadyForPrivateStatePruning,
  hasEvictedAiPrivateState,
  type EvictedAiRetentionGame,
} from './reality/evictedAiRetention'
import type { RealityDomainState } from './reality/types'
import { pruneEvictedAiPrivateState } from './socialSlice'

interface EvictedAiRetentionState {
  game: EvictedAiRetentionGame
  social: {
    reality?: RealityDomainState | null
    energyBank?: Record<string, number>
    influenceBank?: Record<string, number>
    infoBank?: Record<string, number>
    influenceWeights?: Record<string, unknown>
    socialMemory?: Record<string, Record<string, unknown>>
  }
}

/** Prune inactive AI cognition once the game advances beyond its eviction day. */
export const evictedAiStateRetentionMiddleware: Middleware = (api) => (next) => (action) => {
  const type = (action as { type?: string }).type
  if (type !== 'game/advance' && type !== 'game/advanceWeek') return next(action)

  const before = api.getState() as EvictedAiRetentionState
  const result = next(action)
  const after = api.getState() as EvictedAiRetentionState
  if (after.game.week <= before.game.week || !after.social.reality) return result

  const actorIds = getEvictedAiIdsReadyForPrivateStatePruning(after.game)
  const hasLegacyPrivateState = actorIds.some(
    (actorId) =>
      Object.prototype.hasOwnProperty.call(after.social.energyBank ?? {}, actorId) ||
      Object.prototype.hasOwnProperty.call(after.social.influenceBank ?? {}, actorId) ||
      Object.prototype.hasOwnProperty.call(after.social.infoBank ?? {}, actorId) ||
      Object.prototype.hasOwnProperty.call(after.social.influenceWeights ?? {}, actorId) ||
      Object.prototype.hasOwnProperty.call(after.social.socialMemory ?? {}, actorId) ||
      Object.values(after.social.socialMemory ?? {}).some((targets) =>
        Object.prototype.hasOwnProperty.call(targets, actorId)
      )
  )
  if (hasEvictedAiPrivateState(after.social.reality, actorIds) || hasLegacyPrivateState) {
    api.dispatch(pruneEvictedAiPrivateState(actorIds))
  }
  return result
}
