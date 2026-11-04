import gardenBackdrop from '../../assets/finale/final-power-battle-backyard.webp'
import { joinPublicAssetPath } from '../../utils/avatar'

/**
 * Source-of-truth for the Final Three garden, Eye, glass monitor and mist.
 * Public paths are kept raw as well as resolved for the approved close-camera
 * decision loader, which resolves every public asset exactly once.
 */
export const FINAL_THREE_SET_PUBLIC_ASSETS = {
  eye: 'assets/ceremonies/final-decision/token.webp',
  monitor: 'assets/ceremonies/final-decision/monitor.webp',
  mist: 'assets/ceremonies/vfx/natural-mist-v2.webp',
  podium: 'assets/dressing-room/profile-podium.webp',
} as const

export const FINAL_THREE_SET_ASSETS = {
  background: gardenBackdrop,
  eye: joinPublicAssetPath(FINAL_THREE_SET_PUBLIC_ASSETS.eye),
  monitor: joinPublicAssetPath(FINAL_THREE_SET_PUBLIC_ASSETS.monitor),
  mist: joinPublicAssetPath(FINAL_THREE_SET_PUBLIC_ASSETS.mist),
  podium: joinPublicAssetPath(FINAL_THREE_SET_PUBLIC_ASSETS.podium),
} as const
