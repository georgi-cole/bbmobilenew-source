import type { AppDispatch, RootState } from '../store/store'
import {
  armEyeoleanStorePower,
  returnEyeoleanStorePower,
  selectCurrentProfile,
} from '../store/profilesSlice'
import type { EyeoleanStoreProductKey } from './storeCatalog'
import {
  getEyeoleanPowerArmAvailability,
  isEyeoleanPowerDisarmLocked,
} from './eyeoleanPowerRules'

export interface EyeoleanPowerCommandResult {
  ok: boolean
  message: string
}

export function armEyeoleanPower(productKey: EyeoleanStoreProductKey) {
  return (dispatch: AppDispatch, getState: () => RootState): EyeoleanPowerCommandResult => {
    const state = getState()
    const profile = selectCurrentProfile(state)
    if (!profile) {
      return { ok: false, message: 'Choose a profile before arming a power.' }
    }

    const existing = profile.eyeoleanPowerReservations?.[productKey]
    if (existing) {
      return { ok: false, message: 'That power is already armed.' }
    }

    const quantity = Math.max(0, Math.floor(profile.eyeoleanInventory?.[productKey] ?? 0))
    if (quantity <= 0) {
      return { ok: false, message: 'You do not own this power yet.' }
    }

    const availability = getEyeoleanPowerArmAvailability(state.game, productKey)
    if (!availability.available) {
      return { ok: false, message: availability.reason }
    }

    dispatch(
      armEyeoleanStorePower({
        productKey,
        gameId: state.game.gameId,
        season: state.game.season,
        week: state.game.week,
      })
    )

    const reservation =
      selectCurrentProfile(getState())?.eyeoleanPowerReservations?.[productKey]
    if (!reservation || reservation.gameId !== state.game.gameId) {
      return { ok: false, message: 'The power could not be armed.' }
    }

    return {
      ok: true,
      message:
        productKey === 'extra_vote'
          ? 'Extra Vote armed for your next eligible standard eviction.'
          : 'Remove a Vote armed for the next eligible eviction where you are nominated.',
    }
  }
}

export function disarmEyeoleanPower(productKey: EyeoleanStoreProductKey) {
  return (dispatch: AppDispatch, getState: () => RootState): EyeoleanPowerCommandResult => {
    const state = getState()
    const profile = selectCurrentProfile(state)
    const reservation = profile?.eyeoleanPowerReservations?.[productKey]
    if (!profile || !reservation) {
      return { ok: false, message: 'That power is not armed.' }
    }
    if (isEyeoleanPowerDisarmLocked(state.game)) {
      return {
        ok: false,
        message: 'Tonight’s vote is locked. This power cannot be disarmed until it resolves.',
      }
    }

    dispatch(
      returnEyeoleanStorePower({
        productKey,
        gameId: reservation.gameId,
      })
    )

    return {
      ok: true,
      message: 'Power returned to your inventory.',
    }
  }
}
