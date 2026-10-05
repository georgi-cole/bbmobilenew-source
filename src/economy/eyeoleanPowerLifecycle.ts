import type { AppDispatch, RootState } from '../store/store'
import {
  activateStoreNominationProtection,
  canStoreNominationProtectionAffectPlayer,
  clearStoreNominationProtection,
} from '../store/gameSlice'
import {
  armEyeoleanStorePower,
  returnEyeoleanStorePower,
  selectCurrentProfile,
  getEyeoleanPowerSeasonProgress,
} from '../store/profilesSlice'
import { getEyeoleanStoreProduct, type EyeoleanStoreProductKey } from './storeCatalog'
import {
  getEyeoleanPowerArmAvailability,
  getEyeoleanPowerModeResolution,
  isEyeoleanPowerDisarmLocked,
} from './eyeoleanPowerRules'

export interface EyeoleanPowerCommandResult {
  ok: boolean
  message: string
}

export function armEyeoleanPower(productKey: EyeoleanStoreProductKey, selectedTargetId?: string) {
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

    const product = getEyeoleanStoreProduct(productKey)
    const seasonProgress = getEyeoleanPowerSeasonProgress(
      profile,
      productKey,
      state.game.gameId,
      state.game.season
    )
    if (seasonProgress.uses >= product.maxSeasonUses) {
      return {
        ok: false,
        message: `Season limit reached: ${product.maxSeasonUses}/${product.maxSeasonUses} uses.`,
      }
    }

    const availability = getEyeoleanPowerArmAvailability(state.game, productKey)
    if (!availability.available) {
      return { ok: false, message: availability.reason }
    }

    const targetId =
      productKey === 'immunity'
        ? state.game.players.find((player) => player.isUser)?.id
        : productKey === 'protection'
          ? selectedTargetId
          : undefined
    if (
      productKey === 'protection' &&
      (!targetId || targetId === state.game.players.find((p) => p.isUser)?.id)
    ) {
      return { ok: false, message: 'Protection must be assigned to another active player.' }
    }
    if (
      (productKey === 'immunity' || productKey === 'protection') &&
      (!targetId || !canStoreNominationProtectionAffectPlayer(state.game, targetId))
    ) {
      return {
        ok: false,
        message:
          'That player is not eligible to be nominated in this ceremony, so the power would have no effect.',
      }
    }

    dispatch(
      armEyeoleanStorePower({
        productKey,
        gameId: state.game.gameId,
        season: state.game.season,
        week: state.game.week,
        ...(targetId ? { targetId } : {}),
      })
    )

    if (productKey === 'immunity' || productKey === 'protection') {
      dispatch(
        activateStoreNominationProtection({
          productKey,
          targetId: targetId!,
          week: state.game.week,
        })
      )
    }

    const reservation = selectCurrentProfile(getState())?.eyeoleanPowerReservations?.[productKey]
    if (!reservation || reservation.gameId !== state.game.gameId) {
      return { ok: false, message: 'The power could not be armed.' }
    }

    const rule = getEyeoleanPowerModeResolution(state.game, productKey).rule
    return { ok: true, message: rule?.available ? rule.armMessage : 'Power armed.' }
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
        message:
          getEyeoleanPowerModeResolution(state.game, productKey).mode === 'vox'
            ? 'Today’s nomination is locked. This power cannot be disarmed until it resolves.'
            : 'Tonight’s vote is locked. This power cannot be disarmed until it resolves.',
      }
    }

    dispatch(
      returnEyeoleanStorePower({
        productKey,
        gameId: reservation.gameId,
      })
    )
    if (productKey === 'immunity' || productKey === 'protection') {
      dispatch(clearStoreNominationProtection(productKey))
    }

    return {
      ok: true,
      message: 'Power returned to your inventory.',
    }
  }
}
