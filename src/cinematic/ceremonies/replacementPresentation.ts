import type { CupidArrowPair, GameState } from '../../types'

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

export interface ReplacementAction {
  kind: 'save' | 'replacement'
  playerId: string
  actorId: string | null
  slotIndex: number
}

export interface CoLohAssignment {
  coLohId: string
  nomineeId: string
}

export interface ReplacementPresentation {
  owner: 'replacement' | 'ambush'
  eventKey: string
  variant: ReplacementVariant
  openingNomineeIds: string[]
  nomineeIds: string[]
  replacementIds: string[]
  continuingNomineeIds: string[]
  savedIds: string[]
  chooserId: string | null
  powerHolderId: string | null
  priorAuthorityId: string | null
  affectedCoLohId: string | null
  coLohIds: string[]
  coLohAssignments: CoLohAssignment[]
  pairUnits: CupidArrowPair[]
  actionHistory: ReplacementAction[]
  durationMs: number
}

const unique = (ids: string[]) => [...new Set(ids)]
const scope = (game: GameState) => `${game.gameId ?? `season-${game.season}`}:${game.week}`
const live = (game: GameState, id: string) =>
  game.players.some((p) => p.id === id && !['evicted', 'jury'].includes(p.status))

function roleChooser(game: GameState, holderId: string | null | undefined): string | null {
  if (!holderId) return null
  if (game.cupidArrow?.status !== 'active') return holderId
  const roleIds = game.cupidArrow.pairs.find((pair) => pair.memberIds.includes(holderId))
    ?.memberIds ?? [holderId]
  return (
    game.players.find(
      (player) => player.isUser && roleIds.includes(player.id) && live(game, player.id)
    )?.id ?? holderId
  )
}

const slotFor = (occupants: Array<string | null>, playerId: string) => {
  const current = occupants.indexOf(playerId)
  if (current >= 0) return current
  const vacant = occupants.indexOf(null)
  if (vacant >= 0) return vacant
  occupants.push(null)
  return occupants.length - 1
}

function captureCommittedActions(
  before: GameState | null,
  game: GameState,
  opening: GameState,
  history: ReplacementAction[],
  occupants: Array<string | null>
) {
  if (!before || scope(before) !== scope(game) || game.phase !== 'pos_ceremony_results') return

  const previousNominees = before.nomineeIds ?? []
  const currentNominees = game.nomineeIds ?? []
  const removed = previousNominees.filter((id) => !currentNominees.includes(id))
  const added = currentNominees.filter((id) => !previousNominees.includes(id))
  const savedIds =
    game.specialVeto?.activeType === 'coup' || game.cupidArrow?.status === 'active'
      ? removed
      : [
          game.povSavedId && game.povSavedId !== before.povSavedId
            ? game.povSavedId
            : removed.find((id) => opening.nomineeIds.includes(id) || occupants.includes(id)),
        ].filter((id): id is string => Boolean(id))

  for (const savedId of savedIds) {
    if (history.some((action) => action.kind === 'save' && action.playerId === savedId)) continue
    const slotIndex = slotFor(occupants, savedId)
    history.push({ kind: 'save', playerId: savedId, actorId: game.posWinnerId ?? null, slotIndex })
    occupants[slotIndex] = null
  }

  const selectedDetoxFirst =
    game.specialVeto?.activeType === 'coup' &&
    game.specialVeto.coupReplacement1Id &&
    game.specialVeto.coupReplacement1Id !== before.specialVeto?.coupReplacement1Id
      ? game.specialVeto.coupReplacement1Id
      : null
  const nomineeIdsToRecord = unique([...added, ...(selectedDetoxFirst ? [selectedDetoxFirst] : [])])
  for (const playerId of nomineeIdsToRecord) {
    if (history.some((action) => action.kind === 'replacement' && action.playerId === playerId))
      continue
    const slotIndex = slotFor(occupants, playerId)
    const coLohOwner = Object.entries(game.coLohNomineeByCoLohId ?? {}).find(
      ([, nomineeId]) => nomineeId === playerId
    )?.[0]
    const roleActorId =
      game.voxPopuli?.status === 'active'
        ? null
        : (game.coLohReplacementOwnerId ??
          before.coLohReplacementOwnerId ??
          coLohOwner ??
          (['coup', 'diamond'].includes(game.specialVeto?.activeType ?? '')
            ? game.posWinnerId
            : game.lohId))
    const actorId =
      game.voxPopuli?.status === 'active'
        ? null
        : (game.missionPowers?.backupChooserId ?? roleChooser(game, roleActorId))
    history.push({ kind: 'replacement', playerId, actorId: actorId ?? null, slotIndex })
    occupants[slotIndex] = playerId
  }
}

/** Compare the ceremony's opening snapshot with its committed outcome, never a proposed pick.
 * This is presentation data only: it does not dispatch, infer ballot ranks, or change nominees.
 */
export function selectReplacementPresentation(
  opening: GameState,
  game: GameState,
  actionHistory: ReplacementAction[] = []
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
  const openingNomineeIds = unique(opening.nomineeIds)
  const replacementIds = nominees.filter((id) => !openingNomineeIds.includes(id))
  const savedIds = unique(openingNomineeIds.filter((id) => !nominees.includes(id)))
  if (!replacementIds.length || !savedIds.length) return null

  const plan = game.lohNominationPlan
  const targetArrived = plan?.strategy === 'backdoor' && replacementIds.includes(plan.targetId)
  // The advance pipeline may still be settling the plan. Do not announce a generic
  // replacement while it can become the globally scheduled Ambush reveal.
  if (targetArrived && !['executed', 'failed', 'compromised'].includes(plan.status)) return null

  const vox = game.voxPopuli?.status === 'active'
  const cupid = game.cupidArrow?.status === 'active'
  const missionChooser = game.missionPowers?.backupChooserId
  const coLohIds = unique([...(opening.coLohIds ?? []), ...(game.coLohIds ?? [])])
  const coLohNominees = { ...opening.coLohNomineeByCoLohId, ...game.coLohNomineeByCoLohId }
  for (const action of actionHistory) {
    if (action.kind === 'replacement' && action.actorId && coLohIds.includes(action.actorId))
      coLohNominees[action.actorId] = action.playerId
  }
  const coLohAssignments = Object.entries(coLohNominees)
    .filter(([, nomineeId]) => nominees.includes(nomineeId))
    .map(([coLohId, nomineeId]) => ({ coLohId, nomineeId }))
  const affectedCoLohId =
    opening.coLohReplacementOwnerId ??
    game.coLohReplacementOwnerId ??
    actionHistory.find(
      (action) =>
        action.kind === 'replacement' && action.actorId && coLohIds.includes(action.actorId)
    )?.actorId ??
    coLohAssignments.find(({ nomineeId }) => replacementIds.includes(nomineeId))?.coLohId ??
    null
  const coOwner = affectedCoLohId
  const chooserId = vox
    ? null
    : (missionChooser ??
      roleChooser(
        game,
        veto?.activeType === 'coup' || veto?.activeType === 'diamond'
          ? game.posWinnerId
          : (coOwner ?? game.lohId)
      ))
  if (!vox && (!chooserId || !live(game, chooserId))) return null

  const pairUnits = (game.cupidArrow?.pairs ?? []).filter((pair) =>
    pair.memberIds.some((id) => openingNomineeIds.includes(id) || nominees.includes(id))
  )
  if (cupid) {
    // Every nominated partner must be represented; incomplete linked outcomes wait.
    for (const pair of pairUnits) {
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
  // Keep intermediate nominees too: the second Safety use can save the first
  // replacement, who is absent from both the opening and final blocks.
  const orderedActionHistory = actionHistory.slice()
  const completedSafetyUses = Math.max(
    orderedActionHistory.filter((action) => action.kind === 'save').length,
    savedIds.length
  )
  const durationMs =
    variant === 'vox'
      ? replacementIds.length > 1
        ? 4600
        : 3600
      : variant === 'detox'
        ? 6000
        : variant === 'doubleTrouble'
          ? completedSafetyUses > 1
            ? 6000
            : 4800
          : variant === 'halo'
            ? 5000
            : variant === 'coLoh'
              ? 5000
              : 4800

  const actionSignature = orderedActionHistory.map((action) => [
    action.kind,
    action.playerId,
    action.actorId,
    action.slotIndex,
  ])
  return {
    owner: targetArrived && plan?.status === 'executed' ? 'ambush' : 'replacement',
    eventKey: `replacement:${scope(game)}:${JSON.stringify([
      nominees.slice().sort(),
      savedIds.slice().sort(),
      actionSignature,
    ])}`,
    variant,
    openingNomineeIds,
    nomineeIds: nominees,
    replacementIds,
    continuingNomineeIds: nominees.filter((id) => !replacementIds.includes(id)),
    savedIds,
    chooserId: chooserId ?? null,
    powerHolderId: game.posWinnerId ?? null,
    priorAuthorityId: opening.lohId ?? null,
    affectedCoLohId,
    coLohIds,
    coLohAssignments,
    pairUnits,
    actionHistory: orderedActionHistory,
    durationMs,
  }
}

/** Keep the opening block and a narrow ordered receipt across multi-pick actions.
 * Only IDs and choice beats are retained; full game snapshots are never cloned or persisted.
 */
export function createReplacementPresentationTracker() {
  let opening: GameState | null = null
  let previous: GameState | null = null
  let actionHistory: ReplacementAction[] = []
  let occupants: Array<string | null> = []
  let collecting = false

  const reset = (game: GameState, startCollecting = false) => {
    opening = game
    previous = game
    actionHistory = []
    occupants = unique(game.nomineeIds).map((id) => id)
    collecting = startCollecting
  }

  return {
    observe(game: GameState) {
      if (!previous || scope(previous) !== scope(game)) reset(game)
      const before = previous
      previous = game
      if (game.phase !== 'pos_ceremony_results') {
        reset(game)
        return null
      }
      if (!collecting || !opening) {
        // The safety phase transition itself establishes the receipt boundary.
        // Use the pre-transition nominee list when it is from this same week.
        opening = before && scope(before) === scope(game) ? before : game
        actionHistory = []
        occupants = unique(opening.nomineeIds).map((id) => id)
        collecting = true
        // AI Safety decisions can commit the first save (and a Halo backup) in
        // the transition into results. Capture that valid ceremony boundary;
        // unrelated entry into results must not manufacture a replacement.
        if (before?.phase === 'pos_ceremony') {
          captureCommittedActions(before, game, opening, actionHistory, occupants)
          return selectReplacementPresentation(opening, game, actionHistory)
        }
        return null
      }
      captureCommittedActions(before, game, opening, actionHistory, occupants)
      return selectReplacementPresentation(opening, game, actionHistory)
    },
    restore(snapshot: GameState) {
      reset(snapshot, snapshot.phase === 'pos_ceremony_results')
    },
  }
}
