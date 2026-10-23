import { describe, expect, it } from 'vitest'
import type { StrategicAllianceSnapshot } from '../../types'
import gameReducer, { advance, createInitialGameState } from '../gameSlice'

function democraciaVoteForSeed(
  seed: number,
  personalAgenda = false
): { allyVote: string; allyId: string; outsiderId: string } {
  const state = createInitialGameState({ seed })
  const [actor, ally, outsider] = state.players
  if (!actor || !ally || !outsider) throw new Error('Democracia needs at least three players')

  state.players = state.players.map((player) => ({
    ...player,
    status: [actor.id, ally.id, outsider.id].includes(player.id) ? 'active' : 'evicted',
    isUser: false,
  }))
  state.phase = 'loh_comp_announcement'
  state.democracia = {
    ...state.democracia!,
    active: true,
    activatedDay: state.week,
  }
  state.strategicAlliances = [
    {
      id: 'pact-alpha',
      memberIds: [actor.id, ally.id],
      leaderIds: [ally.id],
      status: 'ACTIVE',
      cohesion: 0.96,
      fractureRisk: 0.04,
      currentTargetIds: [],
      fallbackTargetIds: [],
      memberCommitment: { [actor.id]: 0.98, [ally.id]: 0.99 },
      memberPerceivedStatus: { [actor.id]: 'CORE', [ally.id]: 'CORE' },
      memberPlanBeliefs: {},
      infiltratorIds: [],
    } satisfies StrategicAllianceSnapshot,
  ]
  state.strategicRelationships = personalAgenda
    ? { [actor.id]: { [ally.id]: { affinity: -90, tags: ['rivalry', 'betrayal'] } } }
    : {}

  const next = gameReducer(state, advance())
  return {
    allyVote: next.democracia?.votesByVoterId[actor.id] ?? '',
    allyId: ally.id,
    outsiderId: outsider.id,
  }
}

describe('Democracia pact and alliance targeting', () => {
  it('usually keeps the office inside a committed pact', () => {
    let pactVotes = 0
    let outsiderVotes = 0

    for (let seed = 1; seed <= 48; seed++) {
      const { allyVote, allyId, outsiderId } = democraciaVoteForSeed(seed)
      if (allyVote === outsiderId) outsiderVotes += 1
      else if (allyVote === allyId) pactVotes += 1
    }

    expect(pactVotes).toBeGreaterThan(outsiderVotes)
  })

  it('lets an explicit personal rivalry shift votes away from a pact member', () => {
    let pactVotes = 0
    let outsiderVotes = 0

    for (let seed = 1; seed <= 48; seed++) {
      const { allyVote, allyId, outsiderId } = democraciaVoteForSeed(seed, true)
      if (allyVote === outsiderId) outsiderVotes += 1
      else if (allyVote === allyId) pactVotes += 1
    }

    expect(outsiderVotes).toBeGreaterThan(0)
    expect(pactVotes).toBeGreaterThan(0)
  })
})
