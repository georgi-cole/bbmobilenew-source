import type { CSSProperties } from 'react'
import { FINAL_THREE_SET_ASSETS } from '../FinalThreeStage/finalThreeSetAssets'

/** Legacy public alias; the Final Two now renders the shared garden directly. */
export const FINAL_TWO_HUB_BACKDROP_SRC = FINAL_THREE_SET_ASSETS.background

export const FINAL_TWO_HUB_BACKDROP_STYLE = {
  '--final-two-hub-backdrop': `url("${FINAL_TWO_HUB_BACKDROP_SRC}")`,
} as CSSProperties
