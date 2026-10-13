/**
 * relationshipOutline — utility for computing relationship tone from an affinity value.
 *
 * Supports two affinity ranges:
 *   Normalized [-1, 1]: values strictly within -1 to 1 (e.g. -0.75, 0.0, 0.85)
 *   Percent   [0, 100]: values outside the normalized range treated as 0..100
 *
 * Thresholds:
 *   Normalized: > 0.5 → 'good', < -0.5 → 'bad', else → 'neutral'
 *   Percent:   >= 60  → 'good', <= 40  → 'bad', else → 'neutral'
 */

export type RelationshipTone = 'good' | 'neutral' | 'bad' | 'none'
export type RelationshipScale = 'auto' | 'signed' | 'percent' | 'normalized'
export type RelationshipRingTone =
  | 'nemesis'
  | 'hostile'
  | 'strained'
  | 'neutral'
  | 'warm'
  | 'close'
  | 'lovers'
  | 'none'

function signedAffinity(affinity: number, scale: RelationshipScale): number {
  if (scale === 'signed') return Math.max(-100, Math.min(100, affinity))
  if (scale === 'normalized' || (scale === 'auto' && affinity >= -1 && affinity <= 1)) {
    return Math.max(-100, Math.min(100, affinity * 100))
  }
  return Math.max(-100, Math.min(100, (affinity - 50) * 2))
}

/** Richer avatar-ring palette for the overall bond, using only visible tags. */
export function getRelationshipRingTone(
  affinity?: number | null,
  scale: RelationshipScale = 'auto',
  relationshipTags: readonly string[] = []
): RelationshipRingTone {
  if (affinity === undefined || affinity === null || Number.isNaN(affinity)) return 'none'

  const score = signedAffinity(affinity, scale)
  const brokenBond = relationshipTags.some((tag) =>
    ['ex', 'broken_romance', 'broken_alliance', 'betrayal', 'broken_promise'].includes(tag)
  )
  if (score <= -70) return 'nemesis'
  if (score <= -40) return 'hostile'
  if (score <= -12) return 'strained'
  if (relationshipTags.includes('romance') && !brokenBond) return 'lovers'
  if (score >= 42) return 'close'
  if (score >= 12) return 'warm'
  return 'neutral'
}

export function getRelationshipRingLabel(tone: RelationshipRingTone): string | null {
  const labels: Record<Exclude<RelationshipRingTone, 'none'>, string> = {
    nemesis: 'Nemesis',
    hostile: 'Hostile',
    strained: 'Strained',
    neutral: 'Still forming',
    warm: 'Warm',
    close: 'Close',
    lovers: 'Romance',
  }
  return tone === 'none' ? null : labels[tone]
}

/**
 * Compute the relationship tone from an affinity value.
 * Returns 'none' when affinity is undefined, null, or NaN.
 * Auto-detects range: [-1,1] treated as normalized; otherwise treated as 0–100.
 */
export function getRelationshipTone(
  affinity?: number | null,
  scale: RelationshipScale = 'auto'
): RelationshipTone {
  if (affinity === undefined || affinity === null || Number.isNaN(affinity)) {
    return 'none'
  }

  if (scale === 'signed') {
    if (affinity >= 20) return 'good'
    if (affinity < -10) return 'bad'
    return 'neutral'
  }

  if (scale === 'normalized' || (scale === 'auto' && affinity >= -1 && affinity <= 1)) {
    if (affinity > 0.5) return 'good'
    if (affinity < -0.5) return 'bad'
    return 'neutral'
  }

  // Explicit percent, or the legacy auto-detected 0..100 presentation scale.
  if (affinity >= 60) return 'good'
  if (affinity <= 40) return 'bad'
  return 'neutral'
}
