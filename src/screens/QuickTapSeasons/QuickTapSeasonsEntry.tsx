import { useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectHasPremiumChallengesAccess } from '../../store/vipSlice'
import type { GenericMinigameProps } from '../../minigames/reactComponents'
import QuickTapRaceVip from '../../minigames/quickTapRace/vip/QuickTapRaceVip'
import QuickTapSeasons from './QuickTapSeasons'

export default function QuickTapSeasonsEntry(props: GenericMinigameProps) {
  const hasPremiumChallengesAccess = useAppSelector(selectHasPremiumChallengesAccess)
  const [isVipRun] = useState(() =>
    props.quickTapVariantOverride
      ? props.quickTapVariantOverride === 'vip'
      : (props.vipQuickTap ?? hasPremiumChallengesAccess)
  )
  return isVipRun ? <QuickTapRaceVip {...props} mode="seasons" /> : <QuickTapSeasons {...props} />
}
