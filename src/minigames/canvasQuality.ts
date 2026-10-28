const MAX_PIXEL_RATIO = 2
const MAX_CANVAS_PIXELS = 2_000_000

/** Budget backing pixels while preserving CSS coordinates, input and simulation precision. */
export function getMinigamePixelRatio(
  width: number,
  height: number,
  requestedRatio: number
): number {
  const ratio = Number.isFinite(requestedRatio) && requestedRatio > 0 ? requestedRatio : 1
  const area = Math.max(1, width) * Math.max(1, height)
  const budgetRatio = Number.isFinite(area) ? Math.sqrt(MAX_CANVAS_PIXELS / area) : 1
  return Math.max(1, Math.min(MAX_PIXEL_RATIO, ratio, budgetRatio))
}
