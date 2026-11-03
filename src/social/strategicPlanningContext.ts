import type { PolicyContext } from './types'
import {
  resolveActorStrategicRead,
  resolveStrategicModeContext,
  type StrategicGameRead,
} from './strategicModeContext'

/** Opt-in diagnostic adapter for future planners. Live policy ignores this data. */
export function withStrategicPlanningContext(
  context: PolicyContext,
  game: StrategicGameRead,
  actorId: string
) {
  return {
    ...context,
    strategicContext: {
      rules: resolveStrategicModeContext(game),
      actor: resolveActorStrategicRead(game, actorId),
    },
  }
}
