import type { GameState } from '../types'

type LohEliminationGame = Partial<
  Pick<GameState, 'week' | 'lohId' | 'lohNominationPlan' | 'doubleEviction'>
> & {
  lohSocialPlan?: {
    week?: number
    lohId?: string
    currentTargetId?: string | null
  } | null
}

/** Resolve real exit preferences, never a cover story disclosed to a listener. */
export function getCurrentLohEliminationPriorityIds(
  game: LohEliminationGame,
  decisionMakerId: string,
  eligibleIds: readonly string[]
): string[] {
  if (game.lohId !== decisionMakerId) return []
  const eligible = new Set(eligibleIds)
  const plan = game.lohNominationPlan
  if (
    plan &&
    plan.week === game.week &&
    plan.lohId === decisionMakerId &&
    (plan.isDoubleElimination === true) === (game.doubleEviction?.weekActive === true) &&
    !['failed', 'compromised'].includes(plan.status)
  ) {
    const priorities = (
      plan.eliminationPriorityIds?.length ? plan.eliminationPriorityIds : [plan.targetId]
    ).filter((id, index, ids) => eligible.has(id) && ids.indexOf(id) === index)
    if (priorities.length > 0) return priorities
  }

  const socialPlan = game.lohSocialPlan
  return socialPlan &&
    socialPlan.week === game.week &&
    socialPlan.lohId === decisionMakerId &&
    socialPlan.currentTargetId &&
    eligible.has(socialPlan.currentTargetId)
    ? [socialPlan.currentTargetId]
    : []
}
