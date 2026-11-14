export function clampDockAnchor(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

export function dockBounds(height: number, safeTop = 0, safeBottom = 0, offset = 0) {
  const min = offset + Math.max(0, safeTop) + 10
  return { min, max: Math.max(min, offset + height - Math.max(0, safeBottom) - 44 - 10) }
}
