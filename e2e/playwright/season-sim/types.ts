import type { Page, TestInfo } from '@playwright/test'

import type { RootState } from '../../../src/store/store'
import type { EyeoleanRewardLine } from '../../../src/economy/eyeoleans'
import type { PlayerSeasonSummary } from '../../../src/store/seasonArchive'

export const SEASON_SIMULATION_MODES = ['classic', 'voxPopuli', 'cupidArrow', 'survival'] as const
export type SeasonSimulationMode = (typeof SEASON_SIMULATION_MODES)[number]

export type SimulationEntitlement = 'normal' | 'vip'
export type SimulationSkill = 'competent' | 'mediocre' | 'thrower'
export type FindingCategory = 'technical' | 'logic' | 'ui' | 'accessibility' | 'balance'
export type FindingSeverity = 'error' | 'warning' | 'observation'
export type ObjectiveStatus = 'verified' | 'missed' | 'not-attempted' | 'invalid' | 'assisted'

export interface SimulationSeeds {
  roster: number
  season: number
  actor: number
}

export interface ScenarioObjective {
  id: string
  description: string
  modules: readonly string[]
  appliesTo?: readonly SeasonSimulationMode[]
  requiresVip?: boolean
  /** Objectives needing an engineered checkpoint must never be reported as a fresh journey. */
  assistedOnly?: boolean
}

export interface PersonaTendencies {
  sociability: number
  loyalty: number
  betrayal: number
  risk: number
  competitionEffort: number
  resourceSpending: number
  romance: number
  conflict: number
  informationSeeking: number
}

export interface PersonaDefinition {
  id: string
  label: string
  description: string
  tendencies: PersonaTendencies
}

export interface SimulationRunConfig {
  id: string
  mode: SeasonSimulationMode
  entitlement: SimulationEntitlement
  personaId: string
  seeds: SimulationSeeds
  viewport: 'iphone-17' | 'compact-mobile'
  objectives: readonly ScenarioObjective[]
  maxActions: number
  maxDays: number
  competitionSkill: SimulationSkill
  /** Smoke journeys only use normal UI. Full runs may resume an audited checkpoint. */
  assistedCheckpoint?: string
}

export interface SimulationAction {
  id: string
  label: string
  module: string
  perform(page: Page): Promise<void>
}

export interface SimulationFinding {
  category: FindingCategory
  severity: FindingSeverity
  message: string
  phase: string
  day: number
  details?: Record<string, unknown>
}

export interface TimelineEntry {
  atMs: number
  action: string
  module: string
  phase: string
  day: number
  note?: string
}

export interface ObjectiveResult {
  id: string
  description: string
  status: ObjectiveStatus
  evidence?: string
}


export interface SimulationEyeoleanSample {
  source: 'archive' | 'season-complete'
  season: number
  seasonId?: string
  playerId: string
  summary: PlayerSeasonSummary
  rewards: EyeoleanRewardLine[]
  total: number
}

export interface SimulationReport {
  schemaVersion: 1
  config: SimulationRunConfig
  startedAt: string
  finishedAt: string
  terminal: string
  timeline: TimelineEntry[]
  findings: SimulationFinding[]
  objectives: ObjectiveResult[]
  checkpoints: Array<{ name: string; phase: string; day: number }>
  economySample?: SimulationEyeoleanSample
  finalState: Pick<RootState, 'game' | 'challenge' | 'social' | 'vip'>
}

export interface SimulationContext {
  readonly page: Page
  readonly testInfo: TestInfo
  readonly config: SimulationRunConfig
  readonly startedAtMs: number
}
