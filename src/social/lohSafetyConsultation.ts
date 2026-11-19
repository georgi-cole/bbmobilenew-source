import type { GameState } from '../types'
import { getCupidPartnerId } from '../features/twists/cupidArrow'
import { getLohDialogueCandidateIds } from '../store/gameSlice'
import { isLohAmbushPlan } from '../store/lohNominationPlanning'
import { getLohEliminationPriorityIds } from './lohNominationPlanCopy'
import { getCurrentLohEliminationPriorityIds } from './lohEliminationPriority'

/** Ask for a replacement seat only for the real, saved Ambush target. */
export function formatLohSafetyConsultation(
  game: GameState | undefined,
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

  if (game.voxPopuli?.status === 'active') {
    return "Use Safety if there's someone on the block you want to protect. If a backup is needed, the original secret ballot supplies it. The audience decides who leaves."
  }

  const plan = game.lohNominationPlan
  const canonical =
    plan &&
    plan.week === game.week &&
    plan.lohId === game.lohId &&
    (plan.isDoubleElimination === true) === (game.doubleEviction?.weekActive === true)
      ? plan
      : null
  const currentTargetId =
    getCurrentLohEliminationPriorityIds(game, game.lohId ?? '', nominees)[0] ?? nominees[0]
  if (
    isLohAmbushPlan(canonical) &&
    canonical.status === 'initial_block_set' &&
    !game.specialVeto?.activeType
  ) {
    const candidates = getLohDialogueCandidateIds(game, canonical.lohId, 'conditional_replacement')
    if (candidates.includes(canonical.targetId)) {
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
      const target = name(canonical.targetId)
      return `Use it on ${name(saveId)}. Let's open the seat and spring an ambush on ${target}. ${target} is my real elimination target.${doublePlanRead}`
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
