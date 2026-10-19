import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseStrategicEliminationCandidates,
  createInitialGameState,
  submitDoubleEvictionTieBreak,
} from '../gameSlice'
import type { GameState, Player } from '../../types'

function prepareDecisionState(): {
  state: GameState
  decider: Player
  target: Player
  neutral: Player
  protectedPlayer: Player
} {
  const state = createInitialGameState({ seed: 812 })
  state.week = 6
  state.dramaSocialMode = false
  state.strategicAlliances = undefined
  const decider = state.players.find((player) => !player.isUser)!
  const [target, neutral, protectedPlayer] = state.players
    .filter((player) => player.id !== decider.id)
    .slice(0, 3)
  if (!target || !neutral || !protectedPlayer) throw new Error('Expected three candidates')

  for (const player of state.players) {
    player.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    player.competitionProfile = undefined
  }
  state.strategicRelationships = {
    [decider.id]: {
      [target.id]: { affinity: -35, tags: ['target'] },
      [neutral.id]: { affinity: 0, tags: [] },
      [protectedPlayer.id]: { affinity: 55, tags: ['alliance'] },
    },
  }
  return { state, decider, target, neutral, protectedPlayer }
}

describe('shared strategic elimination decisions', () => {
  it('prefers the strongest strategic target and reserves seeded variation for close scores', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    const candidateIds = [target.id, protectedPlayer.id]

    for (const seed of [1, 17, 1001]) {
      const decision = chooseStrategicEliminationCandidates(
        state,
        decider.id,
        candidateIds,
        1,
        'ordinary_tie',
        seed
      )
      expect(decision.selectedIds).toEqual([target.id])
    }
  })

  it('lets an active protection promise outweigh an ordinary target preference', () => {
    const { state, decider, target, neutral } = prepareDecisionState()
    state.strategicRelationships![decider.id][target.id] = {
      affinity: -25,
      tags: ['target', 'safety_promise'],
    }

    const decision = chooseStrategicEliminationCandidates(
      state,
      decider.id,
      [target.id, neutral.id],
      1,
      'ordinary_tie',
      22
    )

    expect(decision.selectedIds).toEqual([neutral.id])
    expect(
      decision.rankedCandidates.find((candidate) => candidate.id === target.id)?.factors
    ).toMatchObject({ promiseProtection: -92 })
  })

  it('includes learned jealousy weight and its evidence in the decision record', () => {
    const { state, decider, target, neutral, protectedPlayer } = prepareDecisionState()
    state.dramaSocialMode = true
    state.strategicRelationships![decider.id][target.id] = {
      affinity: 0,
      tags: [],
      knownRomanticRival: {
        partnerId: protectedPlayer.id,
        evidenceDay: 5,
        confidence: 0.72,
        source: 'witnessed',
      },
    }

    const decision = chooseStrategicEliminationCandidates(
      state,
      decider.id,
      [target.id, neutral.id],
      1,
      'ordinary_tie',
      28
    )
    const rivalDecision = decision.rankedCandidates.find((candidate) => candidate.id === target.id)

    expect(rivalDecision?.factors).toMatchObject({
      knownRomanticRivalJealousy: 32,
      jealousyPartnerId: protectedPlayer.id,
      jealousyEvidenceDay: 5,
      jealousyEvidenceConfidence: 0.72,
      jealousyEvidenceSource: 'witnessed',
    })
  })

  it('uses the shared model when an AI Leader breaks an ordinary vote tie', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    decider.status = 'loh'
    state.lohId = decider.id
    state.phase = 'live_vote'
    state.nomineeIds = [target.id, protectedPlayer.id]
    target.status = 'nominated'
    protectedPlayer.status = 'nominated'
    const voters = state.players.filter(
      (player) =>
        player.id !== decider.id &&
        !state.nomineeIds.includes(player.id) &&
        player.status !== 'evicted' &&
        player.status !== 'jury'
    )
    voters.slice(0, 4).forEach((voter, index) => {
      state.votes![voter.id] = index % 2 === 0 ? target.id : protectedPlayer.id
    })

    const result = gameReducer(state, advance())

    expect(result.phase).toBe('eviction_results')
    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.pendingEviction?.evictionMessage).toContain('breaks the tie')
  })

  it('resolves an AI double tie using the strategic ranking rather than the submitted UI order', () => {
    const { state, decider, target, neutral, protectedPlayer } = prepareDecisionState()
    decider.status = 'loh'
    state.lohId = decider.id
    state.phase = 'eviction_results'
    state.nomineeIds = [target.id, neutral.id, protectedPlayer.id]
    state.tiedNomineeIds = [...state.nomineeIds]
    state.awaitingTieBreak = true
    state.doubleEviction = {
      usedCount: 1,
      weekActive: true,
      pendingSecondEviction: null,
    }
    for (const nominee of [target, neutral, protectedPlayer]) nominee.status = 'nominated'

    const result = gameReducer(
      state,
      submitDoubleEvictionTieBreak([protectedPlayer.id, neutral.id])
    )

    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.doubleEviction?.pendingSecondEviction?.evicteeId).toBe(neutral.id)
    expect(result.awaitingTieBreak).toBe(false)
  })

  it('uses the same strategic ranking for an AI Safety holder’s Final Four sole vote', () => {
    const { state, decider, target, protectedPlayer } = prepareDecisionState()
    decider.status = 'active'
    state.posWinnerId = decider.id
    state.lohId = null
    state.phase = 'final4_eviction'
    state.nomineeIds = [target.id, protectedPlayer.id]
    target.status = 'nominated'
    protectedPlayer.status = 'nominated'

    const result = gameReducer(state, advance())

    expect(result.pendingEviction?.evicteeId).toBe(target.id)
    expect(result.pendingEviction?.evictionMessage).toContain('chosen to eliminate')
  })
})
