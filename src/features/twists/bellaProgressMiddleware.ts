import type { Middleware } from '@reduxjs/toolkit'
import {
  recordBellaEncountered,
  recordBellaTwinShockConsumed,
  type ProfilesState,
} from '../../store/profilesSlice'
import type { GameState } from '../../types'
import { BELLA_ID } from './bellasWill'

type BellaProgressState = {
  game: GameState
  profiles: ProfilesState
}

/**
 * Permanent Bella discovery state belongs to the selected profile, not the
 * bounded season archive. Persist the two irreversible events as soon as they
 * happen so an app restart or abandoned season cannot replay the debut cadence.
 */
export const bellaProgressMiddleware: Middleware = (api) => (next) => (action) => {
  const before = api.getState() as BellaProgressState
  const result = next(action)
  const after = api.getState() as BellaProgressState

  if (after.profiles.isGuest || !after.profiles.activeProfileId) return result

  if (!before.game.twinShockConsumed && after.game.twinShockConsumed) {
    api.dispatch(recordBellaTwinShockConsumed())
  }

  const beforeBella = before.game.players.some((player) => player.id === BELLA_ID)
  const afterBella =
    after.game.players.some((player) => player.id === BELLA_ID) &&
    after.game.bellaWill?.debugCastForced !== true
  if (!beforeBella && afterBella) {
    api.dispatch(recordBellaEncountered())
  }

  return result
}
