import type { GameState } from '../types'
import { getCupidPartnerId, expandCupidIds } from '../features/twists/cupidArrow'
import { isLohAmbushPlan } from '../store/lohNominationPlanning'
import { getLohEliminationPriorityIds } from './lohNominationPlanCopy'

type SafetyConsultationGame = Partial<
  Pick<
    GameState,
    | 'week'
    | 'lohId'
    | 'posWinnerId'
    | 'povSavedId'
    | 'povProtectedIds'
    | 'cupidArrow'
    | 'lohNominationPlan'
    | 'storeNominationProtections'
    | 'doubleEviction'
    | 'specialVeto'
  >
> & {
  phase?: string
  lohSocialPlan?: { currentTargetId?: string | null } | null
  players?: readonly { id: string; name?: string; status: string }[]
  nomineeIds?: readonly string[]
}

/** Ask for a replacement seat only for the real, saved Ambush target. */
export function formatLohSafetyConsultation(
  game: SafetyConsultationGame | undefined,
  actorId: string
): string | null {
  if (
    !game ||
    !['pos_results', 'pos_ceremony'].includes(game.phase ?? '') ||
    (game.posWinnerId !== actorId && getCupidPartnerId(game, game.posWinnerId) !== actorId)
  )
    return null
  const nominees = game.nomineeIds ?? []
  if (!nominees.length) return null
  const name = (id: string) => game.players?.find((player) => player.id === id)?.name ?? id
  if (nominees.includes(actorId)) return 'Obviously save yourself. Your own safety comes first.'

  const plan = game.lohNominationPlan
  const canonical =
    plan &&
    plan.week === game.week &&
    plan.lohId === game.lohId &&
    (plan.isDoubleElimination === true) === (game.doubleEviction?.weekActive === true)
      ? plan
      : null
  const targetId =
    canonical && nominees.includes(canonical.targetId)
      ? canonical.targetId
      : game.lohSocialPlan?.currentTargetId
  const currentTargetId = targetId && nominees.includes(targetId) ? targetId : nominees[0]
  if (
    isLohAmbushPlan(canonical) &&
    canonical.status === 'initial_block_set' &&
    !game.specialVeto?.activeType
  ) {
    const protectedIds = new Set([
      game.lohId,
      game.posWinnerId,
      getCupidPartnerId(game, game.lohId),
      getCupidPartnerId(game, game.posWinnerId),
      game.povSavedId,
      ...(game.povProtectedIds ?? []),
      ...(game.storeNominationProtections ?? [])
        .filter((protection) => protection.week === game.week)
        .map((protection) => protection.targetId),
    ])
    const target = game.players?.find((player) => player.id === canonical.targetId)
    const targetEligible =
      target &&
      !['evicted', 'jury'].includes(target.status) &&
      expandCupidIds(game, [target.id]).every(
        (id) => !nominees.includes(id) && !protectedIds.has(id)
      )
    if (targetEligible) {
      const saveId = canonical.pawnIds.find((id) => nominees.includes(id)) ?? nominees[0]
      // Describe the block that would exist after the proposed Safety save:
      // the saved pawn leaves and the real Ambush target takes that seat.
      // Using today's nominees drops the hidden target and invents two other
      // priorities, contradicting the reason for the Ambush.
      const proposedNominees = [...nominees.filter((id) => id !== saveId), canonical.targetId]
      const doublePriorities = canonical.isDoubleElimination
        ? getLohEliminationPriorityIds(canonical, proposedNominees)
        : []
      const doublePlanRead =
        doublePriorities.length > 1
          ? ` My two exit priorities are ${doublePriorities.map(name).join(' and ')}${
              canonical.preferredSurvivorId &&
              proposedNominees.includes(canonical.preferredSurvivorId)
                ? `, and ${name(canonical.preferredSurvivorId)} is the person I most want to keep`
                : ''
            }.`
          : ''
      return `Use it on ${name(saveId)}. Let's open the seat and spring an ambush on ${name(target.id)}. ${name(target.id)} is my real elimination target.${doublePlanRead}`
    }
  }
  const doublePriorities = canonical?.isDoubleElimination
    ? getLohEliminationPriorityIds(canonical, nominees)
    : []
  if (doublePriorities.length > 1) {
    const survivor = canonical?.preferredSurvivorId
    return `No—do not use it. I want the nominations to stay the same. My two elimination priorities are ${doublePriorities.map(name).join(' and ')}${
      survivor && nominees.includes(survivor) ? `; I most want ${name(survivor)} to stay` : ''
    }. The vote still decides who leaves.`
  }
  return `No—do not use it. I want the nominations to stay the same, with ${name(currentTargetId)} as the target.`
}
