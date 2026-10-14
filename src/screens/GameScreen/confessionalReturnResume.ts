import type { Player } from '../../types'

export interface ConfessionalReturnLocationState {
  resumedFromConfessional?: boolean
  returnCue?: string
}

export type ConfessionalReturnGame = {
  phase: string
  mode?: string
  players: readonly Pick<Player, 'id' | 'isUser' | 'status'>[]
  votes?: Record<string, string>
  awaitingHumanVote?: boolean
  awaitingDoubleVoteOffer?: boolean
  awaitingTieBreak?: boolean
  awaitingFinal3Eviction?: boolean
  awaitingVoteDeductionPrompt?: boolean
  voteResults?: Record<string, number> | null
}

export function shouldAutomaticallyAdvanceAfterConfessionalVote(
  locationState: unknown,
  game: ConfessionalReturnGame,
  hasPendingConfessionalDecision: boolean
): boolean {
  if (!locationState || typeof locationState !== 'object') return false
  const routeState = locationState as ConfessionalReturnLocationState
  if (routeState.resumedFromConfessional !== true || routeState.returnCue !== 'live_vote') {
    return false
  }
  if (
    game.phase !== 'live_vote' ||
    game.mode === 'survival' ||
    hasPendingConfessionalDecision ||
    game.awaitingHumanVote ||
    game.awaitingDoubleVoteOffer ||
    game.awaitingTieBreak ||
    game.awaitingFinal3Eviction ||
    game.awaitingVoteDeductionPrompt ||
    game.voteResults != null
  ) {
    return false
  }

  const human = game.players.find(
    (player) => player.isUser && player.status !== 'evicted' && player.status !== 'jury'
  )
  return Boolean(human && typeof game.votes?.[human.id] === 'string')
}
