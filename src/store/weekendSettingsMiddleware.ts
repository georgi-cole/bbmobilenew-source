import type { Middleware } from '@reduxjs/toolkit'
import { setWeekendsEnabledForSeason } from './gameSlice'
import type { AppDispatch, RootState } from './store'
import { finishWeekendDebugPreview } from '../features/weekend/weekendDebugPreview'

/** Keep the saved preference authoritative across hydration and season resets. */
export const weekendSettingsMiddleware: Middleware = (api) => {
  let reconciling = false
  return (next) => (action) => {
    const reconcile = () => {
      const state = api.getState() as RootState
      const locked = state.game.firstRealWeekendStarted === true || state.game.week >= 6
      const enabled = locked
        ? state.game.weekendsEnabledForSeason !== false
        : state.settings.gameUX.weekendsEnabled !== false
      if (!enabled && state.game.weekendInterlude?.debug) {
        finishWeekendDebugPreview()(api.dispatch as AppDispatch, api.getState)
      }
      const game = (api.getState() as RootState).game
      if (
        game.weekendsEnabledForSeason !== enabled ||
        (game.phase === 'season_start' && game.weekendsEnabledAtSeasonStart !== enabled) ||
        (!enabled && game.weekendInterlude?.active)
      ) {
        api.dispatch(setWeekendsEnabledForSeason(enabled))
      }
    }
    // Reconcile before progression as well as after preference/load/reset actions.
    // The synchronization action itself must not recursively reconcile old state.
    if (reconciling || setWeekendsEnabledForSeason.match(action)) return next(action)
    const synchronize = () => {
      reconciling = true
      try {
        reconcile()
      } finally {
        reconciling = false
      }
    }
    synchronize()
    const result = next(action)
    synchronize()
    return result
  }
}
