import type { Middleware } from '@reduxjs/toolkit'
import {
  recordBellaCompatibleClassicCompleted,
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
  const archives = after.game.seasonArchives ?? []
  const archivedBellaSeasons = archives
    .filter(
      (archive) =>
        archive.bellaCast === true &&
        archive.cupidArrowActivated !== true &&
        archive.voxPopuliActivated !== true
    )
    .map((archive) => archive.seasonIndex)
    .sort((left, right) => left - right)
  const firstArchivedBellaSeason = archivedBellaSeasons[0] ?? null
  const archivedSkipConsumed =
    firstArchivedBellaSeason != null &&
    archives.some(
      (archive) =>
        archive.seasonIndex > firstArchivedBellaSeason &&
        archive.cupidArrowActivated !== true &&
        archive.voxPopuliActivated !== true
    )

  if (
    (after.game.twinShockConsumed ||
      archives.some((archive) => archive.twinShockConsumed === true)) &&
    (before.game.twinShockConsumed !== after.game.twinShockConsumed ||
      progress?.twinShockConsumedEver !== true)
  ) {
    api.dispatch(recordBellaTwinShockConsumed())
  }

  const afterBella =
    after.game.players.some((player) => player.id === BELLA_ID) &&
    after.game.bellaWill?.debugCastForced !== true
  const hasArchivedBella = firstArchivedBellaSeason != null
  if (
    (afterBella || hasArchivedBella) &&
    (progress?.unlocked !== true || progress?.hasAppeared !== true)
  ) {
    api.dispatch(recordBellaEncountered())
  }
  if (archivedSkipConsumed && progress?.mandatorySkipConsumed !== true) {
    api.dispatch(recordBellaCompatibleClassicCompleted({ bellaCast: false }))
  }

  return result
}
