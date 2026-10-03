import type { GameState as FullGameState } from '../types'
import type { UnknownAction } from '@reduxjs/toolkit'
import type { SocialState } from './types'
import { getEligibleNominationTargets, getEligibleReplacementNominees } from '../store/gameSlice'
import { expandCupidIds } from '../features/twists/cupidArrow'
import { getCanonicalRelationshipTags } from './relationshipSemantics'
import { getEffectiveSocialMode } from './socialMode'
import { getRealityModeAdapter, type RealityCeremonyKind } from './reality'
import { recordRealityCeremony } from './socialSlice'

type MiddlewareAPI = { dispatch: (action: UnknownAction) => unknown; getState: () => unknown }
interface CeremonyState {
  game: FullGameState
  social?: Pick<SocialState, 'reality' | 'relationships' | 'commitments'>
  settings?: { gameUX?: { dramaMode?: boolean; dramaModeAdminOverride?: boolean } }
  vip?: { isActive?: boolean; entitlements?: { dramaMode?: boolean } }
}

export function recordSocialCeremony(
  api: MiddlewareAPI,
  kind: RealityCeremonyKind,
  input: {
    actorId?: string | null
    targetIds?: string[]
    reason?: string
    tags?: string[]
    nominationStage?: 'INITIAL_NOMINATION' | 'REPLACEMENT'
    safetyEligibleTargetIds?: string[]
    safetyDecisionComplete?: boolean
    decisionGame?: FullGameState
  } = {}
): void {
  const state = api.getState() as CeremonyState
  if (getEffectiveSocialMode(state) !== 'drama' || !state.social?.reality) return
  const game = input.decisionGame ?? state.game
  const automaticId =
    state.game.nominationContext?.autoNomineeId ??
    (game.publicModeEnabled && !game.doubleEviction?.weekActive ? game.lastHohCompFinisherId : null)
  const automaticIds =
    kind === 'NOMINATIONS_LOCKED' && input.nominationStage !== 'REPLACEMENT' && automaticId
      ? expandCupidIds(game, [automaticId])
      : []
  const mode = getRealityModeAdapter(state.game.mode, state.game.publicModeEnabled === true)
  const targetGroups = new Map<string | undefined, string[]>()
  for (const targetId of input.targetIds ?? []) {
    const automatic = automaticIds.includes(targetId)
    const owner = automatic
      ? undefined
      : kind === 'NOMINATIONS_LOCKED' &&
          input.nominationStage !== 'REPLACEMENT' &&
          input.actorId &&
          state.game.coLohIds?.length
        ? (Object.entries(state.game.coLohNomineeByCoLohId ?? {}).find(([, id]) =>
            expandCupidIds(game, [id]).includes(targetId)
          )?.[0] ?? input.actorId)
        : (input.actorId ?? undefined)
    targetGroups.set(owner, [...(targetGroups.get(owner) ?? []), targetId])
  }
  if (targetGroups.size === 0) targetGroups.set(input.actorId ?? undefined, [])
  for (const [actorId, targetIds] of targetGroups) {
    const stage = input.nominationStage ?? 'INITIAL_NOMINATION'
    const legalTargets =
      kind === 'NOMINATIONS_LOCKED' && actorId
        ? (stage === 'REPLACEMENT'
            ? getEligibleReplacementNominees(
                game,
                actorId,
                game.specialVeto?.activeType === 'coup' ? { allowLoh: true, neededCount: 2 } : {}
              )
            : getEligibleNominationTargets(game, actorId)
          )
            .filter((player) => !(input.targetIds ?? []).includes(player.id))
            .flatMap((player) => expandCupidIds(game, [player.id]))
        : undefined
    const relationshipTagsByTarget = actorId
      ? Object.fromEntries(
          state.game.players.map((player) => [
            player.id,
            [
              ...getCanonicalRelationshipTags({
                reality: state.social?.reality,
                relationships: state.social?.relationships,
                actorId,
                targetId: player.id,
              }),
            ],
          ])
        )
      : undefined
    const promiseKinds =
      kind === 'NOMINATIONS_LOCKED' ? ['protect_from_nomination'] : ['use_safety_on_player']
    const acceptedPromiseTargetIds = (state.social.commitments ?? [])
      .filter(
        (promise) =>
          promise.promisorId === actorId &&
          promise.status === 'pending' &&
          promise.dueWeek <= state.game.week &&
          promiseKinds.includes(promise.kind)
      )
      .map((promise) => promise.beneficiaryId)
    api.dispatch(
      recordRealityCeremony({
        kind,
        day: state.game.week ?? 1,
        phase: state.game.phase,
        actorId,
        targetIds,
        eligibleAlternativeIds: legalTargets,
        automaticTargetIds: automaticIds,
        nominationStage: stage,
        relationshipTagsByTarget,
        acceptedPromiseTargetIds,
        safetyEligibleTargetIds: input.safetyEligibleTargetIds,
        safetyDecisionComplete: input.safetyDecisionComplete,
        witnessIds: state.game.players
          .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
          .map((player) => player.id),
        reason: input.reason,
        tags: input.tags,
        publicEligible: mode.publicConsequencesEnabled,
      })
    )
  }
}
