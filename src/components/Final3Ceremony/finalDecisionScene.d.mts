import type { CeremonyCrownAnchor } from '../../cinematic/ceremonies/runtime.mjs'

export type FinalDecisionSceneStage =
  | 'welcome'
  | 'establish'
  | 'plea-a'
  | 'plea-b'
  | 'appeal'
  | 'vote-closed'
  | 'vote-results'
  | 'approval-tiebreak'
  | 'deliberate'
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
  decisionMode?: 'interactive' | 'automatic' | 'audience'
  viewerRole?: 'holder' | 'immune' | 'nominee' | 'spectator'
  canSkip?: boolean
  awaitingVote?: boolean
  appealId?: FinalAudienceAppealId | null
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

export type FinalAudienceAppealId = 'underdog' | 'loyalty' | 'resume'

export interface FinalAudienceVoteResult {
  /** Supplied by the game, including when displayed percentages are tied. */
  evicteeId: string
  /** Actual elimination-vote percentages, already on a 0–100 scale. */
  percentages: Record<string, number>
  /** Only supply a genuine, separately resolved approval tiebreak. */
  approvalTiebreak?: { scores: Record<string, number> }
}

export interface FinalDecisionSceneConfig {
  sceneId: string
  preview: boolean
  reducedMotion?: boolean
  initiallyPaused?: boolean
  /** The game's existing resolved outcome for a non-interactive broadcast. */
  automaticDecision?: { evicteeId: string; reason?: string }
  /** Continuous Vox presentation, optionally beginning before the vote resolves. */
  audienceVote?: {
    result?: FinalAudienceVoteResult
    appeal?: {
      playerId: string
      choices: Array<{
        id: FinalAudienceAppealId
        title: string
        copy: string
        speech: string
      }>
    }
  }
  /** The actual user, including a nominee or an off-stage spectator. */
  viewerId?: string
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
  onAppeal?: (appeal: FinalAudienceAppealId) => void
  /** The adapter resolves the real vote, then calls setAudienceVote. */
  onVoteRequested?: () => void
}

export interface FinalDecisionController {
  pause(reason?: string): void
  resume(reason?: string): void
  skip(): void
  dispose(): void
  getState(): FinalDecisionCheckpoint
  /** Latches the first valid result without calculating or altering an outcome. */
  setAudienceVote(result: FinalAudienceVoteResult): boolean
}

export function mountFinalDecision(
  root: HTMLElement,
  config: FinalDecisionSceneConfig
): FinalDecisionController
