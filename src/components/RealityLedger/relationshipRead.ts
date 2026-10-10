import type { RelationshipsMap } from '../../social/types'
import type { DirectedRelationship } from '../../social/reality'

function clampRelationship(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function tension(edge: DirectedRelationship, currentDay?: number): number {
  const lingeringTension = edge.resentment * 0.45 + edge.suspicion * 0.35 + edge.fear * 0.2
  const elapsedDays = Math.max(
    0,
    (currentDay ?? edge.acuteTensionDay ?? 0) - (edge.acuteTensionDay ?? 0)
  )
  const recentTension = Math.max(0, (edge.acuteTension ?? 0) - elapsedDays * 8)
  return Math.round(Math.max(0, Math.min(100, Math.max(lingeringTension, recentTension))))
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

export function liveRelationshipMetrics(
  edge: DirectedRelationship,
  currentDay?: number
): Array<[string, number]> {
  return [
    ['Trust', clampRelationship(edge.trust)],
    ['Warmth', clampRelationship(edge.warmth)],
    ['Loyalty', clampRelationship(edge.loyalty)],
    ['Respect', clampRelationship(edge.respect)],
    ['Tension', tension(edge, currentDay)],
  ]
}

export function relationshipMetricStatus(label: string, value: number): string {
  if (label === 'Tension') {
    if (value >= 45) return 'High'
    if (value >= 20) return 'Rising'
    return 'Calm'
  }
  if (value <= -60) return 'Very low'
  if (value <= -20) return 'Low'
  if (value < 20) return 'Still forming'
  if (value < 60) return 'Growing'
  return 'Strong'
}

export function relationshipEventLabel(type: string, actionId?: string): string {
  if (type === 'SOCIAL_INTERACTION_RESOLVED' && actionId) {
    return actionId.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  }
  const ceremonyLabels: Record<string, string> = {
    CEREMONY_NOMINATIONS_LOCKED: 'Nomination',
    CEREMONY_SAFETY_USED: 'Safety used',
    CEREMONY_SAFETY_DECLINED: 'Safety declined',
    CEREMONY_POWER_WON: 'Competition win',
    ALLIANCE_BETRAYAL: 'Alliance betrayal',
  }
  return ceremonyLabels[type] ?? 'House interaction'
}
