export type WeekendVisualTheme = 'fireside' | 'party' | 'reunion'

type WeekendVisualThemeSource =
  | {
      active?: boolean
      afterDay?: number
      finaleWeekend?: boolean
      weekendNumber?: 1 | 2 | 3
    }
  | null
  | undefined

export function resolveWeekendVisualTheme(
  weekend: WeekendVisualThemeSource
): WeekendVisualTheme | null {
  if (!weekend?.active) return null
  if (weekend.finaleWeekend) return 'reunion'

  const weekendNumber =
    weekend.weekendNumber ?? (weekend.afterDay === 5 ? 1 : weekend.afterDay === 10 ? 2 : 3)
  if (weekendNumber === 1) return 'fireside'
  if (weekendNumber === 2) return 'party'
  return 'reunion'
}
