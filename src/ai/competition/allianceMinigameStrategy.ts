import type { RelationshipsMap } from '../../social/types'
import type { StrategicAllianceSnapshot } from '../../types'

export interface StrategicAllianceDecisionRead {
  sharedProtection: number
  currentTargetPressure: number
  fallbackTargetPressure: number
  betrayalPressure: number
  sharedAllianceCount: number
  actorInfiltrator: boolean
}

export interface MinigameStrategicContext {
  relationships?: RelationshipsMap
  alliances?: StrategicAllianceSnapshot[]
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function allianceStatusWeight(status: StrategicAllianceSnapshot['status']): number {
  if (status === 'ACTIVE') return 1
  if (status === 'PROBATIONARY') return 0.78
  if (status === 'FRACTURED') return 0.32
  if (status === 'DORMANT') return 0.14
  return 0
}

function memberWeight(status: 'CORE' | 'REGULAR' | 'PERIPHERAL' | undefined): number {
  if (status === 'CORE') return 1
  if (status === 'REGULAR') return 0.78
  return 0.5
}

function combineWeights(values: number[], cap = 1.25): number {
  const sorted = values.filter((value) => value > 0).sort((left, right) => right - left)
  if (sorted.length === 0) return 0
  return Math.min(
    cap,
    sorted[0] +
      (sorted[1] ?? 0) * 0.35 +
      sorted.slice(2).reduce((sum, value) => sum + value * 0.15, 0)
  )
}

/** Reads the actor's actual pact/alliance context, including commitment and known plans. */
export function getStrategicAllianceDecisionRead(
  alliances: readonly StrategicAllianceSnapshot[] | undefined,
  actorId: string,
  targetId: string
): StrategicAllianceDecisionRead {
  const sharedWeights: number[] = []
  const targetWeights: number[] = []
  const fallbackWeights: number[] = []
  const betrayalWeights: number[] = []
  let sharedAllianceCount = 0
  let actorInfiltrator = false

  for (const alliance of alliances ?? []) {
    if (!alliance.memberIds.includes(actorId) || alliance.status === 'DISSOLVED') continue
    const actorCommitment = clampUnit(alliance.memberCommitment[actorId] ?? 0.5)
    const infiltrator = alliance.infiltratorIds.includes(actorId)
    const structureWeight =
      allianceStatusWeight(alliance.status) *
      actorCommitment *
      memberWeight(alliance.memberPerceivedStatus[actorId]) *
      (0.35 + clampUnit(alliance.cohesion) * 0.65) *
      (1 - clampUnit(alliance.fractureRisk) * 0.55)
    if (infiltrator) actorInfiltrator = true

    const strategicallyLive = alliance.status === 'ACTIVE' || alliance.status === 'PROBATIONARY'
    if (alliance.memberIds.includes(targetId)) {
      sharedAllianceCount += 1
      betrayalWeights.push(
        clampUnit(
          (1 - actorCommitment) * 0.35 +
            clampUnit(alliance.fractureRisk) * 0.35 +
            (infiltrator ? 0.55 : 0)
        )
      )
      if (strategicallyLive) {
        sharedWeights.push(
          structureWeight *
            memberWeight(alliance.memberPerceivedStatus[targetId]) *
            (infiltrator ? 0.12 : 1)
        )
      }
    }

    if (!strategicallyLive) continue
    const actorKnowsPlan =
      alliance.leaderIds.includes(actorId) || (alliance.memberPlanBeliefs[actorId]?.length ?? 0) > 0
    if (!actorKnowsPlan) continue
    const planWeight = structureWeight * (infiltrator ? 0.78 : 1)
    if (alliance.currentTargetIds.includes(targetId)) targetWeights.push(planWeight)
    if (alliance.fallbackTargetIds.includes(targetId)) fallbackWeights.push(planWeight)
  }

  return {
    sharedProtection: combineWeights(sharedWeights),
    currentTargetPressure: combineWeights(targetWeights, 1.2),
    fallbackTargetPressure: combineWeights(fallbackWeights, 1),
    betrayalPressure: Math.max(0, ...betrayalWeights),
    sharedAllianceCount,
    actorInfiltrator,
  }
}

const FRIEND_TAGS = new Set(['friend', 'friendship', 'romance', 'bromance', 'close_friend'])
const HOSTILE_TAGS = new Set(['target', 'betrayal', 'broken_promise', 'rivalry', 'rival'])

/** Higher scores mean a more strategically attractive player to weaken or eliminate. */
export function getMinigameTargetPriority(
  context: MinigameStrategicContext,
  actorId: string,
  targetId: string
): number {
  if (actorId === targetId) return Number.NEGATIVE_INFINITY

  const relationship = context.relationships?.[actorId]?.[targetId]
  const tags = new Set(relationship?.tags ?? [])
  const alliance = getStrategicAllianceDecisionRead(context.alliances, actorId, targetId)
  let score = 0

  if (alliance.sharedAllianceCount > 0) {
    score -= 28 + 40 * alliance.sharedProtection
    // Weak, fractured, or infiltrated alliances can be betrayed when agendas justify it.
    score += 46 * alliance.betrayalPressure
  } else if (tags.has('alliance')) {
    score -= 42
  }

  if ([...tags].some((tag) => FRIEND_TAGS.has(tag)) || (relationship?.affinity ?? 0) >= 45) {
    score -= 18
  }
  if ([...tags].some((tag) => HOSTILE_TAGS.has(tag))) score += 26
  if ((relationship?.affinity ?? 0) <= -25) score += 14

  score += alliance.currentTargetPressure * 20 + alliance.fallbackTargetPressure * 9
  return score
}

export function orderMinigameTargets<T extends { id: string }>(
  candidates: readonly T[],
  actorId: string,
  context: MinigameStrategicContext,
  tacticalValue: (candidate: T) => number = () => 0
): T[] {
  return [...candidates].sort((left, right) => {
    const strategicDifference =
      getMinigameTargetPriority(context, actorId, right.id) -
      getMinigameTargetPriority(context, actorId, left.id)
    return (
      tacticalValue(right) - tacticalValue(left) + strategicDifference ||
      left.id.localeCompare(right.id)
    )
  })
}
/** Measures how much the target is invested in a shared pact or alliance. */
export function getAlliancePowerHolderPriority(
  alliances: readonly StrategicAllianceSnapshot[] | undefined,
  actorId: string,
  targetId: string
): number {
  const weights = (alliances ?? [])
    .filter(
      (alliance) =>
        alliance.status !== 'DISSOLVED' &&
        alliance.memberIds.includes(actorId) &&
        alliance.memberIds.includes(targetId)
    )
    .map((alliance) => {
      const roleWeight = memberWeight(alliance.memberPerceivedStatus[targetId])
      const targetCommitment = clampUnit(alliance.memberCommitment[targetId] ?? 0.5)
      const leadershipBonus = alliance.leaderIds.includes(targetId) ? 1.18 : 1
      return (
        allianceStatusWeight(alliance.status) *
        roleWeight *
        targetCommitment *
        (0.35 + clampUnit(alliance.cohesion) * 0.65) *
        (1 - clampUnit(alliance.fractureRisk) * 0.55) *
        leadershipBonus
      )
    })
  return combineWeights(weights, 1.5)
}
