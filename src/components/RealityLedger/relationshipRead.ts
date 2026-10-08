import type { RelationshipsMap } from '../../social/types'
import type { DirectedRelationship } from '../../social/reality'

function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function tension(edge: DirectedRelationship): number {
  return Math.round(
    Math.max(0, Math.min(100, edge.resentment * 0.45 + edge.suspicion * 0.35 + edge.fear * 0.2))
  )
}

export function combinedLiveRelationship(
  relationships: RelationshipsMap | undefined,
  humanId: string,
  otherId: string
): { affinity: number; tags: Set<string> } | null {
  const outward = relationships?.[humanId]?.[otherId]
  if (!outward) return null
  return { affinity: outward.affinity, tags: new Set(outward.tags ?? []) }
}

export function liveRelationshipLabel(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): string {
  const perceivedLabel =
    edge.perceivedLabel === 'UNKNOWN'
      ? 'Still forming'
      : edge.perceivedLabel
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
  if (!live) {
    return perceivedLabel
  }
  const tags = live.tags
  if (tags.has('ex') || tags.has('broken_romance')) return '💔 Ex'
  if (tags.has('betrayal') || tags.has('broken_promise')) return 'Betrayed'
  if (tags.has('broken_alliance')) return 'Broken alliance'
  if (tags.has('rivalry') || tags.has('target')) return 'Rival'
  if (tags.has('romance')) return 'Romance'
  if (tags.has('bromance')) return 'Ride-or-die'
  if (tags.has('alliance') || tags.has('cupid_partner')) return 'Ally'
  if (live.affinity >= 55) return 'Close'
  if (live.affinity >= 20) return 'Friendly'
  if (live.affinity <= -45) return 'Hostile'
  if (live.affinity <= -15) return 'Tense'
  return perceivedLabel
}

export function liveRelationshipMetrics(
  edge: DirectedRelationship,
  live: ReturnType<typeof combinedLiveRelationship>
): Array<[string, number]> {
  if (!live) {
    return [
      ['Trust', edge.trust],
      ['Warmth', edge.warmth],
      ['Loyalty', edge.loyalty],
      ['Respect', edge.respect],
      ['Tension', tension(edge)],
    ]
  }
  const broken =
    live.tags.has('ex') ||
    live.tags.has('broken_romance') ||
    live.tags.has('broken_alliance') ||
    live.tags.has('betrayal') ||
    live.tags.has('broken_promise')
  const affinity = broken ? Math.min(-50, live.affinity) : live.affinity
  const trust = clampRelationship(edge.trust * 0.6 + affinity * 0.4)
  const warmth = clampRelationship(edge.warmth * 0.5 + affinity * 0.5)
  const loyalty = clampRelationship(
    broken ? Math.min(edge.loyalty, affinity) : edge.loyalty * 0.55 + affinity * 0.45
  )
  const respect = clampRelationship(edge.respect * 0.7 + affinity * 0.3)
  const liveTension = affinity < 0 ? Math.min(100, Math.abs(affinity) + (broken ? 30 : 8)) : 0
  return [
    ['Trust', trust],
    ['Warmth', warmth],
    ['Loyalty', loyalty],
    ['Respect', respect],
    ['Tension', Math.max(tension(edge), liveTension)],
  ]
}
