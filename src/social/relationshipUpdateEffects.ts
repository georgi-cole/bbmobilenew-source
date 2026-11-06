import { BELLA_ID } from '../features/twists/bellasWill'
import { getFamilyGroupId } from './socialRuntimeConfig'

interface RelationshipPayload {
  source: string
  target: string
  delta?: number
  tags?: string[]
}

interface ActivePlayer {
  id: string
  status: string
}

const BELLA_COMMITMENT_TAGS = new Set([
  'alliance',
  'protection',
  'shield',
  'safety_promise',
  'ride_or_die',
  'promise_keeper',
])

/** Keep Bella's warmth rule identical for individual and week-seed updates. */
export function dampenBellaRelationship<T extends RelationshipPayload>(payload: T): T {
  if (
    payload.source !== BELLA_ID ||
    typeof payload.delta !== 'number' ||
    payload.delta <= 0 ||
    (payload.tags ?? []).some((tag) => BELLA_COMMITMENT_TAGS.has(tag))
  ) {
    return payload
  }
  return { ...payload, delta: Math.max(1, Math.round(payload.delta * 0.45)) }
}

function twinEchoFactor(source: string, target: string, week: number): number {
  const value = `${source}|${target}|${week}`
    .split('')
    .reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7)
  return 0.55 + (Math.abs(value) % 16) / 100
}

/** Return echoes in the same order as the individual-action middleware. */
export function getTwinRelationshipEchoes(
  payload: RelationshipPayload,
  players: ActivePlayer[],
  week: number
): Array<{
  source: string
  target: string
  delta: number
  actionSource: 'system'
  twinPropagation: true
}> {
  if (!payload.delta || payload.source === payload.target) return []
  const aliveIds = new Set(
    players
      .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
      .map((player) => player.id)
  )
  const familyMate = (playerId: string) => {
    const groupId = getFamilyGroupId(playerId)
    if (!groupId) return null
    return (
      players.find(
        (player) =>
          player.id !== playerId &&
          aliveIds.has(player.id) &&
          getFamilyGroupId(player.id) === groupId
      )?.id ?? null
    )
  }
  const sourceTwinId = familyMate(payload.source)
  const targetTwinId = familyMate(payload.target)
  const echoDelta = Math.round(payload.delta * twinEchoFactor(payload.source, payload.target, week))
  const echoes: Array<{
    source: string
    target: string
    delta: number
    actionSource: 'system'
    twinPropagation: true
  }> = []
  if (
    echoDelta !== 0 &&
    sourceTwinId &&
    aliveIds.has(sourceTwinId) &&
    payload.target !== sourceTwinId
  ) {
    echoes.push({
      source: sourceTwinId,
      target: payload.target,
      delta: echoDelta,
      actionSource: 'system',
      twinPropagation: true,
    })
  }
  if (
    echoDelta !== 0 &&
    targetTwinId &&
    aliveIds.has(targetTwinId) &&
    payload.source !== targetTwinId
  ) {
    echoes.push({
      source: payload.source,
      target: targetTwinId,
      delta: echoDelta,
      actionSource: 'system',
      twinPropagation: true,
    })
  }
  return echoes
}
