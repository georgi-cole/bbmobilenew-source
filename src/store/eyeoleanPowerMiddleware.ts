import type { Dispatch, Middleware, MiddlewareAPI, UnknownAction } from '@reduxjs/toolkit'
import {
  activateStoreExtraVote,
  activateStoreVoxExtraVote,
  advance,
  applyStoreVoteRemoval,
  applyStoreVoxVoteRemoval,
  commitNominees,
  activateStoreNominationProtection,
  clearStoreNominationProtection,
  declineDoubleVoteReward,
  declineVoteDeduction,
  finalizeNominations,
  hydrateGame,
  getEligibleReplacementNominees,
  resolveUnfillableReplacement,
  submitHumanDoubleVote,
  submitCoLohNomination,
  canStoreNominationProtectionAffectPlayer,
} from './gameSlice'
import {
  consumeEyeoleanStorePower,
  returnEyeoleanStorePower,
  type EyeoleanPowerReservation,
  type ProfilesState,
} from './profilesSlice'
import {
  canTriggerStoreExtraVote,
  canTriggerStoreVoteRemoval,
  canTriggerStoreVoxExtraVote,
  canTriggerStoreVoxVoteRemoval,
  getActiveHousemateCount,
} from '../economy/eyeoleanPowerRules'
import type { EyeoleanStoreProductKey } from '../economy/storeCatalog'
import type { GameState } from '../types'

type PowerMiddlewareState = {
  game: GameState
  profiles: ProfilesState
}

type PowerMiddlewareApi = MiddlewareAPI<Dispatch<UnknownAction>, PowerMiddlewareState>

function activeReservations(state: PowerMiddlewareState) {
  const { activeProfileId, isGuest, profiles } = state.profiles
  if (isGuest || !activeProfileId) return {}
  return profiles.find((profile) => profile.id === activeProfileId)?.eyeoleanPowerReservations ?? {}
}

function reservationFor(
  state: PowerMiddlewareState,
  productKey: EyeoleanStoreProductKey
): EyeoleanPowerReservation | undefined {
  return activeReservations(state)[productKey]
}

function reservationMatchesGame(
  state: PowerMiddlewareState,
  productKey: EyeoleanStoreProductKey
): boolean {
  return reservationFor(state, productKey)?.gameId === state.game.gameId
}

function reconcileReservations(api: PowerMiddlewareApi) {
  const state = api.getState()
  const human = state.game.players.find((player) => player.isUser)
  const shouldReturn =
    !human ||
    human.status === 'evicted' ||
    human.status === 'jury' ||
    getActiveHousemateCount(state.game) <= 4 ||
    Boolean(state.game.seasonFinale)

  ;(['extra_vote', 'remove_vote'] as const).forEach((productKey) => {
    const reservation = reservationFor(state, productKey)
    if (!reservation) return
    if (shouldReturn || reservation.gameId !== state.game.gameId) {
      api.dispatch(
        returnEyeoleanStorePower({
          productKey,
          gameId: reservation.gameId,
        })
      )
    }
  })
  ;(['immunity', 'protection'] as const).forEach((productKey) => {
    const reservation = reservationFor(state, productKey)
    if (!reservation) {
      if (
        state.game.storeNominationProtections?.some(
          (item) =>
            item.productKey === productKey &&
            (shouldReturn ||
              item.week !== state.game.week ||
              (state.game.phase === 'nomination_results' && state.game.awaitingNominations))
        )
      ) {
        api.dispatch(clearStoreNominationProtection(productKey))
      }
      return
    }
    const target = state.game.players.find((player) => player.id === reservation.targetId)
    if (
      shouldReturn ||
      reservation.gameId !== state.game.gameId ||
      !target ||
      target.status === 'evicted' ||
      target.status === 'jury'
    ) {
      api.dispatch(
        returnEyeoleanStorePower({
          productKey,
          gameId: reservation.gameId,
        })
      )
      api.dispatch(clearStoreNominationProtection(productKey))
    }
  })
}

function syncNominationProtection(api: PowerMiddlewareApi) {
  const state = api.getState()
  const human = state.game.players.find((player) => player.isUser)
  ;(['immunity', 'protection'] as const).forEach((productKey) => {
    const reservation = reservationFor(state, productKey)
    if (!reservation || reservation.gameId !== state.game.gameId) return
    const targetId = reservation.targetId ?? (productKey === 'immunity' ? human?.id : undefined)
    if (!targetId) return
    if (
      state.game.storeNominationProtections?.some(
        (protection) =>
          protection.productKey === productKey &&
          protection.targetId === targetId &&
          protection.week === state.game.week
      )
    ) {
      return
    }
    api.dispatch(
      activateStoreNominationProtection({
        productKey,
        targetId,
        week: state.game.week,
      })
    )
  })
}

function resolveNominationProtection(api: PowerMiddlewareApi, before: PowerMiddlewareState) {
  const after = api.getState()
  const wasWaitingForNomination =
    before.game.phase === 'nomination_results' && before.game.awaitingNominations === true
  const nominationsResolved =
    after.game.phase === 'nomination_results' &&
    after.game.awaitingNominations !== true &&
    (wasWaitingForNomination || before.game.phase !== 'nomination_results')
  if (!nominationsResolved) return

  for (const protection of after.game.storeNominationProtections ?? []) {
    if (protection.week !== after.game.week) continue
    const reservation = reservationFor(after, protection.productKey)
    if (!reservationMatchesGame(after, protection.productKey)) {
      api.dispatch(clearStoreNominationProtection(protection.productKey))
      continue
    }

    if (canStoreNominationProtectionAffectPlayer(after.game, protection.targetId)) {
      api.dispatch(
        consumeEyeoleanStorePower({
          productKey: protection.productKey,
          gameId: reservation!.gameId,
        })
      )
    }
    // A consumed shield stays active for the rest of this day, including any
    // public save, Safety replacement, or LOH ambush. The next day clears it.
    else api.dispatch(clearStoreNominationProtection(protection.productKey))
  }
}

function tryActivateExtraVote(api: PowerMiddlewareApi) {
  const state = api.getState()
  if (!reservationMatchesGame(state, 'extra_vote')) return
  if (canTriggerStoreExtraVote(state.game)) {
    api.dispatch(activateStoreExtraVote())
    return
  }
  if (canTriggerStoreVoxExtraVote(state.game)) api.dispatch(activateStoreVoxExtraVote())
}

function tryApplyVoteRemoval(api: PowerMiddlewareApi) {
  const before = api.getState()
  if (!reservationMatchesGame(before, 'remove_vote')) return
  const human = before.game.players.find((player) => player.isUser)
  if (!human) return

  if (canTriggerStoreVoxVoteRemoval(before.game)) {
    const beforeCount = before.game.voxPopuli?.nominationVoteCounts[human.id] ?? 0
    api.dispatch(applyStoreVoxVoteRemoval())
    const after = api.getState()
    const afterCount = after.game.voxPopuli?.nominationVoteCounts[human.id] ?? beforeCount
    if (afterCount === beforeCount - 1) {
      api.dispatch(
        consumeEyeoleanStorePower({
          productKey: 'remove_vote',
          gameId: before.game.gameId,
        })
      )
    }
    return
  }

  if (!canTriggerStoreVoteRemoval(before.game)) return
  const beforeCount = before.game.voteResults?.[human.id] ?? 0

  api.dispatch(applyStoreVoteRemoval())

  const after = api.getState()
  const afterCount = after.game.voteResults?.[human.id] ?? beforeCount
  if (afterCount !== beforeCount - 1) return

  api.dispatch(
    consumeEyeoleanStorePower({
      productKey: 'remove_vote',
      gameId: before.game.gameId,
    })
  )
}

export const eyeoleanPowerMiddleware: Middleware = (api) => {
  const typedApi = api as unknown as PowerMiddlewareApi
  return (next) => (action) => {
    const before = typedApi.getState()
    if (advance.match(action)) syncNominationProtection(typedApi)
    const storeExtraWasActive = before.game.storeExtraVoteChoiceActive === true
    const storeVoxExtraWasActive = before.game.storeVoxExtraNominationChoiceActive === true
    const result = next(action)

    reconcileReservations(typedApi)

    const replacementState = typedApi.getState().game
    if (
      replacementState.replacementNeeded &&
      getEligibleReplacementNominees(replacementState).length === 0
    ) {
      typedApi.dispatch(resolveUnfillableReplacement())
    }

    const afterReconcile = typedApi.getState()
    if (advance.match(action) || hydrateGame.match(action)) {
      syncNominationProtection(typedApi)
    }
    if (
      advance.match(action) ||
      commitNominees.match(action) ||
      finalizeNominations.match(action) ||
      submitCoLohNomination.match(action)
    ) {
      resolveNominationProtection(typedApi, before)
    }
    if (
      submitHumanDoubleVote.match(action) &&
      storeExtraWasActive &&
      afterReconcile.game.storeExtraVoteChoiceActive !== true
    ) {
      const human = afterReconcile.game.players.find((player) => player.isUser)
      if (
        human &&
        afterReconcile.game.votes?.[`${human.id}__storeExtraVote`] &&
        reservationMatchesGame(afterReconcile, 'extra_vote')
      ) {
        typedApi.dispatch(
          consumeEyeoleanStorePower({
            productKey: 'extra_vote',
            gameId: afterReconcile.game.gameId,
          })
        )
      }
    }

    if (
      commitNominees.match(action) &&
      storeVoxExtraWasActive &&
      afterReconcile.game.storeVoxExtraNominationChoiceActive !== true &&
      reservationMatchesGame(afterReconcile, 'extra_vote')
    ) {
      typedApi.dispatch(
        consumeEyeoleanStorePower({
          productKey: 'extra_vote',
          gameId: afterReconcile.game.gameId,
        })
      )
    }

    if (
      advance.match(action) ||
      declineDoubleVoteReward.match(action) ||
      hydrateGame.match(action)
    ) {
      tryActivateExtraVote(typedApi)
    }

    if (
      advance.match(action) ||
      commitNominees.match(action) ||
      declineVoteDeduction.match(action) ||
      hydrateGame.match(action)
    ) {
      tryApplyVoteRemoval(typedApi)
    }

    return result
  }
}
