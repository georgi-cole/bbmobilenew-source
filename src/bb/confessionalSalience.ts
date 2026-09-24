import type { ConfessionalWorldContext } from './confessionalComprehension'
import {
  getConfessionalRuntimeConfig,
  type ConfessionalSalienceEvent,
} from './confessionalRuntimeConfig'

export interface BigEyeWorldSnapshot {
  week: number
  phase: string
  playerStatus: string
  leaderName: string | null
  nomineeNames: string[]
  safetyWinnerName: string | null
  remainingCount: number
  closestName: string | null
  closestAffinity: number | null
}

export function buildBigEyeWorldSnapshot(world: ConfessionalWorldContext): BigEyeWorldSnapshot {
  const closest = world.closestRelationships[0] ?? null
  return {
    week: world.week,
    phase: world.phase,
    playerStatus: world.playerStatus,
    leaderName: world.leaderName,
    nomineeNames: [...world.nomineeNames],
    safetyWinnerName: world.safetyWinnerName,
    remainingCount: world.remainingHousemates.length,
    closestName: closest?.name ?? null,
    closestAffinity: closest?.affinity ?? null,
  }
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''))
}

export function getSalientConfessionalObservation(input: {
  previous: BigEyeWorldSnapshot | null
  current: ConfessionalWorldContext
  playerName: string
}): { event: ConfessionalSalienceEvent; text: string } | null {
  const config = getConfessionalRuntimeConfig()
  if (!config.features.proactiveObservations || !input.previous) return null

  const current = buildBigEyeWorldSnapshot(input.current)
  const previous = input.previous
  const playerWasNominated = previous.nomineeNames.includes(input.playerName)
  const playerIsNominated = current.nomineeNames.includes(input.playerName)

  const candidates: Array<{ event: ConfessionalSalienceEvent; detail?: string }> = []

  if (
    previous.playerStatus === 'evicted' &&
    current.playerStatus !== 'evicted' &&
    current.playerStatus !== 'jury'
  ) {
    candidates.push({ event: 'returned' })
  }
  if (!playerWasNominated && playerIsNominated) {
    candidates.push({ event: 'newly_nominated' })
  }
  if (previous.leaderName !== input.playerName && current.leaderName === input.playerName) {
    candidates.push({ event: 'became_leader' })
  }
  if (
    previous.safetyWinnerName !== input.playerName &&
    current.safetyWinnerName === input.playerName
  ) {
    candidates.push({ event: 'won_safety' })
  }
  if (playerWasNominated && !playerIsNominated && current.playerStatus !== 'evicted') {
    candidates.push({ event: 'survived_nomination' })
  }
  if (
    previous.closestName &&
    current.closestName &&
    previous.closestName !== current.closestName
  ) {
    candidates.push({
      event: 'closest_relationship_changed',
      detail: `${previous.closestName} → ${current.closestName}`,
    })
  }
  if (previous.remainingCount > 6 && current.remainingCount <= 6) {
    candidates.push({ event: 'late_game' })
  }

  if (candidates.length === 0) return null
  candidates.sort(
    (left, right) => config.salience.weights[right.event] - config.salience.weights[left.event]
  )
  const winner = candidates[0]
  const templates = config.salience.templates[winner.event]
  if (!templates?.length) return null
  const templateIndex =
    Math.abs(current.week + current.remainingCount + winner.event.length) % templates.length

  return {
    event: winner.event,
    text: interpolate(templates[templateIndex], {
      player: input.playerName,
      previousClosest: previous.closestName ?? '',
      closest: current.closestName ?? '',
      detail: winner.detail ?? '',
      day: current.week,
    }),
  }
}
