import { produce } from 'immer'
import type { Middleware, UnknownAction } from '@reduxjs/toolkit'
import type { GameState } from '../types'
import type { SocialState } from '../social/types'
import type { ProfilesState } from './profilesSlice'
import type { SettingsState } from './settingsSlice'
type MissionMiddlewareState = {
  game: GameState
  social: SocialState
  profiles: ProfilesState
  settings: SettingsState
}
import gameReducer, { getEligibleReplacementNominees } from './gameSlice'
import {
  activeMissionPlayers,
  canUseMissionPower,
  drawMissionBoxes,
  getMissionPowerPool,
  isInstantMissionPower,
  isMissionPower,
  missionPowerDayBlocked,
  missionPowerHasPriority,
  missionRandomIndex,
  missionPowerEndgameLocked,
} from '../bb/missionPowers'
import * as commands from './missionPowerActions'
import { isCurrentAlliance } from '../social/reality/allianceIdentity'
import { recordRealityAllianceDiscovery } from '../social/reality/allianceKnowledge'
import { commitRealityDomainUpdate, grantSecretMissionResourceCache } from '../social/socialSlice'
import { returnEyeoleanStorePower } from './profilesSlice'
import { hasDirectorSpotlightRoom, isWithinDirectorWindow } from '../features/twists/seasonDirector'

function reservations(state: MissionMiddlewareState) {
  const profile = state.profiles.profiles.find((p) => p.id === state.profiles.activeProfileId)
  return Object.values(profile?.eyeoleanPowerReservations ?? {}).filter(
    (r) => r.gameId === state.game.gameId
  )
}
function alliances(state: MissionMiddlewareState) {
  const humanId = state.game.players.find((p) => p.isUser)?.id
  const alive = new Set(activeMissionPlayers(state.game).map((p) => p.id))
  return Object.values(state.social.reality.alliances)
    .filter(
      (a) =>
        isCurrentAlliance(a) &&
        !a.memberIds.includes(humanId ?? '') &&
        a.memberIds.filter((id) => alive.has(id)).length >= 2
    )
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Runs before social/economy observers: a staged save has no gameplay effects. */
export const missionPowerMiddleware: Middleware<object, MissionMiddlewareState> = (api) => {
  let reconciling = false
  let committingSafety = false
  function queue(
    kind: Parameters<typeof commands.queueMissionPowerDecision>[0]['kind'],
    key: string,
    targetId?: string
  ) {
    const game = api.getState().game
    const existing = game.missionPowers?.decision
    if (
      (existing && (kind !== 'storeConflict' || existing.kind === 'storeConflict')) ||
      game.missionPowers?.offeredKeys?.includes(key)
    )
      return
    api.dispatch(commands.queueMissionPowerDecision({ kind, id: key, targetId }))
  }
  function checkStore(): boolean {
    const state = api.getState()
    if (state.game.missionPowers?.storeUsedDay === state.game.week) return false
    if (
      reservations(state).length &&
      state.game.missionPowers?.storeChoiceDay !== state.game.week
    ) {
      queue('storeConflict', `${state.game.gameId}:${state.game.week}:store`)
      return false
    }
    return true
  }
  function reconcile() {
    if (reconciling) return
    reconciling = true
    try {
      let state = api.getState()
      let game = state.game
      let mission = game.secretMission
      if (!mission || mission.rewardVersion !== 2) return
      const human = activeMissionPlayers(game).find((p) => p.isUser)
      if (!human) return
      const plan = game.seasonDirectorPlan
      const count = activeMissionPlayers(game).length
      const forced = game.pendingForcedShock
      const forcedToday =
        forced &&
        forced.earliestWeek <= game.week &&
        [
          'doubleEviction',
          'vip',
          'diamond',
          'coup',
          'spotlight',
          'democracia',
          'battleBack',
        ].includes(forced.type)
      const laterShock =
        state.settings.sim.enableTwists &&
        plan &&
        hasDirectorSpotlightRoom(game) &&
        ((!game.doubleEviction?.usedCount &&
          plan.selections.doubleElimination &&
          plan.policy.doubleElimination.enabled &&
          isWithinDirectorWindow(
            count,
            plan.policy.doubleElimination,
            plan.policy.pacing.finaleLockPlayers
          )) ||
          (game.voxPopuli?.status !== 'active' &&
            !game.specialVeto?.seasonUsed &&
            plan.selections.specialSafetyType &&
            plan.policy.specialSafety.enabled &&
            isWithinDirectorWindow(
              count,
              plan.policy.specialSafety,
              plan.policy.pacing.finaleLockPlayers
            )))
      if ((forcedToday || laterShock) && game.missionPowers?.shockDay !== game.week)
        api.dispatch(commands.reserveMissionShockDay(game.week))
      state = api.getState()
      game = state.game
      mission = game.secretMission!
      if (mission.status === 'rewardPending') {
        const available = mission.rewardSet?.availableDay ?? game.week
        const pool = getMissionPowerPool(game, alliances(state).length > 0)
        if (!pool.length || game.week > (mission.rewardSet?.claimUntilDay ?? available + 1)) {
          api.dispatch(
            commands.expireNewMissionReward(
              !pool.length
                ? 'No appropriate box reward remains at this stage. Your unclaimed offer has expired.'
                : 'The two-day deadline to claim your mission box has passed.'
            )
          )
          return
        }
        if (!mission.rewardSet) {
          const id = `${game.gameId}:${mission.missionNumber ?? 1}:${mission.triggeredDay}`
          api.dispatch(
            commands.configureMissionBoxes({
              version: 2,
              id,
              availableDay: available,
              claimUntilDay: available + 1,
              boxes: drawMissionBoxes(pool, id),
            })
          )
        } else if (mission.rewardSet.boxes.some((type) => !pool.includes(type))) {
          const replacement = drawMissionBoxes(pool, mission.rewardSet.id)
          api.dispatch(
            commands.configureMissionBoxes({
              ...mission.rewardSet,
              boxes: mission.rewardSet.boxes.map((type, i) =>
                pool.includes(type) ? type : replacement[i]
              ),
            })
          )
        }
      }
      state = api.getState()
      game = state.game
      mission = game.secretMission!
      const reward = mission.reward
      if (!reward || !isMissionPower(reward.type)) return
      if (
        reward.eligible &&
        (missionPowerEndgameLocked(game, reward.type) ||
          (reward.activeUntilDay !== undefined && game.week > reward.activeUntilDay))
      ) {
        api.dispatch(
          commands.expireNewMissionReward(
            'Your mission power has reached its deadline or endgame cutoff and is now spent.'
          )
        )
        return
      }
      if (
        mission.status === 'rewardClaimed' &&
        reward.type === 'resourceCache' &&
        mission.rewardSet
      ) {
        api.dispatch(
          grantSecretMissionResourceCache({ playerId: human.id, receiptId: mission.rewardSet.id })
        )
      }
      if (
        mission.status === 'rewardClaimed' &&
        reward.type === 'allianceReveal' &&
        !mission.allianceReveal &&
        mission.rewardSet
      ) {
        const availableAlliances = alliances(state)
        const selected =
          availableAlliances[
            missionRandomIndex(`${mission.rewardSet.id}:alliance`, availableAlliances.length)
          ]
        if (selected) {
          const reveal = {
            missionId: mission.rewardSet.id,
            allianceId: selected.id,
            name: selected.name ?? 'Unnamed alliance',
            memberIds: [...selected.memberIds],
            day: game.week,
          }
          const domain = produce(state.social.reality, (draft) => {
            recordRealityAllianceDiscovery(draft, {
              allianceId: selected.id,
              observerId: human.id,
              revealedMemberIds: [...selected.memberIds],
              maximumMembers: selected.memberIds.length,
              fullMembershipKnown: true,
              confidence: 0.96,
              at: { day: game.week, phase: game.phase },
              sourceEventId: `mission-alliance:${mission.rewardSet!.id}`,
              sourceType: 'DIRECT',
            })
          })
          api.dispatch(commitRealityDomainUpdate({ domain }))
          api.dispatch(commands.recordMissionAllianceReveal(reveal))
        }
      }
      if (!reward.eligible || isInstantMissionPower(reward.type) || missionPowerDayBlocked(game))
        return
      if (!checkStore()) return
      const key = `${game.gameId}:${game.week}:${game.lohId}`
      if (
        game.phase === 'loh_results' &&
        game.lohId !== human.id &&
        (game.coLohIds?.length ?? 0) < 2
      ) {
        if (
          reward.type === 'overthrowLoh' &&
          !(reward.claimDay === game.week && reward.claimPhase === 'loh_results') &&
          canUseMissionPower(game, 'overthrowLoh')
        )
          queue('overthrowLoh', `${key}:overthrow`, game.lohId ?? undefined)
        if (
          reward.type === 'coLoh' &&
          canUseMissionPower(game, 'coLoh') &&
          count >= 5 &&
          getEligibleReplacementNominees(game).filter((p) => !p.isUser).length >=
            (game.publicModeEnabled ? 4 : 3)
        )
          queue('coLoh', `${key}:co`, game.lohId ?? undefined)
      }
      const intent = game.missionPowers?.safetyIntent
      if (intent) {
        if (canUseMissionPower(game, 'vetoSafety') && game.posWinnerId !== human.id)
          queue('vetoSafety', `${intent.id}:veto`, intent.targetId)
        if (
          canUseMissionPower(game, 'noAmbush') &&
          (game.voxPopuli?.status !== 'active' ||
            game.nomineeIds.length - 1 < (game.doubleEviction?.weekActive ? 3 : 2)) &&
          !game.nomineeIds.includes(human.id) &&
          human.id !== game.lohId &&
          human.id !== game.posWinnerId
        )
          queue('noAmbush', `${intent.id}:ambush`)
      }
      if (
        (game.replacementNeeded || (game.aiReplacementStep ?? 0) > 0) &&
        canUseMissionPower(game, 'pickBackup') &&
        getEligibleReplacementNominees(game).filter((p) => !p.isUser).length
      )
        queue('pickBackup', `${game.gameId}:${game.week}:backup`)
    } finally {
      reconciling = false
    }
  }
  return (next) => (action) => {
    if (!action || typeof action !== 'object' || !('type' in action)) return next(action)
    const command = action as UnknownAction
    const before = api.getState()
    if (command.type === 'profiles/armEyeoleanStorePower' && missionPowerHasPriority(before.game))
      return action
    const game = before.game
    const power = game.missionPowers
    if (commands.answerMissionPowerDecision.match(command)) {
      const decision = power?.decision
      if (!decision || decision.id !== command.payload.id) return action
      if (decision.kind !== 'storeConflict' && !checkStore()) return action
      if (decision.kind === 'storeConflict') {
        if (command.payload.accept) {
          for (const reservation of reservations(before))
            api.dispatch(
              returnEyeoleanStorePower({
                productKey: reservation.productKey,
                gameId: reservation.gameId,
              })
            )
          // Removing reservations must also remove their unused temporary shields.
          for (const shield of game.storeNominationProtections ?? [])
            api.dispatch({
              type: 'game/clearStoreNominationProtection',
              payload: shield.productKey,
            })
        }
        api.dispatch(
          commands.recordMissionStoreChoice({ day: game.week, mission: command.payload.accept })
        )
        reconcile()
        return action
      }
      const result = next(action)
      if (
        decision.kind === 'vetoSafety' &&
        game.missionPowers?.safetyIntent &&
        canUseMissionPower(game, 'vetoSafety')
      ) {
        if (command.payload.accept) api.dispatch(commands.cancelMissionSafety())
        else commitSafety()
      }
      reconcile()
      return result
    }
    if (command.type === 'game/advance' && power?.safetyIntent) {
      reconcile()
      if (!api.getState().game.missionPowers?.decision) commitSafety()
      return action
    }
    if (
      !committingSafety &&
      !power?.safetyIntent &&
      !power?.decision &&
      !game.specialVeto?.activeType &&
      game.cupidArrow?.status !== 'active' &&
      (command.type === 'game/submitPovSaveTarget' ||
        (command.type === 'game/advance' && game.phase === 'pos_ceremony'))
    ) {
      const preview = gameReducer(game, command)
      const targetId = game.nomineeIds.find((id) => !preview.nomineeIds.includes(id))
      if (targetId && preview.povSavedId) {
        api.dispatch(
          commands.stageMissionSafety({
            id: `${game.gameId}:${game.week}:${game.posWinnerId}:${targetId}`,
            targetId,
            resolvedSeed: preview.seed,
            action: {
              type: command.type,
              ...('payload' in command ? { payload: command.payload } : {}),
            },
          })
        )
        reconcile()
        return action
      }
    }
    if (
      command.type === 'game/advance' &&
      game.phase === 'nominations' &&
      game.missionPowers?.openingShieldPending &&
      canUseMissionPower(game, 'nextNominationShield')
    ) {
      if (!checkStore()) return action
      api.dispatch(commands.armMissionOpeningShield())
    }
    const result = next(action)
    const after = api.getState()
    if (
      command.type === 'profiles/consumeEyeoleanStorePower' &&
      after.game.missionPowers?.storeUsedDay !== after.game.week
    )
      api.dispatch(commands.recordMissionStoreUse(after.game.week))
    reconcile()
    return result
  }
  function commitSafety() {
    const intent = api.getState().game.missionPowers?.safetyIntent
    if (!intent) return
    api.dispatch(commands.clearMissionSafety())
    committingSafety = true
    try {
      if (intent.action.type === 'game/advance') {
        api.dispatch(commands.prepareMissionSafetyCommit({ seed: intent.resolvedSeed }))
        api.dispatch({ type: 'game/submitPovSaveTarget', payload: intent.targetId })
      } else api.dispatch(intent.action)
    } finally {
      committingSafety = false
    }
  }
}
