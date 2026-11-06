/** Serializable outcome shared by live games and campaign recovery. */
export interface ReactMinigameCompletion {
  authoritativeWinnerId?: string | null
  authoritativeWinnerIds?: string[]
  /** Authoritative worst finisher when the minigame owns its full standings. */
  authoritativeLastPlaceId?: string | null
  /** All contestants in the last-place tie group when the game supports ties. */
  authoritativeLastPlaceIds?: string[]
  /** Complete feature-owned ordering, best to worst. */
  authoritativeRankedIds?: string[]
  /** Placement groups that share a rank, best to worst. */
  authoritativeTiedGroups?: string[][]
  lastPlaceType?: 'scored' | 'survival'
  rawValue?: number
  rawResults?: Record<string, number>
  /** Optional time-based tie-breaker in ms (lower is better). */
  tiebreakerMs?: number
  /** Battery Low only: one-shot vote modifiers earned by contestants. */
  batteryLowVoteEffects?: Record<string, 'doubleVote' | 'skipVote'>
  /** Mystic Chamber only: relationship changes recorded with the outcome. */
  mysticChamberRelationships?: Array<{ source: string; target: string; delta: number }>
}

export interface CompetitionResult {
  rawValue: number
  partial: boolean
  completion?: ReactMinigameCompletion
}

export type CompetitionAttempt =
  | { number: number; status: 'ready' | 'playing' }
  | { number: number; status: 'finished' | 'accepted'; result: CompetitionResult }
