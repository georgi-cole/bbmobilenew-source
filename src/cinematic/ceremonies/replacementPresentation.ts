import type { CupidArrowPair, GameState } from '../../types'
import { replacementDuration } from './replacement-timing.js'

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
  kind: 'save' | 'replacement' | 'decline'
  playerId: string
  actorId: string | null
  slotIndex: number
  actorRole?: 'loh' | 'coLoh' | 'safety' | 'mission' | 'ballot'
  ballotRank?: number
  tiedRank?: boolean
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
  /** A held shot for a real, still-unresolved choice. It contains no proposed target. */
  decision?: { actorId: string; kind: 'save' | 'replacement' | 'use' | 'secondUse' | 'mission' }
  decisionOnly?: boolean
  openingSlots?: Record<string, number>
  slotCount?: number
  sequenceKey?: string
  segment?: boolean
  safetyUseNumber?: number
  powerType?: string | null
  leaderIds?: string[]
  safetyHolderIds?: string[]
  authorityPairs?: CupidArrowPair[]
  skipAuthority?: boolean
  initialNomination?: boolean
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

  const declined =
    !savedIds.length &&
    !removed.length &&
    !added.length &&
    !game.awaitingPovDecision &&
    !game.awaitingPovSaveTarget &&
    ((before.awaitingPovDecision && !game.awaitingPovDecision) ||
      (before.specialVeto?.vipUseStage === 2 && game.specialVeto?.vipUseStage === -1) ||
      (before.phase === 'pos_ceremony' &&
        !game.aiReplacementStep &&
        !game.replacementNeeded &&
        !game.specialVeto?.awaitingHolderReplacement &&
        !game.specialVeto?.awaitingCoupReplacement1))
  if (declined && game.posWinnerId) {
    const actorId = roleChooser(game, game.posWinnerId)
    history.push({ kind: 'decline', playerId: actorId ?? game.posWinnerId, actorId, slotIndex: -1 })
  }

  for (const savedId of savedIds) {
    if (history.some((action) => action.kind === 'save' && action.playerId === savedId)) continue
    const slotIndex = slotFor(occupants, savedId)
    history.push({
      kind: 'save',
      playerId: savedId,
      actorId: roleChooser(game, game.posWinnerId),
      slotIndex,
      actorRole: 'safety',
    })
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
    const actorRole =
      game.voxPopuli?.status === 'active'
        ? 'ballot'
        : game.missionPowers?.backupChooserId
          ? 'mission'
          : game.coLohIds?.includes(roleActorId ?? '')
            ? 'coLoh'
            : ['coup', 'diamond'].includes(game.specialVeto?.activeType ?? '')
              ? 'safety'
              : 'loh'
    const ballot = game.voxPopuli?.nominationVoteCounts
    const votes = ballot?.[playerId]
    const ballotRank =
      actorRole === 'ballot' && Number.isFinite(votes)
        ? 1 + Object.values(ballot ?? {}).filter((count) => count > votes!).length
        : undefined
    const tiedRank =
      ballotRank !== undefined &&
      Object.values(ballot ?? {}).filter((count) => count === votes).length > 1
    history.push({
      kind: 'replacement',
      playerId,
      actorId: actorId ?? null,
      slotIndex,
      actorRole,
      ...(ballotRank === undefined ? {} : { ballotRank, tiedRank }),
    })
    occupants[slotIndex] = playerId
  }
}

/** Compare the ceremony's opening snapshot with its committed outcome, never a proposed pick.
 * This is presentation data only: it never dispatches, selects targets, or changes nominees.
 */
export function selectReplacementPresentation(
  opening: GameState,
  game: GameState,
  actionHistory: ReplacementAction[] = [],
  allowPending = false
): ReplacementPresentation | null {
  if (
    scope(opening) !== scope(game) ||
    game.phase !== 'pos_ceremony_results' ||
    ['survival', 'survivor'].includes(game.mode ?? 'classic')
  )
    return null
  const veto = game.specialVeto
  if (
    !allowPending &&
    (game.replacementNeeded ||
      game.awaitingPovDecision ||
      game.awaitingPovSaveTarget ||
      game.aiReplacementStep ||
      veto?.awaitingHolderReplacement ||
      veto?.awaitingCoupReplacement1 ||
      veto?.awaitingCoupReplacement2 ||
      veto?.awaitingVipSecondUseDecision ||
      veto?.awaitingVipSecondSaveTarget ||
      (veto?.activeType === 'vip' && veto.vipUseStage !== -1))
  )
    return null

  const nominees = unique(game.nomineeIds)
  if ((!allowPending && !nominees.length) || nominees.some((id) => !live(game, id))) return null
  const openingNomineeIds = unique(opening.nomineeIds)
  const replacementIds = nominees.filter((id) => !openingNomineeIds.includes(id))
  const savedIds = unique(openingNomineeIds.filter((id) => !nominees.includes(id)))
  if (!allowPending && (!replacementIds.length || !savedIds.length)) return null

  const plan = game.lohNominationPlan
  const targetArrived = plan?.strategy === 'backdoor' && replacementIds.includes(plan.targetId)
  // The advance pipeline may still be settling the plan. Do not announce a generic
  // replacement while it can become the globally scheduled Ambush reveal.
  if (
    !allowPending &&
    targetArrived &&
    !['executed', 'failed', 'compromised'].includes(plan.status)
  )
    return null

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

  if (!allowPending && variant === 'detox' && replacementIds.length !== 2) return null
  // Keep intermediate nominees too: the second Safety use can save the first
  // replacement, who is absent from both the opening and final blocks.
  const orderedActionHistory = actionHistory.slice()
  const authority = {
    powerType: veto?.activeType ?? null,
    leaderIds: vox
      ? []
      : unique(
          [game.lohId, ...(game.coLohIds ?? [])]
            .filter((id): id is string => Boolean(id))
            .flatMap((id) =>
              game.cupidArrow?.status === 'active'
                ? (game.cupidArrow.pairs.find((pair) => pair.memberIds.includes(id))?.memberIds ?? [
                    id,
                  ])
                : [id]
            )
        ),
    safetyHolderIds: game.posWinnerId
      ? game.cupidArrow?.status === 'active'
        ? (game.cupidArrow.pairs.find((pair) => pair.memberIds.includes(game.posWinnerId!))
            ?.memberIds ?? [game.posWinnerId])
        : [game.posWinnerId]
      : [],
    authorityPairs:
      game.cupidArrow?.status === 'active'
        ? game.cupidArrow.pairs.filter(
            (pair) =>
              pair.memberIds.includes(game.lohId ?? '') ||
              pair.memberIds.some((id) => coLohIds.includes(id))
          )
        : [],
  }
  const durationMs = replacementDuration({
    actionHistory: orderedActionHistory,
    replacementIds,
    chooserId,
    variant,
    pairUnits,
    ...authority,
  })

  const actionSignature = orderedActionHistory.map((action) => [
    action.kind,
    action.playerId,
    action.actorId,
    action.slotIndex,
    action.actorRole,
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
    ...authority,
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
  let sequenceKey = ''

  const reset = (game: GameState, startCollecting = false) => {
    opening = game
    previous = game
    actionHistory = []
    occupants = unique(game.nomineeIds).map((id) => id)
    collecting = startCollecting
    sequenceKey = `${scope(game)}:${Date.now()}:${++nextCollectionId}`
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
    progress(game: GameState) {
      if (!collecting || !opening || previous !== game) return null
      const result = selectReplacementPresentation(opening, game, actionHistory, true)
      return result ? { ...result, sequenceKey } : null
    },
  }
}

let nextCollectionId = 0
