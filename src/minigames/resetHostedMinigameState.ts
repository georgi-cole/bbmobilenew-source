import { HOSTED_MINIGAME_RESET_ACTIONS } from './sessionReducers'
import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'

const hostedMinigameResetters = HOSTED_MINIGAME_RESET_ACTIONS

/**
 * Clears feature-owned state before MinigameHost mounts a new attempt.
 *
 * React minigames mount after the host countdown. Without this boundary, a
 * remount can briefly read the prior attempt's completed Redux state and report
 * it again before its own initialization effect runs.
 */
export function resetHostedMinigameState(
  dispatch: Dispatch<UnknownAction>,
  reactComponentKey?: string
) {
  const reset = reactComponentKey
    ? hostedMinigameResetters[reactComponentKey as keyof typeof hostedMinigameResetters]
    : undefined
  if (reset) dispatch({ type: reset })
}

/** Clears every feature-owned minigame session when a whole season is reset. */
export function resetAllHostedMinigameState(dispatch: Dispatch<UnknownAction>) {
  for (const reset of Object.values(hostedMinigameResetters)) {
    dispatch({ type: reset })
  }
}
