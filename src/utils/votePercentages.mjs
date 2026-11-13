const safePercentage = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0)

/** Keep one decimal unless it would turn different results into a displayed tie. */
export function getVotePercentagePrecision(values) {
  const distinct = [...new Set(values.map(safePercentage))]
  for (let precision = 1; precision < 15; precision += 1) {
    if (new Set(distinct.map((value) => value.toFixed(precision))).size === distinct.length)
      return precision
  }
  return 15
}

export function formatVotePercentage(value, precision = 1) {
  return `${safePercentage(value).toFixed(precision)}%`
}
