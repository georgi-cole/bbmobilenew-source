import type { ReplacementAction, ReplacementPresentation } from './replacementPresentation'
export interface ReplacementBeat {
  kind: ReplacementAction['kind']
  actorId: string | null
  actions: ReplacementAction[]
  index: number
  shotStart: number
  shotEnd: number
  revealAt: number
  end: number
}
type TimingOutcome = Pick<
  ReplacementPresentation,
  'actionHistory' | 'replacementIds' | 'chooserId' | 'variant' | 'pairUnits'
> & { decisionOnly?: boolean; segment?: boolean; powerType?: string | null }
export function replacementBeats(outcome: TimingOutcome): ReplacementBeat[]
export function replacementDuration(outcome: TimingOutcome): number
