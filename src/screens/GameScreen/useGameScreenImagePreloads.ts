import { useEffect } from 'react'
import confessionalEvictionBackdrop from '../../assets/finale/elimination-living-room.webp'
import finalPowerBattleBackyard from '../../assets/finale/final-power-battle-backyard.webp'
import finalPowerBattleDuel from '../../assets/finale/final-power-battle-duel.webp'
import finalPowerBattleSpectator from '../../assets/finale/final-power-battle-spectator.webp'
import { FINAL_TWO_HUB_BACKDROP_SRC } from '../../components/Final3Ceremony/final3CeremonyAssets'
import {
  CONFESSIONAL_DOOR_SRC,
  CONFESSIONAL_PAINTING_SRC,
  TRIBUNAL_BACKDROP_SRC,
} from '../DiaryRoom/diaryRoomAssets'
import { preloadImages } from '../../utils/preloadImages'

export interface GameScreenImagePreloadState {
  activeConfessionalDecisionKey: string | null
  activeConfessionalDecisionType?: string
  finaleWeekendActive: boolean
  phase: string
}

const VOTE_DECISION_TYPES = new Set(['eviction_vote', 'double_vote', 'tie_break'])

export function useGameScreenImagePreloads({
  activeConfessionalDecisionKey,
  activeConfessionalDecisionType,
  finaleWeekendActive,
  phase,
}: GameScreenImagePreloadState): void {
  useEffect(() => {
    if (!activeConfessionalDecisionKey) return

    const warmConfessionalImages = () =>
      preloadImages([
        CONFESSIONAL_PAINTING_SRC,
        CONFESSIONAL_DOOR_SRC,
        ...(VOTE_DECISION_TYPES.has(activeConfessionalDecisionType ?? '')
          ? [confessionalEvictionBackdrop]
          : []),
      ])

    warmConfessionalImages()
    document.addEventListener('visibilitychange', warmConfessionalImages)
    return () => document.removeEventListener('visibilitychange', warmConfessionalImages)
  }, [activeConfessionalDecisionKey, activeConfessionalDecisionType])

  useEffect(() => {
    if (phase !== 'final4_eviction') return

    const warmFinaleImages = () =>
      preloadImages(
        [
          CONFESSIONAL_PAINTING_SRC,
          CONFESSIONAL_DOOR_SRC,
          finalPowerBattleBackyard,
          finalPowerBattleDuel,
          finalPowerBattleSpectator,
          FINAL_TWO_HUB_BACKDROP_SRC,
        ],
        'low'
      )
    warmFinaleImages()
    document.addEventListener('visibilitychange', warmFinaleImages)
    return () => document.removeEventListener('visibilitychange', warmFinaleImages)
  }, [phase])

  useEffect(() => {
    if (!finaleWeekendActive) return

    const warmTribunalImage = () => preloadImages([TRIBUNAL_BACKDROP_SRC], 'low')
    warmTribunalImage()
    document.addEventListener('visibilitychange', warmTribunalImage)
    return () => document.removeEventListener('visibilitychange', warmTribunalImage)
  }, [finaleWeekendActive])
}
