import { useState } from 'react'
import { useAppSelector } from '../../store/hooks'
import { selectHasPremiumChallengesAccess } from '../../store/vipSlice'
import type { MinigameSession, Player } from '../../types'
import type { QTRTimingDiagnostics } from '../../minigames/quickTapRace/engine/types'
import QuickTapRaceCanvasGame from '../../minigames/quickTapRace/QuickTapRaceCanvasGame'
import QuickTapRaceVip from '../../minigames/quickTapRace/vip/QuickTapRaceVip'
import type { GenericMinigameProps } from '../../minigames/reactComponents'

type HostParticipant = NonNullable<GenericMinigameProps['participants']>[number]

interface Props {
  session?: MinigameSession
  players?: Player[]
  onFinish?: GenericMinigameProps['onFinish']
  seed?: number
  autoStart?: boolean
  vipQuickTap?: boolean
  quickTapVariantOverride?: 'classic' | 'vip'
  participantIds?: string[]
  participants?: HostParticipant[]
  experimental?: {
    seed: number
    onFinish: (result: {
      effectiveScore: number
      rawTaps: number
      modifiers: string[]
      timing: QTRTimingDiagnostics
    }) => void
  }
}

/** Select the rules variant once when the race mounts, then keep it for the run. */
export default function QuickTapRace({
  session,
  players,
  onFinish,
  seed,
  autoStart,
  vipQuickTap,
  quickTapVariantOverride,
  participantIds,
  participants,
  experimental,
}: Props) {
  const hasPremiumChallengesAccess = useAppSelector(selectHasPremiumChallengesAccess)
  const [isVipRun] = useState(() =>
    quickTapVariantOverride === 'vip'
      ? true
      : quickTapVariantOverride === 'classic'
        ? false
        : session?.quickTapVariant === 'vip'
          ? true
          : session?.quickTapVariant === 'classic'
            ? false
            : (vipQuickTap ?? hasPremiumChallengesAccess)
  )

  if (isVipRun) {
    return (
      <QuickTapRaceVip
        session={session}
        players={players}
        onFinish={onFinish}
        seed={seed}
        autoStart={autoStart}
        quickTapVariantOverride={quickTapVariantOverride}
        participantIds={participantIds}
        participants={participants}
      />
    )
  }

  return (
    <QuickTapRaceCanvasGame
      session={session}
      players={players}
      onFinish={onFinish ? (value) => onFinish(value) : undefined}
      seed={seed}
      autoStart={autoStart}
      participantIds={participantIds}
      participants={participants}
      experimental={experimental}
    />
  )
}
