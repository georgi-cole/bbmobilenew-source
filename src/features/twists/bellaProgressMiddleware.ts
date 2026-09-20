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

  const actionType =
    typeof action === 'object' && action !== null && 'type' in action
      ? String((action as { type: unknown }).type)
      : ''
  // Profile selection temporarily keeps the previous profile's game in memory
  // until reset/hydration completes. Never migrate Bella progress on that transient step.
  const profileSelectionAction =
    actionType === 'profiles/selectActiveProfile' ||
    actionType === 'profiles/createProfile' ||
    actionType === 'profiles/enterGuestMode'
  if (profileSelectionAction) return result

  const activeProfile = after.profiles.profiles.find(
    (profile) => profile.id === after.profiles.activeProfileId
  )
  const progress = activeProfile?.bellaProgress

  if (
    after.game.twinShockConsumed &&
    (before.game.twinShockConsumed !== after.game.twinShockConsumed ||
      progress?.twinShockConsumedEver !== true)
  ) {
    api.dispatch(recordBellaTwinShockConsumed())
  }

  const afterBella =
    after.game.players.some((player) => player.id === BELLA_ID) &&
    after.game.bellaWill?.debugCastForced !== true
  if (afterBella && progress?.unlocked !== true) {
    api.dispatch(recordBellaEncountered())
  }

  return result
}
