import type { AppDispatch, RootState } from '../store/store'
import { purchaseAppearanceLook, selectCurrentProfile } from '../store/profilesSlice'
import { selectIsVipActive } from '../store/vipSlice'
import {
  APPEARANCE_LOOK_PRICE_EYEROS,
  hasAppearanceLookAccess,
  isPaidAppearanceLook,
} from './lookAccess'
import type { LookPurchaseResult } from './LookMarket'

/** Recheck the active profile and entitlement at confirmation, not at modal-open time. */
export function purchaseLookFromMarket(lookId: string, expectedProfileId: string) {
  return (dispatch: AppDispatch, getState: () => RootState): LookPurchaseResult => {
    const state = getState()
    const profile = selectCurrentProfile(state)
    if (!profile || profile.id !== expectedProfileId || !isPaidAppearanceLook(lookId)) {
      return 'unavailable'
    }
    if (hasAppearanceLookAccess(lookId, profile, selectIsVipActive(state))) return 'owned'
    const balance = profile.eyeoleans ?? 0
    if (!Number.isFinite(balance) || balance < APPEARANCE_LOOK_PRICE_EYEROS) return 'insufficient'
    dispatch(purchaseAppearanceLook({ lookId }))
    return selectCurrentProfile(getState())?.unlockedAppearanceLookIds?.includes(lookId)
      ? 'purchased'
      : 'unavailable'
  }
}
