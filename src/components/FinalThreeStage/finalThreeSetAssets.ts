import gardenBackdrop from '../../assets/finale/final-power-battle-backyard.webp'
import { joinPublicAssetPath } from '../../utils/avatar'

/**
 * One set of source assets for the finale opening, Part 1–3 broadcast, block
 * reveal, power holder and Final Two. The close-camera decision renderer keeps
 * its approved bespoke architecture, but shares this exact Eye, monitor and mist.
 */
export const FINAL_THREE_SET_ASSETS = {
  background: gardenBackdrop,
  eye: joinPublicAssetPath('assets/ceremonies/final-decision/token.webp'),
  monitor: joinPublicAssetPath('assets/ceremonies/final-decision/monitor.webp'),
  mist: joinPublicAssetPath('assets/ceremonies/vfx/natural-mist-v2.webp'),
} as const
