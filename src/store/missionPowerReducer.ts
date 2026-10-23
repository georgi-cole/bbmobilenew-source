import { produce } from 'immer'
import type { Reducer, UnknownAction } from '@reduxjs/toolkit'
import type { GameState, Player } from '../types'
import {
  activeMissionPlayers,
  canUseMissionPower,
  createMissionPowerReward,
  getMissionLeaderIds,
  isMissionPower,
  missionPowerEndgameLocked,
  MISSION_POWER_LABELS,
} from '../bb/missionPowers'
import * as actions from './missionPowerActions'

function announce(game: GameState, text: string) {
  game.tvFeed.unshift({
    id: `mission:${game.gameId}:${game.week}:${game.tvFeed.length}`,
    text,
    type: 'game',
    timestamp: Date.now(),
    meta: { week: game.week, phase: game.phase },
  })
}

/** Ownership and declined choices are known only inside the Confessional. */
function whisper(game: GameState, text: string) {
  if (!game.secretMission) return
  const messages = (game.secretMission.privateRewardMessages ??= [])
  if (messages.at(-1) !== text) messages.push(text)
}

/** Pure game-state transitions. Cross-slice effects run only after accepted transitions. */
export function withMissionPowers(
  base: Reducer<GameState>,
  eligibleBackups: (game: GameState) => Player[]
): Reducer<GameState> {
  return (previous, action: UnknownAction) => {
    const result = base(previous, action)
    return produce(result, (game) => {
      const power = (game.missionPowers ??= {})
      const mission = game.secretMission
      const reward = mission?.reward
      const human = activeMissionPlayers(game).find((p) => p.isUser)
      if (actions.configureMissionBoxes.match(action)) {
        if (
          mission?.status === 'rewardPending' &&
          mission.rewardVersion === 2 &&
          mission.rewardSet?.selectedIndex === undefined &&
          (!mission.rewardSet || mission.rewardSet.id === action.payload.id)
        ) {
          const first = !mission.rewardSet
          mission.rewardSet = action.payload
          if (first)
            announce(
              game,
              `Big Eye: Four secret boxes are waiting. Choose one by the end of Day ${action.payload.claimUntilDay}. The offer closes sooner if no appropriate rewards remain at the next game stage.`
            )
        }
      }
      if (actions.claimMissionBox.match(action)) {
        const set = mission?.rewardSet
        if (
          !human ||
          mission?.status !== 'rewardPending' ||
          !set ||
          set.id !== action.payload.missionId ||
          game.week > set.claimUntilDay ||
          !Number.isInteger(action.payload.index) ||
          action.payload.index < 0 ||
          action.payload.index >= set.boxes.length
        )
          return
        const type = set.boxes[action.payload.index]
        if (
          missionPowerEndgameLocked(game, type) ||
          (type === 'resourceCache' &&
            (game.weekendsEnabledAtSeasonStart !== false ||
              game.weekendsEnabledForSeason !== false))
        )
          return
        set.selectedIndex = action.payload.index
        mission.reward = createMissionPowerReward(type, game.week, game.phase)
        mission.status = 'rewardClaimed'
        game.secretMissionLastResolvedDay = game.week
        if (type === 'nextNominationShield') power.openingShieldPending = true
        if (type === 'noSkip') {
          power.noSkipPending = true
          if (getMissionLeaderIds(game).includes(human.id)) power.noSkipDay = game.week + 1
        }
        for (const event of game.tvFeed)
          if (event.meta?.major === 'secret_mission_complete') event.meta.broadcastConsumed = true
        game.broadcastQueue = (game.broadcastQueue ?? []).filter(
          (id) =>
            !game.tvFeed.some((e) => e.id === id && e.meta?.major === 'secret_mission_complete')
        )
        whisper(
          game,
          `Big Eye: Your box contains ${MISSION_POWER_LABELS[type]}. Visit the Confessional for the rules and tradeoffs before its opportunity passes.`
        )
        if (power.storeUsedDay === game.week)
          whisper(
            game,
            'Big Eye: A Store power has already changed today’s game. Your mission power must wait; its deadline keeps counting down.'
          )
      }
      if (
        actions.queueMissionPowerDecision.match(action) &&
        (!power.decision || action.payload.kind === 'storeConflict') &&
        human
      )
        power.decision = action.payload
      if (actions.reserveMissionShockDay.match(action)) power.shockDay = action.payload
      if (actions.recordMissionStoreUse.match(action)) power.storeUsedDay = action.payload
      if (actions.recordMissionStoreChoice.match(action)) {
        power.decision = undefined
        power.storeChoiceDay = action.payload.day
        if (!action.payload.mission) power.storeDeferredDay = action.payload.day
        whisper(
          game,
          action.payload.mission
            ? 'Big Eye: Your unused Store powers have been disarmed and returned to inventory. Your mission power has priority today.'
            : 'Big Eye: Your Store powers keep priority today. Your mission power remains subject to its deadline.'
        )
      }
      if (
        actions.armMissionOpeningShield.match(action) &&
        human &&
        power.openingShieldPending &&
        canUseMissionPower(game, 'nextNominationShield')
      ) {
        game.lohNominationPlan = undefined
        game.lohSocialPlan = null
        power.openingShieldPending = false
        power.openingShieldDay = game.week
        if (game.lastHohCompFinisherId === human.id) {
          power.automaticNomineeFromId = human.id
          const ranking = [
            ...(game.lastCompetitionResolution?.placements ?? game.players.map((p) => p.id)),
          ].reverse()
          game.lastHohCompFinisherId =
            ranking.find(
              (id) =>
                id !== human.id &&
                id !== game.lohId &&
                activeMissionPlayers(game).some((p) => p.id === id)
            ) ?? null
          power.automaticNomineeToId = game.lastHohCompFinisherId ?? undefined
          if (game.voxPopuli) game.voxPopuli.autoNomineeId = game.lastHohCompFinisherId
          announce(
            game,
            `Big Eye: Your shield blocks the automatic nomination. It passes to ${game.players.find((p) => p.id === game.lastHohCompFinisherId)?.name ?? 'the next eligible finisher'}. The original competition results remain on record.`
          )
        }
        power.usedDay = game.week
        if (reward) {
          reward.consumed = true
          reward.eligible = false
        }
        announce(
          game,
          `${human.name} is protected at this opening nomination ceremony, including automatic nomination. Safety backups remain possible.`
        )
      }
      if (actions.stageMissionSafety.match(action) && !power.safetyIntent) {
        power.safetyIntent = action.payload
        const holder = game.players.find((p) => p.id === game.posWinnerId)
        const target = game.players.find((p) => p.id === action.payload.targetId)
        const variations = [
          `${holder?.name ?? 'The holder'} has decided to use the Power of Safety on ${target?.name ?? 'a nominee'}. The nominations are about to change!`,
          `${holder?.name ?? 'The holder'} is preparing to save ${target?.name ?? 'a nominee'}. The Power of Safety is in play!`,
          `${holder?.name ?? 'The holder'} intends to use the Power of Safety on ${target?.name ?? 'a nominee'}. The block hangs in the balance!`,
        ]
        announce(game, variations[(game.week + game.tvFeed.length) % variations.length])
      }
      if (actions.clearMissionSafety.match(action)) power.safetyIntent = undefined
      if (actions.prepareMissionSafetyCommit.match(action)) {
        game.phase = 'pos_ceremony_results'
        game.awaitingPovDecision = false
        game.awaitingPovSaveTarget = true
        if (action.payload.seed !== undefined) game.seed = action.payload.seed
      }
      if (actions.cancelMissionSafety.match(action) && power.safetyIntent) {
        power.safetyIntent = undefined
        power.decision = undefined
        game.phase = 'pos_ceremony_results'
        game.awaitingPovDecision = false
        game.awaitingPovSaveTarget = false
        game.aiReplacementStep = 0
        game.aiReplacementWaiting = false
        game.replacementNeeded = false
        if (reward?.type === 'vetoSafety') {
          reward.consumed = true
          reward.eligible = false
          reward.usedDay = game.week
        }
        power.usedDay = game.week
        announce(
          game,
          'Big Eye: Veto the Safety has canceled the intended save. The nominations remain unchanged.'
        )
      }
      if (actions.answerMissionPowerDecision.match(action)) {
        const decision = power.decision
        if (
          !decision ||
          decision.kind === 'backupTarget' ||
          decision.kind === 'storeConflict' ||
          (decision.targetId !== undefined &&
            (decision.kind === 'overthrowLoh' || decision.kind === 'coLoh') &&
            decision.targetId !== game.lohId) ||
          decision.id !== action.payload.id ||
          !human ||
          !reward ||
          !canUseMissionPower(game, decision.kind)
        )
          return
        power.decision = undefined
        power.offeredKeys = [...(power.offeredKeys ?? []), decision.id]
        if (decision.kind === 'vetoSafety') return // Middleware resolves the saved intent.
        if (decision.kind === 'pickBackup') {
          if (action.payload.accept && eligibleBackups(game).filter((p) => !p.isUser).length)
            power.decision = { ...decision, id: `${decision.id}:target`, kind: 'backupTarget' }
          return
        }
        if (decision.kind === 'noAmbush') {
          reward.consumed = true
          reward.eligible = false
          if (action.payload.accept) {
            power.noAmbushDay = game.week
            power.usedDay = game.week
          }
          ;(action.payload.accept ? announce : whisper)(
            game,
            action.payload.accept
              ? 'Big Eye: No Ambush protects you from Safety backups for this ceremony.'
              : 'Big Eye: You declined No Ambush. This one-ceremony power is spent.'
          )
        }
        if (decision.kind === 'overthrowLoh') {
          const old = game.players.find((p) => p.id === game.lohId)
          if (!old || old.isUser || (game.coLohIds?.length ?? 0) > 1) return
          reward.consumed = true
          reward.eligible = false
          if (action.payload.accept) {
            old.status = 'active'
            human.status = 'loh'
            game.lohId = human.id
            game.lohNominationPlan = undefined
            game.lohSocialPlan = null
            game.lohSafetyAdvice = null
            game.coLohIds = null
            power.usedDay = game.week
            if (game.lastHohCompFinisherId === human.id)
              game.lastHohCompFinisherId =
                activeMissionPlayers(game)
                  .filter((p) => !p.isUser && p.id !== old.id)
                  .at(-1)?.id ?? old.id
            announce(
              game,
              `${human.name} used Overthrow the LOH. ${old.name} won the competition, but the crown and leadership now belong to ${human.name}!`
            )
          } else whisper(game, 'Big Eye: Overthrow the LOH was declined and is now spent.')
        }
        if (decision.kind === 'coLoh' && action.payload.accept) {
          const old = game.players.find((p) => p.id === game.lohId)
          if (
            !old ||
            old.isUser ||
            activeMissionPlayers(game).length < 5 ||
            (game.coLohIds?.length ?? 0) > 1
          )
            return
          const candidates = eligibleBackups(game).filter((p) => !p.isUser)
          if (candidates.length < (game.publicModeEnabled ? 4 : 3)) return
          game.coLohIds = [old.id, human.id]
          human.status = 'loh'
          game.coLohNomineeByCoLohId = {}
          game.lohNominationPlan = undefined
          game.lohSocialPlan = null
          power.coLohBan = { day: game.week + 1, ids: [...game.coLohIds] }
          reward.consumed = true
          reward.eligible = false
          power.usedDay = game.week
          announce(
            game,
            `${human.name} joins ${old.name} as Co-LOH. Each names one nominee. Both sit out tomorrow’s LOH competition unless it is Democracia.`
          )
        }
      }
      if (actions.selectMissionBackup.match(action)) {
        const decision = power.decision
        if (
          decision?.kind !== 'backupTarget' ||
          decision.id !== action.payload.id ||
          !human ||
          !canUseMissionPower(game, 'pickBackup') ||
          action.payload.targetId === human.id ||
          !eligibleBackups(game).some((p) => p.id === action.payload.targetId)
        )
          return
        const selected = game.players.find((p) => p.id === action.payload.targetId)!
        game.nomineeIds.push(selected.id)
        selected.status = 'nominated'
        if (selected.stats) selected.stats.timesNominated += 1
        game.replacementNomineeIds = [...(game.replacementNomineeIds ?? []), selected.id]
        if (game.coLohReplacementOwnerId) {
          game.coLohNomineeByCoLohId ??= {}
          game.coLohNomineeByCoLohId[game.coLohReplacementOwnerId] = selected.id
        }
        game.coLohReplacementOwnerId = null
        game.replacementNeeded = false
        game.aiReplacementStep = 0
        game.aiReplacementWaiting = false
        power.backupChooserId = human.id
        power.decision = undefined
        power.usedDay = game.week
        if (reward) {
          reward.consumed = true
          reward.eligible = false
        }
        announce(game, `${human.name} used Pick the Backup and nominated ${selected.name}.`)
      }
      if (actions.expireNewMissionReward.match(action) && mission) {
        if (mission.status === 'rewardPending') mission.status = 'expired'
        else if (reward && isMissionPower(reward.type)) {
          reward.expired = true
          reward.consumed = true
          reward.eligible = false
        }
        power.decision = undefined
        whisper(game, `Big Eye: ${action.payload}`)
      }
      if (
        actions.recordMissionAllianceReveal.match(action) &&
        mission?.rewardSet?.id === action.payload.missionId &&
        mission.reward?.type === 'allianceReveal'
      )
        mission.allianceReveal = action.payload
      if (action.type === 'game/completeWeekendForSimulation' && game.weekendInterlude?.active) {
        const weekend = game.weekendInterlude
        if (weekend.finaleWeekend) {
          game.finaleWeekendCompleted = true
          game.phase = 'final3'
        } else
          game.completedWeekendDays = Array.from(
            new Set([...(game.completedWeekendDays ?? []), weekend.afterDay])
          )
        game.weekendInterlude = null
      }
      if (
        previous &&
        game.gameId === previous.gameId &&
        action.type !== 'game/hydrateGame' &&
        game.week !== previous.week
      ) {
        power.backupChooserId = undefined
        power.automaticNomineeFromId = undefined
        power.automaticNomineeToId = undefined
        power.outgoingLohIds = getMissionLeaderIds(previous)
        power.decision = undefined
        power.safetyIntent = undefined
      }
      if (power.noSkipDay !== undefined && power.noSkipDay < game.week && power.noSkipPending)
        power.noSkipDay = undefined
      if (
        human &&
        power.noSkipPending &&
        getMissionLeaderIds(game).includes(human.id) &&
        (!power.noSkipDay ||
          (game.democracia?.active && game.phase === 'loh_results' && power.noSkipDay <= game.week))
      )
        power.noSkipDay = game.week + 1
      const challenge =
        action.type === 'challenge/setPendingChallenge'
          ? (action.payload as { prizeType?: string; participants?: string[] } | undefined)
          : undefined
      const admitted =
        (challenge?.prizeType === 'LOH' && human && challenge.participants?.includes(human.id)) ||
        (previous?.phase === 'loh_comp' && game.phase === 'loh_results')
      if (
        power.noSkipDay === game.week &&
        admitted &&
        power.coLohBan?.day !== game.week &&
        !game.democracia?.active &&
        reward?.type === 'noSkip'
      ) {
        power.usedDay = game.week
        power.noSkipAdmittedDay = game.week
        power.noSkipPending = false
        reward.consumed = true
        reward.eligible = false
      }
    })
  }
}
