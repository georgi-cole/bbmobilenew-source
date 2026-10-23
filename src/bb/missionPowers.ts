import type { GameState, Phase } from '../types'
import type { SecretMissionReward } from './secretMission'

export const MISSION_POWER_TYPES = [
  'noAmbush',
  'nextNominationShield',
  'resourceCache',
  'overthrowLoh',
  'noSkip',
  'vetoSafety',
  'pickBackup',
  'coLoh',
  'allianceReveal',
] as const
export type MissionPowerType = (typeof MISSION_POWER_TYPES)[number]
export type MissionPowerDecisionKind =
  | 'storeConflict'
  | 'noAmbush'
  | 'overthrowLoh'
  | 'vetoSafety'
  | 'pickBackup'
  | 'backupTarget'
  | 'coLoh'

export interface MissionPowerDecision {
  id: string
  kind: MissionPowerDecisionKind
  targetId?: string
}
export interface MissionSafetyIntent {
  id: string
  targetId: string
  resolvedSeed?: number
  /** Replay the validated original action only after the interruption resolves. */
  action: { type: string; payload?: unknown }
}
export interface MissionPowerState {
  decision?: MissionPowerDecision
  safetyIntent?: MissionSafetyIntent
  noAmbushDay?: number
  automaticNomineeFromId?: string
  automaticNomineeToId?: string
  openingShieldDay?: number
  openingShieldPending?: boolean
  noSkipPending?: boolean
  noSkipDay?: number
  noSkipAdmittedDay?: number
  coLohBan?: { day: number; ids: string[] }
  outgoingLohIds?: string[]
  storeChoiceDay?: number
  storeDeferredDay?: number
  storeUsedDay?: number
  usedDay?: number
  shockDay?: number
  offeredKeys?: string[]
  backupOwnerId?: string | null
  backupChooserId?: string
}
export interface MissionRewardSet {
  version: 2
  id: string
  availableDay: number
  claimUntilDay: number
  boxes: MissionPowerType[]
  selectedIndex?: number
}

declare module '../types' {
  interface GameState {
    missionPowers?: MissionPowerState
    weekendsEnabledAtSeasonStart?: boolean
    firstRealWeekendStarted?: boolean
  }
}

export const MISSION_POWER_LABELS: Record<MissionPowerType, string> = {
  noAmbush: 'No Ambush',
  nextNominationShield: 'No Next Nomination',
  resourceCache: 'Resource Cache',
  overthrowLoh: 'Overthrow the LOH',
  noSkip: 'No Skip',
  vetoSafety: 'Veto the Safety',
  pickBackup: 'Pick the Backup',
  coLoh: 'Co-LOH',
  allianceReveal: 'Alliance Revealed',
}

export function isMissionPower(type: string): type is MissionPowerType {
  return (MISSION_POWER_TYPES as readonly string[]).includes(type)
}
export function activeMissionPlayers(game: GameState) {
  return game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
}
export function isTimedMissionPower(type: string): boolean {
  return type === 'vetoSafety' || type === 'pickBackup' || type === 'coLoh'
}
export function isInstantMissionPower(type: string): boolean {
  return type === 'resourceCache' || type === 'allianceReveal'
}
export function missionPowerEndgameLocked(game: GameState, type: string): boolean {
  const count = activeMissionPlayers(game).length
  if (isInstantMissionPower(type)) return false
  return (
    count <= (type === 'overthrowLoh' || type === 'noSkip' ? 3 : 4) ||
    game.phase.startsWith('final3') ||
    Boolean(game.seasonFinale)
  )
}
export function canUseMissionPower(game: GameState, type: MissionPowerType): boolean {
  const reward = game.secretMission?.reward
  const human = activeMissionPlayers(game).find((p) => p.isUser)
  return Boolean(
    human &&
    reward?.type === type &&
    reward.eligible &&
    !reward.expired &&
    !reward.consumed &&
    !missionPowerEndgameLocked(game, type) &&
    (!reward.activeUntilDay || game.week <= reward.activeUntilDay) &&
    (!reward.activeFromDay || game.week >= reward.activeFromDay) &&
    !missionPowerDayBlocked(game)
  )
}
export function missionPowerDayBlocked(game: GameState): boolean {
  return (
    game.missionPowers?.shockDay === game.week ||
    game.missionPowers?.storeDeferredDay === game.week ||
    game.missionPowers?.storeUsedDay === game.week ||
    game.storeExtraVoteChoiceActive === true ||
    game.storeVoxExtraNominationChoiceActive === true ||
    Boolean(
      game.doubleEviction?.weekActive ||
      game.specialVeto?.activeType ||
      game.democracia?.active ||
      game.battleBack?.active ||
      game.cupidArrow?.status === 'active'
    )
  )
}
export function missionPowerHasPriority(game: GameState): boolean {
  return (
    game.missionPowers?.usedDay === game.week ||
    (game.missionPowers?.storeChoiceDay === game.week &&
      game.missionPowers?.storeDeferredDay !== game.week)
  )
}
export function getMissionPowerPool(game: GameState, hasAlliance: boolean): MissionPowerType[] {
  if (game.mode === 'survival' || game.cupidArrow?.status === 'active') return []
  const vox = game.voxPopuli?.status === 'active'
  return MISSION_POWER_TYPES.filter((type) => {
    if (missionPowerEndgameLocked(game, type)) return false
    if (type === 'resourceCache')
      return game.weekendsEnabledAtSeasonStart === false && game.weekendsEnabledForSeason === false
    if (type === 'allianceReveal') return hasAlliance
    if (type === 'noSkip' && activeMissionPlayers(game).length <= 4) return false
    if (vox && ['overthrowLoh', 'noSkip', 'pickBackup', 'coLoh'].includes(type)) return false
    return true
  })
}
export function missionRandomIndex(identity: string, length: number): number {
  let seed = 2166136261
  for (const char of identity) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return length > 0 ? seed % length : 0
}

export function drawMissionBoxes(pool: MissionPowerType[], identity: string): MissionPowerType[] {
  if (!pool.length) return []
  let seed = 2166136261
  for (const char of identity) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  const values = [...pool]
  for (let i = values.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return Array.from({ length: 4 }, (_, i) => values[i % values.length])
}
export function createMissionPowerReward(
  type: MissionPowerType,
  day: number,
  phase: Phase
): SecretMissionReward {
  // If today's checkpoint is over, the two usable days begin tomorrow.
  const afterLoh = !['week_start', 'loh_comp_announcement', 'loh_comp'].includes(phase)
  const afterSafety = [
    'social_2',
    'live_vote',
    'eviction_results',
    'week_end',
    'final4_eviction',
  ].includes(phase)
  const start = day + ((type === 'coLoh' ? afterLoh : afterSafety) ? 1 : 0)
  return {
    type,
    consumed: isInstantMissionPower(type),
    expired: false,
    eligible: !isInstantMissionPower(type),
    claimDay: day,
    claimPhase: phase,
    ...(isTimedMissionPower(type) ? { activeFromDay: start, activeUntilDay: start + 1 } : {}),
  }
}
export function isMissionOpeningProtected(game: GameState, id: string): boolean {
  return (
    activeMissionPlayers(game).length > 4 &&
    game.players.some((p) => p.id === id && p.isUser) &&
    game.missionPowers?.openingShieldDay === game.week
  )
}
export function isMissionBackupProtected(game: GameState, id: string): boolean {
  return (
    activeMissionPlayers(game).length > 4 &&
    game.players.some((p) => p.id === id && p.isUser) &&
    game.missionPowers?.noAmbushDay === game.week
  )
}
export function getMissionLeaderIds(game: GameState): string[] {
  return game.coLohIds?.length ? game.coLohIds : game.lohId ? [game.lohId] : []
}
export function getMissionOutgoingIds(game: GameState): string[] {
  if (
    game.voxPopuli?.status === 'active' ||
    game.democracia?.active ||
    game.phase.startsWith('final3')
  )
    return []
  const ids = game.missionPowers?.outgoingLohIds ?? (game.prevHohId ? [game.prevHohId] : [])
  const ban = game.missionPowers?.coLohBan
  if (ban?.day === game.week) return Array.from(new Set([...ids, ...ban.ids]))
  if (
    game.missionPowers?.noSkipDay === game.week &&
    !missionPowerDayBlocked(game) &&
    !game.missionPowers?.decision
  )
    return ids.filter((id) => !game.players.some((p) => p.id === id && p.isUser))
  return ids
}
export function missionPowerDetail(reward: SecretMissionReward): string {
  const expiry = reward.activeUntilDay
    ? ` Usable on Days ${reward.activeFromDay ?? reward.claimDay}–${reward.activeUntilDay}; shock days count.`
    : ''
  const detail: Partial<Record<MissionPowerType, string>> = {
    noAmbush:
      'Choose protection from backups at one qualifying Safety ceremony. Unavailable at Final 4.',
    nextNominationShield:
      'Protected at the next opening nomination ceremony, including automatic nomination. Safety backups remain possible. Unavailable at Final 4.',
    overthrowLoh:
      'Offered at the next eligible AI LOH victory. Accept or decline once. Unavailable at Final 3.',
    noSkip:
      'Compete once on the day after your current or next LOH tenure. Unavailable at Final 3.',
    vetoSafety: 'Cancel another player’s intended Safety save. Unavailable at Final 4.',
    pickBackup: 'Choose whether to name one LOH-owned Safety backup. Unavailable at Final 4.',
    coLoh:
      'Join the next eligible AI LOH. Each names one nominee; both sit out tomorrow except during Democracia. Unavailable at Final 4.',
    resourceCache:
      'Grants up to 25 Social Energy, 500 Influence and 1,000 Information, respecting caps.',
    allianceReveal: 'Big Eye privately confirms one real alliance and its members.',
  }
  return (detail[reward.type as MissionPowerType] ?? '') + expiry
}
