export const FINAL_EXIT_BRAND_RESOURCE: {
  src: string
  width: number
  height: number
  bytes: number
}
export type FinaleClosingBrandStop = [
  time: number,
  opacity: number,
  transform?: string,
  easing?: string,
]
export function makeFinaleClosingBrandMarkup(
  art: (key: string, className: string, layer?: string) => string
): string
export function animateFinaleClosingBrand(
  animate: (selector: string, stops: FinaleClosingBrandStop[]) => void,
  options?: { startAt?: number; holdUntil?: number; fadeOut?: boolean; flyToBlack?: boolean }
): void
