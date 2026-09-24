import type { GameState, SpecialVetoType } from '../../types'
import type {
  RemoteDirectorWindow,
  RemoteSeasonDirectorConfig,
} from '../../remoteConfig/remoteConfigTypes'

export type SeasonDirectorKillSwitch =
  | 'secretMissions'
  | 'doubleElimination'
  | 'specialSafety'
  | 'morningShock'
  | 'battleBack'

export interface SeasonDirectorWindow {
  minPlayers: number
  maxPlayers: number
}

export interface SeasonDirectorPolicy {
  schemaVersion: 1
  revision: string
  enabled: boolean
  pacing: {
    finaleLockPlayers: number
    minimumSpotlightGapDays: number
    preventSameSceneMajorEvents: boolean
  }
  secretMissions: {
    enabled: boolean
    first: SeasonDirectorWindow & { chance: number }
    second: SeasonDirectorWindow & { chance: number; minimumGapDays: number }
  }
  doubleElimination: SeasonDirectorWindow & {
    enabled: boolean
    seasonChance: number
    maxPerSeason: 1
  }
  specialSafety: SeasonDirectorWindow & {
    enabled: boolean
    seasonChance: number
    maxPerSeason: 1
    weights: Record<SpecialVetoType, number>
  }
  morningShock: SeasonDirectorWindow & {
    enabled: boolean
    seasonChance: number
    maxPerSeason: 1
  }
  battleBack: {
    enabled: boolean
    human: {
      guaranteedOpportunityAfterEviction: boolean
      maxGuaranteedOpportunitiesPerSeason: 1
      minimumActivePlayersAfterEviction: number
      minimumCandidates: number
    }
    aiOnly: SeasonDirectorWindow & {
      seasonChance: number
      minimumCandidates: number
      maxPerSeason: 1
    }
  }
  lifetimeSpecials: {
    twinShock: {
      enabled: boolean
      countsAgainstShockBudget: false
      allowWithOtherSeasonShocks: true
      consumeOnlyAfterResolution: true
    }
  }
}

export interface SeasonDirectorPlan {
  schemaVersion: 1
  revision: string
  season: number
  seed: number
  policy: SeasonDirectorPolicy
  selections: {
    firstSecretMission: boolean
    secondSecretMission: boolean
    doubleElimination: boolean
    specialSafetyType: SpecialVetoType | null
    morningShock: boolean
    aiBattleBack: boolean
  }
}

declare module '../../types' {
  interface GameState {
    /**
     * Immutable orchestration snapshot generated when a season starts.
     * Existing seasons keep this policy even if remote live-config changes.
     */
    seasonDirectorPlan?: SeasonDirectorPlan
    /** Day of the most recent Director-controlled major spotlight. */
    seasonDirectorLastSpotlightDay?: number | null
    /** True after the human has received their one guaranteed return opportunity. */
    seasonDirectorHumanReturnUsed?: boolean
    /** True after the optional AI-only Battle Back has been consumed. */
    seasonDirectorAiBattleBackUsed?: boolean
  }
}

export const DEFAULT_SEASON_DIRECTOR_POLICY: SeasonDirectorPolicy = {
  schemaVersion: 1,
  revision: 'director-v1',
  enabled: true,
  pacing: {
    finaleLockPlayers: 5,
    minimumSpotlightGapDays: 0,
    preventSameSceneMajorEvents: true,
  },
  secretMissions: {
    enabled: true,
    first: {
      chance: 100,
      maxPlayers: 14,
      minPlayers: 11,
    },
    second: {
      chance: 40,
      maxPlayers: 10,
      minPlayers: 8,
      minimumGapDays: 2,
    },
  },
  doubleElimination: {
    enabled: true,
    seasonChance: 90,
    maxPerSeason: 1,
    maxPlayers: 10,
    minPlayers: 7,
  },
  specialSafety: {
    enabled: true,
    seasonChance: 30,
    maxPerSeason: 1,
    maxPlayers: 9,
    minPlayers: 6,
    weights: {
      vip: 1,
      diamond: 1,
      coup: 1,
      spotlight: 1,
    },
  },
  morningShock: {
    enabled: true,
    seasonChance: 20,
    maxPerSeason: 1,
    maxPlayers: 13,
    minPlayers: 8,
  },
  battleBack: {
    enabled: true,
    human: {
      guaranteedOpportunityAfterEviction: true,
      maxGuaranteedOpportunitiesPerSeason: 1,
      minimumActivePlayersAfterEviction: 5,
      minimumCandidates: 2,
    },
    aiOnly: {
      seasonChance: 35,
      maxPlayers: 9,
      minPlayers: 6,
      minimumCandidates: 3,
      maxPerSeason: 1,
    },
  },
  lifetimeSpecials: {
    twinShock: {
      enabled: true,
      countsAgainstShockBudget: false,
      allowWithOtherSeasonShocks: true,
      consumeOnlyAfterResolution: true,
    },
  },
}

let remoteDirectorConfig: RemoteSeasonDirectorConfig | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function percentage(value: unknown): number | undefined {
  const number = finiteNumber(value)
  return number === undefined ? undefined : Math.max(0, Math.min(100, number))
}

function integerInRange(value: unknown, min: number, max: number): number | undefined {
  const number = finiteNumber(value)
  return number === undefined ? undefined : Math.max(min, Math.min(max, Math.round(number)))
}

function nonNegativeWeight(value: unknown): number | undefined {
  const number = finiteNumber(value)
  return number === undefined ? undefined : Math.max(0, Math.min(1000, number))
}

function sanitiseWindow(
  raw: unknown,
  options: {
    chanceKey?: 'chance' | 'seasonChance'
    includeGap?: boolean
    includeCandidates?: boolean
  }
): RemoteDirectorWindow | undefined {
  if (!isRecord(raw)) return undefined
  const result: RemoteDirectorWindow = {}
  if (typeof raw.enabled === 'boolean') result.enabled = raw.enabled
  const minPlayers = integerInRange(raw.minPlayers, 2, 32)
  const maxPlayers = integerInRange(raw.maxPlayers, 2, 32)
  if (minPlayers !== undefined) result.minPlayers = minPlayers
  if (maxPlayers !== undefined) result.maxPlayers = maxPlayers
  if (options.chanceKey === 'chance') {
    const chance = percentage(raw.chance)
    if (chance !== undefined) result.chance = chance
  }
  if (options.chanceKey === 'seasonChance') {
    const chance = percentage(raw.seasonChance)
    if (chance !== undefined) result.seasonChance = chance
  }
  if (options.includeGap) {
    const minimumGapDays = integerInRange(raw.minimumGapDays, 0, 10)
    if (minimumGapDays !== undefined) result.minimumGapDays = minimumGapDays
  }
  if (options.includeCandidates) {
    const minimumCandidates = integerInRange(raw.minimumCandidates, 1, 32)
    if (minimumCandidates !== undefined) result.minimumCandidates = minimumCandidates
  }
  const maxPerSeason = integerInRange(raw.maxPerSeason, 0, 1)
  if (maxPerSeason !== undefined) result.maxPerSeason = maxPerSeason
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Keep only the pure-data Director fields that released clients understand.
 * Unknown future fields are ignored so older binaries remain safe.
 */
export function sanitiseRemoteSeasonDirectorConfig(
  raw: unknown
): RemoteSeasonDirectorConfig | undefined {
  if (!isRecord(raw)) return undefined

  const result: RemoteSeasonDirectorConfig = {}
  if (raw.schemaVersion === 1) result.schemaVersion = 1
  if (typeof raw.revision === 'string' && raw.revision.trim()) {
    result.revision = raw.revision.trim().slice(0, 120)
  }
  if (typeof raw.enabled === 'boolean') result.enabled = raw.enabled

  if (isRecord(raw.pacing)) {
    const pacing: NonNullable<RemoteSeasonDirectorConfig['pacing']> = {}
    const finaleLockPlayers = integerInRange(raw.pacing.finaleLockPlayers, 3, 8)
    if (finaleLockPlayers !== undefined) pacing.finaleLockPlayers = finaleLockPlayers
    const minimumSpotlightGapDays = integerInRange(raw.pacing.minimumSpotlightGapDays, 0, 5)
    if (minimumSpotlightGapDays !== undefined) {
      pacing.minimumSpotlightGapDays = minimumSpotlightGapDays
    }
    if (typeof raw.pacing.preventSameSceneMajorEvents === 'boolean') {
      pacing.preventSameSceneMajorEvents = raw.pacing.preventSameSceneMajorEvents
    }
    if (Object.keys(pacing).length > 0) result.pacing = pacing
  }

  if (isRecord(raw.secretMissions)) {
    const missions: NonNullable<RemoteSeasonDirectorConfig['secretMissions']> = {}
    if (typeof raw.secretMissions.enabled === 'boolean')
      missions.enabled = raw.secretMissions.enabled
    const first = sanitiseWindow(raw.secretMissions.first, { chanceKey: 'chance' })
    const second = sanitiseWindow(raw.secretMissions.second, {
      chanceKey: 'chance',
      includeGap: true,
    })
    if (first) missions.first = first
    if (second) missions.second = second
    if (Object.keys(missions).length > 0) result.secretMissions = missions
  }

  const doubleElimination = sanitiseWindow(raw.doubleElimination, {
    chanceKey: 'seasonChance',
  })
  if (doubleElimination) result.doubleElimination = doubleElimination

  if (isRecord(raw.specialSafety)) {
    const specialSafety: NonNullable<RemoteSeasonDirectorConfig['specialSafety']> = {
      ...(sanitiseWindow(raw.specialSafety, { chanceKey: 'seasonChance' }) ?? {}),
    }
    if (isRecord(raw.specialSafety.selection) && isRecord(raw.specialSafety.selection.weights)) {
      const weights: Partial<Record<SpecialVetoType, number>> = {}
      for (const type of ['vip', 'diamond', 'coup', 'spotlight'] as const) {
        const weight = nonNegativeWeight(raw.specialSafety.selection.weights[type])
        if (weight !== undefined) weights[type] = weight
      }
      if (Object.keys(weights).length > 0) specialSafety.selection = { weights }
    }
    if (Object.keys(specialSafety).length > 0) result.specialSafety = specialSafety
  }

  const morningShock = sanitiseWindow(raw.morningShock, { chanceKey: 'seasonChance' })
  if (morningShock) result.morningShock = morningShock

  if (isRecord(raw.battleBack)) {
    const battleBack: NonNullable<RemoteSeasonDirectorConfig['battleBack']> = {}
    if (typeof raw.battleBack.enabled === 'boolean') battleBack.enabled = raw.battleBack.enabled
    const legacyAiMaxPerSeason = integerInRange(raw.battleBack.maxPerSeason, 0, 1)
    if (legacyAiMaxPerSeason !== undefined) battleBack.maxPerSeason = legacyAiMaxPerSeason

    if (isRecord(raw.battleBack.human)) {
      const human: NonNullable<NonNullable<RemoteSeasonDirectorConfig['battleBack']>['human']> = {}
      if (typeof raw.battleBack.human.guaranteedOpportunityAfterEviction === 'boolean') {
        human.guaranteedOpportunityAfterEviction =
          raw.battleBack.human.guaranteedOpportunityAfterEviction
      }
      const maxGuaranteedOpportunitiesPerSeason = integerInRange(
        raw.battleBack.human.maxGuaranteedOpportunitiesPerSeason,
        0,
        1
      )
      if (maxGuaranteedOpportunitiesPerSeason !== undefined) {
        human.maxGuaranteedOpportunitiesPerSeason = maxGuaranteedOpportunitiesPerSeason
      }
      const minimumActivePlayersAfterEviction = integerInRange(
        raw.battleBack.human.minimumActivePlayersAfterEviction,
        2,
        16
      )
      if (minimumActivePlayersAfterEviction !== undefined) {
        human.minimumActivePlayersAfterEviction = minimumActivePlayersAfterEviction
      }
      const minimumCandidates = integerInRange(raw.battleBack.human.minimumCandidates, 1, 16)
      if (minimumCandidates !== undefined) human.minimumCandidates = minimumCandidates
      if (Object.keys(human).length > 0) battleBack.human = human
    }

    const aiOnly = sanitiseWindow(raw.battleBack.aiOnly, {
      chanceKey: 'seasonChance',
      includeCandidates: true,
    })
    if (aiOnly) {
      if (aiOnly.maxPerSeason === undefined && legacyAiMaxPerSeason !== undefined) {
        aiOnly.maxPerSeason = legacyAiMaxPerSeason
      }
      battleBack.aiOnly = aiOnly
    } else if (legacyAiMaxPerSeason !== undefined) {
      battleBack.aiOnly = { maxPerSeason: legacyAiMaxPerSeason }
    }
    if (Object.keys(battleBack).length > 0) result.battleBack = battleBack
  }

  if (isRecord(raw.lifetimeSpecials) && isRecord(raw.lifetimeSpecials.twinShock)) {
    const twinShock: NonNullable<
      NonNullable<RemoteSeasonDirectorConfig['lifetimeSpecials']>['twinShock']
    > = {}
    if (typeof raw.lifetimeSpecials.twinShock.enabled === 'boolean') {
      twinShock.enabled = raw.lifetimeSpecials.twinShock.enabled
    }
    if (Object.keys(twinShock).length > 0) {
      result.lifetimeSpecials = { twinShock }
    }
  }

  if (isRecord(raw.killSwitches)) {
    const killSwitches: NonNullable<RemoteSeasonDirectorConfig['killSwitches']> = {}
    for (const key of [
      'secretMissions',
      'doubleElimination',
      'specialSafety',
      'morningShock',
      'battleBack',
    ] as const) {
      if (typeof raw.killSwitches[key] === 'boolean') killSwitches[key] = raw.killSwitches[key]
    }
    if (Object.keys(killSwitches).length > 0) result.killSwitches = killSwitches
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function resolveWindow(
  remote: { minPlayers?: number; maxPlayers?: number } | undefined,
  fallback: SeasonDirectorWindow
): SeasonDirectorWindow {
  const lower = remote?.minPlayers ?? fallback.minPlayers
  const upper = remote?.maxPlayers ?? fallback.maxPlayers
  return {
    minPlayers: Math.min(lower, upper),
    maxPlayers: Math.max(lower, upper),
  }
}

function resolvePolicy(remote: RemoteSeasonDirectorConfig): SeasonDirectorPolicy {
  const defaults = DEFAULT_SEASON_DIRECTOR_POLICY
  const firstWindow = resolveWindow(remote.secretMissions?.first, defaults.secretMissions.first)
  const secondWindow = resolveWindow(remote.secretMissions?.second, defaults.secretMissions.second)
  const doubleWindow = resolveWindow(remote.doubleElimination, defaults.doubleElimination)
  const safetyWindow = resolveWindow(remote.specialSafety, defaults.specialSafety)
  const morningWindow = resolveWindow(remote.morningShock, defaults.morningShock)
  const battleBackAiWindow = resolveWindow(remote.battleBack?.aiOnly, defaults.battleBack.aiOnly)

  return {
    schemaVersion: 1,
    revision: remote.revision ?? defaults.revision,
    enabled: remote.enabled ?? defaults.enabled,
    pacing: {
      finaleLockPlayers: remote.pacing?.finaleLockPlayers ?? defaults.pacing.finaleLockPlayers,
      minimumSpotlightGapDays:
        remote.pacing?.minimumSpotlightGapDays ?? defaults.pacing.minimumSpotlightGapDays,
      preventSameSceneMajorEvents:
        remote.pacing?.preventSameSceneMajorEvents ?? defaults.pacing.preventSameSceneMajorEvents,
    },
    secretMissions: {
      enabled: remote.secretMissions?.enabled ?? defaults.secretMissions.enabled,
      first: {
        ...firstWindow,
        chance: remote.secretMissions?.first?.chance ?? defaults.secretMissions.first.chance,
      },
      second: {
        ...secondWindow,
        chance: remote.secretMissions?.second?.chance ?? defaults.secretMissions.second.chance,
        minimumGapDays:
          remote.secretMissions?.second?.minimumGapDays ??
          defaults.secretMissions.second.minimumGapDays,
      },
    },
    doubleElimination: {
      ...doubleWindow,
      enabled: remote.doubleElimination?.enabled ?? defaults.doubleElimination.enabled,
      seasonChance:
        remote.doubleElimination?.seasonChance ?? defaults.doubleElimination.seasonChance,
      maxPerSeason: 1,
    },
    specialSafety: {
      ...safetyWindow,
      enabled: remote.specialSafety?.enabled ?? defaults.specialSafety.enabled,
      seasonChance: remote.specialSafety?.seasonChance ?? defaults.specialSafety.seasonChance,
      maxPerSeason: 1,
      weights: {
        vip: remote.specialSafety?.selection?.weights?.vip ?? defaults.specialSafety.weights.vip,
        diamond:
          remote.specialSafety?.selection?.weights?.diamond ??
          defaults.specialSafety.weights.diamond,
        coup: remote.specialSafety?.selection?.weights?.coup ?? defaults.specialSafety.weights.coup,
        spotlight:
          remote.specialSafety?.selection?.weights?.spotlight ??
          defaults.specialSafety.weights.spotlight,
      },
    },
    morningShock: {
      ...morningWindow,
      enabled: remote.morningShock?.enabled ?? defaults.morningShock.enabled,
      seasonChance: remote.morningShock?.seasonChance ?? defaults.morningShock.seasonChance,
      maxPerSeason: 1,
    },
    battleBack: {
      enabled: remote.battleBack?.enabled ?? defaults.battleBack.enabled,
      human: {
        guaranteedOpportunityAfterEviction:
          remote.battleBack?.human?.guaranteedOpportunityAfterEviction ??
          defaults.battleBack.human.guaranteedOpportunityAfterEviction,
        maxGuaranteedOpportunitiesPerSeason: 1,
        minimumActivePlayersAfterEviction:
          remote.battleBack?.human?.minimumActivePlayersAfterEviction ??
          defaults.battleBack.human.minimumActivePlayersAfterEviction,
        minimumCandidates:
          remote.battleBack?.human?.minimumCandidates ??
          defaults.battleBack.human.minimumCandidates,
      },
      aiOnly: {
        ...battleBackAiWindow,
        seasonChance:
          remote.battleBack?.aiOnly?.seasonChance ?? defaults.battleBack.aiOnly.seasonChance,
        minimumCandidates:
          remote.battleBack?.aiOnly?.minimumCandidates ??
          defaults.battleBack.aiOnly.minimumCandidates,
        maxPerSeason: 1,
      },
    },
    lifetimeSpecials: {
      twinShock: {
        enabled:
          remote.lifetimeSpecials?.twinShock?.enabled ??
          defaults.lifetimeSpecials.twinShock.enabled,
        countsAgainstShockBudget: false,
        allowWithOtherSeasonShocks: true,
        consumeOnlyAfterResolution: true,
      },
    },
  }
}

function mixDirectorSeed(value: number): number {
  let mixed = value >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x7feb352d)
  mixed ^= mixed >>> 15
  mixed = Math.imul(mixed, 0x846ca68b)
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

function eventRoll(seed: number, season: number, salt: number): number {
  const seasonSalt = Math.imul(season, 0x9e3779b1)
  return mixDirectorSeed((seed ^ seasonSalt ^ salt) >>> 0) / 0x100000000
}

function rollChance(seed: number, season: number, salt: number, chance: number): boolean {
  return eventRoll(seed, season, salt) * 100 < chance
}

function chooseSpecialSafety(
  seed: number,
  season: number,
  weights: Record<SpecialVetoType, number>
): SpecialVetoType | null {
  const entries = (['vip', 'diamond', 'coup', 'spotlight'] as const).map((type) => ({
    type,
    weight: Math.max(0, weights[type]),
  }))
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return null
  let cursor = eventRoll(seed, season, 0x5a1e7f11) * total
  for (const entry of entries) {
    cursor -= entry.weight
    if (cursor < 0) return entry.type
  }
  return entries[entries.length - 1].type
}

export function setRemoteSeasonDirectorConfig(config: RemoteSeasonDirectorConfig | null): void {
  remoteDirectorConfig = config
}

export function getRemoteSeasonDirectorConfig(): RemoteSeasonDirectorConfig | null {
  return remoteDirectorConfig
}

export function isSeasonDirectorKillSwitched(key: SeasonDirectorKillSwitch): boolean {
  return remoteDirectorConfig?.killSwitches?.[key] === true
}

/**
 * Build a deterministic season-level plan from the currently active remote policy.
 * No plan is produced when Director orchestration has not been explicitly enabled
 * by remote config, preserving legacy/test behavior.
 */
export function buildSeasonDirectorPlan(
  season: number,
  seed: number
): SeasonDirectorPlan | undefined {
  if (!remoteDirectorConfig || remoteDirectorConfig.enabled !== true) return undefined
  const policy = resolvePolicy(remoteDirectorConfig)
  if (!policy.enabled) return undefined

  const doubleElimination =
    policy.doubleElimination.enabled &&
    rollChance(seed, season, 0xd0b1e001, policy.doubleElimination.seasonChance)
  const specialSafetySelected =
    policy.specialSafety.enabled &&
    rollChance(seed, season, 0x5a1e7001, policy.specialSafety.seasonChance)
  const specialSafetyType = specialSafetySelected
    ? chooseSpecialSafety(seed, season, policy.specialSafety.weights)
    : null

  return {
    schemaVersion: 1,
    revision: policy.revision,
    season,
    seed,
    policy,
    selections: {
      firstSecretMission:
        policy.secretMissions.enabled &&
        rollChance(seed, season, 0x51c1e001, policy.secretMissions.first.chance),
      secondSecretMission:
        policy.secretMissions.enabled &&
        rollChance(seed, season, 0x51c2e001, policy.secretMissions.second.chance),
      doubleElimination,
      specialSafetyType,
      morningShock:
        policy.morningShock.enabled &&
        rollChance(seed, season, 0x0a110001, policy.morningShock.seasonChance),
      aiBattleBack:
        policy.battleBack.enabled &&
        rollChance(seed, season, 0xba77b001, policy.battleBack.aiOnly.seasonChance),
    },
  }
}

export function isWithinDirectorWindow(
  aliveCount: number,
  window: SeasonDirectorWindow,
  finaleLockPlayers?: number
): boolean {
  if (finaleLockPlayers !== undefined && aliveCount <= finaleLockPlayers) return false
  return aliveCount >= window.minPlayers && aliveCount <= window.maxPlayers
}

export function hasDirectorSpotlightRoom(game: GameState): boolean {
  const plan = game.seasonDirectorPlan
  if (!plan) return true
  const lastDay = game.seasonDirectorLastSpotlightDay
  if (lastDay == null) return true
  const dayDifference = game.week - lastDay
  if (plan.policy.pacing.preventSameSceneMajorEvents && dayDifference <= 0) return false
  return dayDifference > plan.policy.pacing.minimumSpotlightGapDays
}
