/** Complete, immutable player looks. These are never AI houseguests. */
export type AppearanceRole = 'casual' | 'main' | 'grey' | 'formal' | 'sad' | 'paparazzi'

export type AppearanceSelection =
  | { kind: 'legacy' }
  | { kind: 'catalog'; lookId: string; revision: 1 }

export interface AppearanceLook {
  id: string
  revision: 1
  label: string
  folder: string
  selectable: boolean
  /** Horizontal correction measured from the cutout's lower-body/foot bounds. */
  footCenterXPercent: number
  /** Transparent margin below the visible shoe/foot pixels in the source cutout. */
  footBottomPercent: number
  /** Transparent margin above the head in the casual cutout. */
  headTopPercent: number
}

// Measured from the 1st-99th percentile of visible pixels (alpha > 128) in the
// bottom 10 percent of each casual.webp cutout. This ignores stray soft-alpha
// edge pixels while keeping the shoe position centered on both podiums.
const CUTOUT_FOOT_CENTER_X_PERCENT: Record<number, number> = {
  1: -1.69,
  2: 0.98,
  3: 0.98,
  4: 6.64,
  5: 3.45,
  6: 3.65,
  7: 8.72,
  8: 9.44,
  9: 2.47,
  10: -8.46,
  11: -9.96,
  12: 8.4,
  13: 9.31,
  14: 10.48,
  15: 10.35,
  16: 10.29,
  17: 10.09,
  18: 8.33,
  19: 12.04,
  20: 6.25,
  21: 0,
  22: 5.34,
  23: 10.87,
  24: -6.9,
  25: 10.61,
  26: 6.25,
  27: 8.66,
}

const CUTOUT_FOOT_BOTTOM_PERCENT: Record<number, number> = {
  1: 2.69,
  2: 3.39,
  3: 3.73,
  4: 3.65,
  5: 3.21,
  6: 2.86,
  7: 1.3,
  8: 3.21,
  9: 2.43,
  10: 2.26,
  11: 3.39,
  12: 3.65,
  13: 3.21,
  14: 3.39,
  15: 3.04,
  16: 3.56,
  17: 3.56,
  18: 3.65,
  19: 2.26,
  20: 3.21,
  21: 0.78,
  22: 2.08,
  23: 3.65,
  24: 1.48,
  25: 1.74,
  26: 2.95,
  27: 2.78,
}

const CUTOUT_HEAD_TOP_PERCENT: Record<number, number> = {
  1: 2,
  2: 1.82,
  3: 1.74,
  4: 3.47,
  5: 1.22,
  6: 0.69,
  7: 0.78,
  8: 0.61,
  9: 0.61,
  10: 1.22,
  11: 1.22,
  12: 0.78,
  13: 0.69,
  14: 0.52,
  15: 0.52,
  16: 0.87,
  17: 0.95,
  18: 0.52,
  19: 0.61,
  20: 1.82,
  21: 0.61,
  22: 1.04,
  23: 0.52,
  24: 1.13,
  25: 0.69,
  26: 0.87,
  27: 0.61,
}

const PORTRAIT_REPAIR_VERSION = '20261026'

function hasRepairedPortrait(number: number, role: AppearanceRole): boolean {
  return (
    (number === 2 && role === 'sad') ||
    (number >= 20 && number <= 27 && (role === 'main' || role === 'sad')) ||
    (number === 27 && role === 'grey')
  )
}

export const APPEARANCE_LOOKS: readonly AppearanceLook[] = Array.from(
  { length: 27 },
  (_, index) => {
    const number = index + 1
    return {
      id: `pc-${String(number).padStart(3, '0')}`,
      revision: 1,
      label: `Look ${number}`,
      folder: `character ${number}`,
      selectable: true,
      footCenterXPercent: CUTOUT_FOOT_CENTER_X_PERCENT[number] ?? 0,
      footBottomPercent: CUTOUT_FOOT_BOTTOM_PERCENT[number] ?? 0,
      headTopPercent: CUTOUT_HEAD_TOP_PERCENT[number] ?? 0,
    }
  }
)

export const SELECTABLE_LOOKS = APPEARANCE_LOOKS.filter((look) => look.selectable)

export function getAppearanceLook(lookId: string, revision: number): AppearanceLook | null {
  return APPEARANCE_LOOKS.find((look) => look.id === lookId && look.revision === revision) ?? null
}

export function coerceAppearanceSelection(value: unknown): AppearanceSelection {
  if (!value || typeof value !== 'object') return { kind: 'legacy' }
  const selection = value as Record<string, unknown>
  if (selection.kind === 'catalog' && typeof selection.lookId === 'string') {
    const look = getAppearanceLook(selection.lookId, Number(selection.revision))
    if (look) return { kind: 'catalog', lookId: look.id, revision: look.revision }
  }
  return { kind: 'legacy' }
}

export function getAppearanceAsset(
  selection: AppearanceSelection | null | undefined,
  role: AppearanceRole
): string | null {
  if (selection?.kind !== 'catalog') return null
  const look = getAppearanceLook(selection.lookId, selection.revision)
  if (!look) return null
  const version = hasRepairedPortrait(Number(look.id.slice(3)), role)
    ? `?v=${PORTRAIT_REPAIR_VERSION}`
    : ''
  return `assets/player_characters/${encodeURIComponent(look.folder)}/${role}.webp${version}`
}

/** Recognize only published catalogue files, not arbitrary URLs or usernames. */
export function appearanceFromAssetUrl(
  source: string | null | undefined
): AppearanceSelection | null {
  if (!source) return null
  const match = source.match(
    /(?:^|\/)assets\/player_characters\/character(?:%20| )([1-9]|1\d|2[0-7])\/(?:casual|main|grey|formal|sad|paparazzi)\.webp(?:[?#].*)?$/i
  )
  if (!match) return null
  const look = getAppearanceLook(`pc-${match[1].padStart(3, '0')}`, 1)
  return look ? { kind: 'catalog', lookId: look.id, revision: look.revision } : null
}
