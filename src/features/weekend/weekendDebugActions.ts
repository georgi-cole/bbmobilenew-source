import { createAction } from '@reduxjs/toolkit'
import type { GameState } from '../../types'
import type { SocialState } from '../../social/types'
import type { PublicOpinionState } from '../../publicOpinion/types'

export interface WeekendDebugSnapshot {
  game: GameState
  social: SocialState
  publicOpinion: PublicOpinionState
}

export const captureWeekendDebugSnapshot = createAction<WeekendDebugSnapshot>(
  'weekendDebug/captureSnapshot'
)

/** Restore the complete gameplay state after a temporary debug preview. */
export const restoreWeekendDebugSnapshot = createAction<WeekendDebugSnapshot>(
  'weekendDebug/restoreSnapshot'
)
