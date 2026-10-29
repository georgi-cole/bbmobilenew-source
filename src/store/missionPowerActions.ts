import { createAction } from '@reduxjs/toolkit'
import type {
  MissionPowerDecision,
  MissionRewardSet,
  MissionSafetyIntent,
} from '../bb/missionPowers'

export const configureMissionBoxes = createAction<MissionRewardSet>('game/configureMissionBoxes')
export const claimMissionBox = createAction<{ missionId: string; index: number }>(
  'game/claimMissionBox'
)
export const queueMissionPowerDecision = createAction<MissionPowerDecision>(
  'game/queueMissionPowerDecision'
)
export const answerMissionPowerDecision = createAction<{ id: string; accept: boolean }>(
  'game/answerMissionPowerDecision'
)
export const selectMissionBackup = createAction<{ id: string; targetId: string }>(
  'game/selectMissionBackup'
)
export const stageMissionSafety = createAction<MissionSafetyIntent>('game/stageMissionSafety')
export const clearMissionSafety = createAction('game/clearMissionSafety')
export const cancelMissionSafety = createAction('game/cancelMissionSafety')
export const reserveMissionShockDay = createAction<number>('game/reserveMissionShockDay')
export const recordMissionStoreUse = createAction<number>('game/recordMissionStoreUse')
export const recordMissionStoreChoice = createAction<{ day: number; mission: boolean }>(
  'game/recordMissionStoreChoice'
)
export const armMissionOpeningShield = createAction('game/armMissionOpeningShield')
export const expireNewMissionReward = createAction<string>('game/expireNewMissionReward')
export const recordMissionAllianceReveal = createAction<{
  missionId: string
  allianceId: string
  name: string
  memberIds: string[]
  day: number
}>('game/recordMissionAllianceReveal')

export const prepareMissionSafetyCommit = createAction<{ seed?: number }>(
  'game/prepareMissionSafetyCommit'
)
