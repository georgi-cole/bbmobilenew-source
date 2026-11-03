import type { PolicyContext } from './types'
import {
  resolveActorStrategicRead,
  resolveStrategicModeContext,
  type StrategicGameRead,
} from './strategicModeContext'

export interface StrategicPlanningRead {
  rules: ReturnType<typeof resolveStrategicModeContext>
  actor: ReturnType<typeof resolveActorStrategicRead>
}

/** Read-only adapter. Live preference changes require a separate explicit opt-in. */
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
