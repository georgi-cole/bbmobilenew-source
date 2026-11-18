import { processSocialParticipationDay } from './socialParticipationEffects'
import { socialAIDriver } from './socialAIDriver'
import { runAiFacadeNegotiation } from './aiFacadeStrategy'
import type { AppDispatch, RootState } from '../store/store'
import type { Middleware } from '@reduxjs/toolkit'
import type { SocialActionLogEntry } from './types'
import { processSocialStrategyAction } from './socialStrategyActions'
import { queueSocialStrategyInvitation } from './socialStrategyInvitation'
import { processSocialStrategyDayEnd } from './socialStrategyPressure'
import type { DayEndPlan, StrategyState } from './socialStrategyShared'

export { deriveBehaviorPressure } from './socialStrategyPressure'

/**
 * Additive bridge between the social simulation and the existing strategic AI.
 * Nominations, Safety and votes remain owned by the core game engine; this layer
 * only changes the Reality relationship graph that already feeds those decisions.
 */
export const socialStrategyMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) return next(action)

  const type = String((action as { type: string }).type)
  const before = api.getState() as StrategyState
  let dayEndPlan: DayEndPlan | null = null

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    processSocialParticipationDay(api, before as RootState)
    dayEndPlan = processSocialStrategyDayEnd(api, before)
  }

  const result = next(action)
  const after = api.getState() as StrategyState

  if (type === 'game/advance' && before.game.phase === 'eviction_results') {
    queueSocialStrategyInvitation(api, after, dayEndPlan)
  }

  if (type === 'game/advance' && before.game.phase !== after.game.phase) {
    socialAIDriver.runStrategicCheckpoint()
    runAiFacadeNegotiation(api.dispatch as AppDispatch, api.getState as () => RootState)
  }

  if (type === 'social/recordSocialAction') {
    const entry = (action as unknown as { payload: { entry: SocialActionLogEntry } }).payload.entry
    processSocialStrategyAction(api, after, entry)
  }

  return result
}
