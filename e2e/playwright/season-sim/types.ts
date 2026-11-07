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
  /** Present when this run belongs to a repeatable multi-season batch. */
  batchId?: string
  /** One-based run number within batchId. */
  runIndex?: number
  /** Total number of runs requested for this batch. */
  batchRuns?: number
  mode: SeasonSimulationMode
  entitlement: SimulationEntitlement
  personaId: string
  seeds: SimulationSeeds
  viewport: 'iphone-17' | 'compact-mobile'
  objectives: readonly ScenarioObjective[]
  maxActions: number
  maxDays: number
  competitionSkill: SimulationSkill
  /** Forfeit competitions through the visible game menu to speed up season runs. */
  skipCompetitions?: boolean
  /** Resolve required decisions, but do not open optional Confessional entries. */
  skipOptionalConfessionals?: boolean
  /** Continue to the season-ending presentation as a spectator after the player is eliminated. */
  continueToSeasonComplete?: boolean
  /** Save from the visible Home control, reload the browser, and resume on this day. */
  saveResumeAtDay?: number
  /** Queue a double elimination through the visible QA controls at launch. */
  forceDoubleElimination?: boolean
  /** Resume a saved browser checkpoint through the normal Continue Last control. */
  assistedCheckpoint?: string
  /** Persist reusable Day 5, Day 10, and finale browser saves in this directory. */
  checkpointCaptureDir?: string
  /** Skip the final full-page screenshot for high-volume calibration batches. */
  captureFinalScreenshot?: boolean
  /** Keep only calibration-relevant report data instead of the full final Redux state/timeline. */
  compactEconomyReport?: boolean
  /** Enable bounded browser timing samples at seeded early and late season checkpoints. */
  performanceBenchmark?: boolean
  /** Fast-forward setup days through visible QA controls before a measured window. */
  journeyAcceleration?: { fromDay: number; toDay: number }
  /** Record snapshot sections and save/reload/resume timing at the visible save checkpoint. */
  captureSaveResumePerformance?: boolean
  /** Capture recent gameplay and save diagnostics at these one-based game days. */
  progressionPerformanceDays?: readonly number[]
  /** Reduce layout audits during long diagnostic runs. Defaults to the normal smoke cadence. */
  checkpointEveryActions?: number
}

export interface SeasonPerformanceCheckpoint {
  name: 'early' | 'late'
  day: number
  week: number
  phase: string
  activePlayerCount: number
  historyCount: number
  tvFeedCount: number
  sampleCounts: {
    frameGaps: number
    inputResponses: number
    reduxActions: number
  }
  metrics: {
    frameGapP95Ms: number | null
    inputResponseP95Ms: number | null
    reduxActionP95Ms: number | null
  }
  longestFrameGapMs: number | null
  frameGapsOver100Ms: number
}

export interface SaveResumePerformanceCheckpoint {
  mode: SeasonSimulationMode
  day: number
  phase: string
  seed: SimulationSeeds
  snapshot: {
    totalBytes: number
    sections: Record<string, number>
    counts: Record<string, number>
  }
  persistence: {
    lastSnapshotBytes: number
    lastSerializeMs: number
    lastWriteMs: number
    warningThresholdBytes: number
    blockedReason: string | null
  } | null
  timing: {
    saveAndHomeMs: number
    reloadToHomeMs: number
    resumeToGameMs: number
    reloadAndResumeMs: number
  }
}

export interface ProgressionPerformanceCheckpoint {
  mode: SeasonSimulationMode
  day: number
  phase: string
  seed: SimulationSeeds
  snapshot: SaveResumePerformanceCheckpoint['snapshot']
  persistence: SaveResumePerformanceCheckpoint['persistence']
  sampleCounts: SeasonPerformanceCheckpoint['sampleCounts']
  metrics: SeasonPerformanceCheckpoint['metrics']
  longestFrameGapMs: number | null
  frameGapsOver100Ms: number
  longTasks: { count: number; p95Ms: number | null; longestMs: number | null }
  storeUpdateP95Ms: number | null
  middlewareSteps: Array<{
    middleware: string
    count: number
    totalMs: number
    p95Ms: number
    longestMs: number
  }>
  phaseSteps: Array<{
    step: string
    count: number
    totalMs: number
    p95Ms: number
    longestMs: number
  }>
  renders: Array<{
    component: string
    count: number
    totalMs: number
    p95Ms: number
    longestMs: number
  }>
  slowestActions: Array<{ action: string; durationMs: number }>
  slowestStoreUpdates: Array<{ action: string; durationMs: number }>
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

export interface SimulationSeasonOutcome {
  resolved: boolean
  terminal: string
  humanId: string | null
  humanName: string | null
  humanStatus: string | null
  humanPlacement: number | null
  humanWon: boolean
  humanMadeJury: boolean
  humanReachedFinalThree: boolean
  winnerId: string | null
  winnerName: string | null
  humanLohWins: number
  humanPosWins: number
  humanNominations: number
  aiSocialActions?: number
  aiOnlyFactionCount: number
  aiOnlyPactCount: number
  aiStrategyMeetings: number
  aiCoordinatedTargetMoves: number
  aiAllianceDefections: number
  aiAllianceLeaks: number
  aiRomances: number
  activePlayerCount: number
  week: number
}

export interface SimulationReport {
  schemaVersion: 1
  config: SimulationRunConfig
  startedAt: string
  finishedAt: string
  durationMs?: number
  actionCount?: number
  terminal: string
  outcome?: SimulationSeasonOutcome
  timeline?: TimelineEntry[]
  findings: SimulationFinding[]
  objectives?: ObjectiveResult[]
  checkpoints?: Array<{ name: string; phase: string; day: number }>
  economySample?: SimulationEyeoleanSample
  performanceCheckpoints?: SeasonPerformanceCheckpoint[]
  finalState?: Pick<RootState, 'game' | 'challenge' | 'social' | 'vip'>
}

export interface SimulationContext {
  readonly page: Page
  readonly testInfo: TestInfo
  readonly config: SimulationRunConfig
  readonly startedAtMs: number
}
