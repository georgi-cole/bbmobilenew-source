import type { AppDispatch, RootState } from '../../store/store'
import { showRewarded, type AdPlacement } from '../../services/ads/adsService'
import { getAdAvailabilityMessage, setAdRequestFailure } from '../../services/ads/adAvailability'

/** Keep reward prompts dismissible after cancellation, no fill, or a rejected request. */
export function requestRewardedPrompt({
  placement,
  state,
  dispatch,
  onReward,
  setPending,
  isFinal3Week,
}: {
  placement: AdPlacement
  state: RootState
  dispatch: AppDispatch
  onReward: () => void
  setPending: (pending: boolean) => void
  isFinal3Week?: boolean
}): boolean {
  let rewarded = false
  const dismissed = () => {
    setPending(false)
    if (!rewarded)
      setAdRequestFailure(
        getAdAvailabilityMessage() ??
          'The ad did not complete. You can try again or continue without the reward.'
      )
  }
  setPending(true)
  const requested = showRewarded(
    placement,
    state,
    dispatch,
    () => {
      rewarded = true
      setAdRequestFailure(null)
      try {
        onReward()
      } finally {
        setPending(false)
      }
    },
    { isFinal3Week, onDismissed: dismissed }
  )
  if (!requested) dismissed()
  return requested
}
