import { lazyWithChunkRecovery } from '../../utils/lazyWithChunkRecovery'

export const QuickTapRaceCanvasGame = lazyWithChunkRecovery(
  () => import('./QuickTapRaceCanvasGame')
)
export const QuickTapRaceVip = lazyWithChunkRecovery(() => import('./vip/QuickTapRaceVip'))

export function preloadQuickTapRace(premium: boolean): Promise<void> {
  return premium ? QuickTapRaceVip.preload() : QuickTapRaceCanvasGame.preload()
}
