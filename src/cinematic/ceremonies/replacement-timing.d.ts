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
  royal: boolean
  showAuthority: boolean
  reveals: { action: ReplacementAction; at: number }[]
}
type TimingOutcome = Pick<
  ReplacementPresentation,
  'actionHistory' | 'replacementIds' | 'chooserId' | 'variant' | 'pairUnits'
> &
  Partial<
    Pick<
      ReplacementPresentation,
      | 'leaderIds'
      | 'safetyHolderIds'
      | 'authorityPairs'
      | 'skipAuthority'
      | 'priorAuthorityId'
      | 'coLohIds'
    >
  > & { decisionOnly?: boolean; segment?: boolean; powerType?: string | null }
export function replacementBeats(outcome: TimingOutcome): ReplacementBeat[]
export function replacementDuration(outcome: TimingOutcome): number
export function authorityIds(
  outcome: ReplacementPresentation,
  id: string | null | undefined
): string[]
export function isRoyalAuthority(
  outcome: ReplacementPresentation,
  id: string | null | undefined
): boolean
