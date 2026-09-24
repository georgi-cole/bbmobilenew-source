import type { Dispatch, Middleware, MiddlewareAPI, UnknownAction } from '@reduxjs/toolkit'
import {
  activateStoreExtraVote,
  advance,
  applyStoreVoteRemoval,
  declineDoubleVoteReward,
  declineVoteDeduction,
  hydrateGame,
  submitHumanDoubleVote,
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

function reservationMatchesGame(state: PowerMiddlewareState, productKey: EyeoleanStoreProductKey): boolean {
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
}

function tryActivateExtraVote(api: PowerMiddlewareApi) {
  const state = api.getState()
  if (!reservationMatchesGame(state, 'extra_vote')) return
  if (!canTriggerStoreExtraVote(state.game)) return
  api.dispatch(activateStoreExtraVote())
}

function tryApplyVoteRemoval(api: PowerMiddlewareApi) {
  const before = api.getState()
  if (!reservationMatchesGame(before, 'remove_vote')) return
  if (!canTriggerStoreVoteRemoval(before.game)) return
  const human = before.game.players.find((player) => player.isUser)
  if (!human) return
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
    const storeExtraWasActive = before.game.storeExtraVoteChoiceActive === true
    const result = next(action)

    reconcileReservations(typedApi)

    const afterReconcile = typedApi.getState()
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
      advance.match(action) ||
      declineDoubleVoteReward.match(action) ||
      hydrateGame.match(action)
    ) {
      tryActivateExtraVote(typedApi)
    }

    if (advance.match(action) || declineVoteDeduction.match(action) || hydrateGame.match(action)) {
      tryApplyVoteRemoval(typedApi)
    }

    return result
  }
}
