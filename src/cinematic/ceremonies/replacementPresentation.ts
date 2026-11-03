import type { GameState } from '../../types'

export type ReplacementVariant =
  | 'ordinary'
  | 'halo'
  | 'force'
  | 'mission'
  | 'coLoh'
  | 'detox'
  | 'doubleTrouble'
  | 'vox'
  | 'cupid'
export interface ReplacementPresentation {
  owner: 'replacement' | 'ambush'
  eventKey: string
  variant: ReplacementVariant
  replacementIds: string[]
  continuingNomineeIds: string[]
  savedIds: string[]
  chooserId: string | null
  durationMs: number
}
const unique = (ids: string[]) => [...new Set(ids)]
const scope = (game: GameState) => `${game.gameId ?? `season-${game.season}`}:${game.week}`
const live = (game: GameState, id: string) =>
  game.players.some((p) => p.id === id && !['evicted', 'jury'].includes(p.status))

/** Compare the ceremony's opening snapshot with its committed outcome, never a proposed pick.
 * This is presentation data only: it does not dispatch, infer ballot ranks, or change nominees.
 */
export function selectReplacementPresentation(
  opening: GameState,
  game: GameState
): ReplacementPresentation | null {
  if (
    scope(opening) !== scope(game) ||
    game.phase !== 'pos_ceremony_results' ||
    ['survival', 'survivor'].includes(game.mode ?? 'classic')
  )
    return null
  const veto = game.specialVeto
  if (
    game.replacementNeeded ||
    game.awaitingPovDecision ||
    game.awaitingPovSaveTarget ||
    game.aiReplacementStep ||
    veto?.awaitingHolderReplacement ||
    veto?.awaitingCoupReplacement1 ||
    veto?.awaitingCoupReplacement2 ||
    veto?.awaitingVipSecondUseDecision ||
    veto?.awaitingVipSecondSaveTarget ||
    (veto?.activeType === 'vip' && veto.vipUseStage !== -1)
  )
    return null
  const nominees = unique(game.nomineeIds)
  if (!nominees.length || nominees.some((id) => !live(game, id))) return null
  const replacementIds = nominees.filter((id) => !opening.nomineeIds.includes(id))
  const savedIds = unique(opening.nomineeIds.filter((id) => !nominees.includes(id)))
  if (!replacementIds.length || !savedIds.length) return null
  const plan = game.lohNominationPlan
  const targetArrived = plan?.strategy === 'backdoor' && replacementIds.includes(plan.targetId)
  // The advance pipeline may still be settling the plan. Do not announce a generic
  // replacement while it can become the globally scheduled Ambush reveal.
  if (targetArrived && !['executed', 'failed', 'compromised'].includes(plan.status)) return null
  const vox = game.voxPopuli?.status === 'active'
  const cupid = game.cupidArrow?.status === 'active'
  const missionChooser = game.missionPowers?.backupChooserId
  const coOwner =
    opening.coLohReplacementOwnerId ??
    Object.entries(game.coLohNomineeByCoLohId ?? {}).find(([, id]) =>
      replacementIds.includes(id)
    )?.[0]
  const chooserId = vox
    ? null
    : (missionChooser ??
      (veto?.activeType === 'coup' || veto?.activeType === 'diamond'
        ? game.posWinnerId
        : (coOwner ?? game.lohId)))
  if (!vox && (!chooserId || !live(game, chooserId))) return null
  if (cupid) {
    // Every nominated partner must be represented; incomplete linked outcomes wait.
    for (const pair of game.cupidArrow?.pairs ?? []) {
      if (
        pair.memberIds.some((id) => replacementIds.includes(id)) &&
        !pair.memberIds.every((id) => replacementIds.includes(id))
      )
        return null
    }
  }
  const variant: ReplacementVariant = vox
    ? 'vox'
    : cupid
      ? 'cupid'
      : missionChooser
        ? 'mission'
        : veto?.activeType === 'coup'
          ? 'detox'
          : veto?.activeType === 'vip'
            ? 'doubleTrouble'
            : veto?.activeType === 'diamond'
              ? 'halo'
              : veto?.activeType === 'spotlight'
                ? 'force'
                : coOwner
                  ? 'coLoh'
                  : 'ordinary'
  if (variant === 'detox' && replacementIds.length !== 2) return null
  return {
    owner: targetArrived && plan?.status === 'executed' ? 'ambush' : 'replacement',
    eventKey: `replacement:${scope(game)}:${JSON.stringify([nominees.slice().sort(), savedIds.slice().sort()])}`,
    variant,
    replacementIds,
    continuingNomineeIds: nominees.filter((id) => !replacementIds.includes(id)),
    savedIds,
    chooserId: chooserId ?? null,
    durationMs: vox ? 3000 : replacementIds.length > 1 && !cupid ? 6000 : 4500,
  }
}

/** Keep the opening block across multi-pick actions and component remounts.
 * Callers persist the receipt with their existing season presentation state.
 * No claim is made on media failure, allowing the native fallback to own completion.
 */
export function createReplacementPresentationTracker() {
  let opening: GameState | null = null
  return {
    observe(game: GameState) {
      if (!opening || scope(opening) !== scope(game)) opening = game
      // Entry into Safety establishes the block. Never reinterpret initial
      // nominations as a replacement event if nominees and phase commit together.
      if (game.phase !== 'pos_ceremony_results') {
        opening = game
        return null
      }
      if (opening.phase !== 'pos_ceremony_results') {
        opening = game
        return null
      }
      return selectReplacementPresentation(opening, game)
    },
    restore(snapshot: GameState) {
      opening = snapshot
    },
  }
}
