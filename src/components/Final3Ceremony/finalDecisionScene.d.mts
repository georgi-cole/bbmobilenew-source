import type { CeremonyCrownAnchor } from '../../cinematic/ceremonies/runtime.mjs'

export type FinalDecisionSceneStage =
  | 'welcome'
  | 'establish'
  | 'plea-a'
  | 'plea-b'
  | 'choose'
  | 'confirm'
  | 'seal'
  | 'announcement'
  | 'complete'

export interface FinalDecisionOutcome {
  sceneId: string
  holderId: string
  evicteeId: string
  keptId: string
}

export interface FinalDecisionCheckpoint {
  stage: FinalDecisionSceneStage
  selectedId: string | null
  confirmedId: string | null
  keptId: string | null
  paused: boolean
  pauseReasons: string[]
  decisionCount: number
  completionCount: number
  isolatedPlayerId: string | null
  run: number
  reducedMotion: boolean
  disposed: boolean
}

export interface FinalDecisionSceneConfig {
  sceneId: string
  preview: boolean
  reducedMotion?: boolean
  fixture: {
    holder: { id: string; name: string }
    nominees: Array<{
      id: string
      name: string
      assetKey: string
      plea: string
      comparison?: string
    }>
  }
  assets: Record<string, string>
  holderCrownAnchor?: CeremonyCrownAnchor
  monitor: {
    aspectRatio: number
    screen: { x: number; y: number; width: number; height: number }
  }
  onDecision: (outcome: FinalDecisionOutcome) => void
  onComplete: (outcome: FinalDecisionOutcome) => void
  onCheckpoint: (checkpoint: FinalDecisionCheckpoint) => void
  onCue?: (event: { cue: string; sceneId?: string }) => void
}

export interface FinalDecisionController {
  pause(reason?: string): void
  resume(reason?: string): void
  skip(): void
  dispose(): void
  getState(): FinalDecisionCheckpoint
}

export function mountFinalDecision(
  root: HTMLElement,
  config: FinalDecisionSceneConfig
): FinalDecisionController
