/** Serializable outcome, shared by live games and campaign recovery. */
export interface ReactMinigameCompletion {
  authoritativeWinnerId?: string | null
  authoritativeWinnerIds?: string[]
  authoritativeLastPlaceId?: string | null
  lastPlaceType?: 'scored' | 'survival'
  authoritativeRankedIds?: string[]
  rawValue?: number
  rawResults?: Record<string, number>
  tiebreakerMs?: number
  batteryLowVoteEffects?: Record<string, 'doubleVote' | 'skipVote'>
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
