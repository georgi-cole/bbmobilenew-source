import { SELECTABLE_LOOKS } from './catalog'

/** Cosmetic access applies to the published look order, not to asset filenames. */
export const FREE_APPEARANCE_LOOK_COUNT = 5
export const APPEARANCE_LOOK_PRICE_EYEROS = 30_000

export function isFreeAppearanceLook(lookId: string): boolean {
  const index = SELECTABLE_LOOKS.findIndex((look) => look.id === lookId)
  return index >= 0 && index < FREE_APPEARANCE_LOOK_COUNT
}

export function isPaidAppearanceLook(lookId: string): boolean {
  const index = SELECTABLE_LOOKS.findIndex((look) => look.id === lookId)
  return index >= FREE_APPEARANCE_LOOK_COUNT
}

export function hasAppearanceLookAccess(
  lookId: string,
  profile: { unlockedAppearanceLookIds?: readonly string[] } | null | undefined,
  isVip: boolean
): boolean {
  if (!SELECTABLE_LOOKS.some((look) => look.id === lookId)) return false
  return isVip || isFreeAppearanceLook(lookId) || Boolean(profile?.unlockedAppearanceLookIds?.includes(lookId))
}
