import type { Middleware } from '@reduxjs/toolkit'
import type { GameState } from '../types'
import { applyFirstSeasonAppearance } from './gameSlice'
import { createProfile, updateProfile, type ProfilesState } from './profilesSlice'

type ProfileAppearanceState = { game: GameState; profiles: ProfilesState }

/** Registration can fill a guest's first look, but editing an existing look is next-season only. */
export const profileAppearanceMiddleware: Middleware = (api) => (next) => (action) => {
  if (!createProfile.match(action) && !updateProfile.match(action)) return next(action)

  const before = api.getState() as ProfileAppearanceState
  const result = next(action)
  const current = api.getState() as ProfileAppearanceState
  const profile = current.profiles.profiles.find(
    (entry) => entry.id === current.profiles.activeProfileId
  )
  if (
    !profile ||
    current.profiles.isGuest ||
    !before.game.gameId ||
    current.game.gameId !== before.game.gameId
  )
    return result

  const adoptedGuest =
    createProfile.match(action) &&
    before.profiles.isGuest &&
    !before.profiles.profiles.some((entry) => entry.id === profile.id)
  const selectedLook =
    updateProfile.match(action) &&
    action.payload.appearanceSelection?.kind === 'catalog' &&
    !before.profiles.isGuest &&
    before.profiles.activeProfileId === profile.id
  if (adoptedGuest || selectedLook) {
    const appearance = profile.initialAppearanceSelection ?? profile.appearanceSelection
    if (appearance?.kind === 'catalog')
      api.dispatch(applyFirstSeasonAppearance({ gameId: before.game.gameId, appearance }))
  }
  return result
}
